import { plainText, walkElements, type Slide } from '@slidr/model';
import {
  Button,
  cx,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  TextField,
} from '@slidr/ui';
import { Link, Unlink } from '@slidr/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createStore } from 'zustand/vanilla';
import { useDeck, type ContextToolProps } from '../../shell';
import { linkTarget, setLink, type TextTarget } from '../actions';
import { orNull } from '../format';
import { linkedSlide, slideLink, typedLink } from '../paste';
import { closeToText, keepFocus, LINK_KEYS, useCompact, useText, type Text } from './shared';

/* Row B for text: a link to a web address or to a slide of the deck (WG4-T09, TXT-09). */

/** Ctrl+K asks for the link popover; the tool in row B is what opens it. */
const requests = createStore<{ count: number }>(() => ({ count: 0 }));

export function requestLink(): void {
  requests.setState((s) => ({ count: s.count + 1 }));
}

/**
 * Whether a target has text a link can be put on (TXT-09): the text that is being edited, a
 * selected text box, the selected cells of a table, and a selected shape when it has text. Not
 * several elements at once: a link is one text's.
 */
export function linksText(target: TextTarget): boolean {
  if (target.kind === 'elements') return false;
  if (target.kind !== 'element' || target.element.type !== 'shape') return true;
  return plainText(target.element.content ?? { paragraphs: [] }) !== '';
}

/**
 * The link the popover is about: the one the caret is in, or the one all of the selection has.
 * `linkable` is false when a caret is at neither a link nor a word: there is nothing to link.
 */
function currentLink(text: Text): { link: string | null; linkable: boolean } {
  const { target, format } = text;
  if (target.kind !== 'editor') return { link: orNull(format.link), linkable: true };
  const range = linkTarget(target.view.state);
  return { link: range?.link ?? orNull(format.link), linkable: range !== null };
}

const TITLE_LENGTH = 40;

/** What a slide is called in the list: its name, or else its title or its first text. */
function slideTitle(slide: Slide): string {
  const texts = [...walkElements(slide.elements)].filter((element) => element.type === 'text');
  const title = texts.find((element) => element.role === 'title') ?? texts[0];
  const text = (slide.name ?? (title ? plainText(title.content) : '')).split('\n')[0]?.trim() ?? '';
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text;
}

type Kind = 'url' | 'slide';

function LinkForm({ text, link, close }: { text: Text; link: string | null; close: () => void }) {
  const { t } = useTranslation('text');
  const slides = useDeck((s) => s.deck.slides);
  const linked = linkedSlide(link);
  const [kind, setKind] = useState<Kind>(linked ? 'slide' : 'url');
  const [address, setAddress] = useState(linked || !link ? '' : link);
  const [slideId, setSlideId] = useState(slides.some((s) => s.id === linked) ? linked : undefined);
  const [refused, setRefused] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // Choosing "web address" puts the keyboard in the field.
  useEffect(() => {
    if (kind === 'url') field.current?.focus();
  }, [kind]);

  const apply = () => {
    const next = kind === 'slide' ? slideId && slideLink(slideId) : typedLink(address);
    if (!next) return setRefused(kind === 'url');
    if (setLink(text.target, next, { label: t('step.link') })) close();
  };
  const remove = () => {
    if (setLink(text.target, null, { label: t('step.unlink') })) close();
  };

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<Kind>
        size="sm"
        fill
        aria-label={t('link.kind')}
        options={[
          { value: 'url', label: t('link.url') },
          { value: 'slide', label: t('link.slide') },
        ]}
        value={kind}
        onValueChange={setKind}
      />
      {kind === 'url' ? (
        <TextField
          ref={field}
          label={t('link.address')}
          dir="ltr"
          placeholder="https://"
          spellCheck={false}
          value={address}
          error={refused ? t('link.refused') : undefined}
          onChange={(event) => {
            setAddress(event.target.value);
            setRefused(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Done here: the key must not go on to type a line break in the text.
            event.preventDefault();
            apply();
          }}
        />
      ) : (
        <Select
          aria-label={t('link.slide')}
          placeholder={t('link.pickSlide')}
          options={slides.map((slide, i) => {
            const title = slideTitle(slide);
            const n = i + 1;
            return {
              value: slide.id,
              label: title ? t('link.slideTitle', { n, title }) : t('link.slideNumber', { n }),
            };
          })}
          value={slideId ?? null}
          onValueChange={setSlideId}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        {link ? (
          <Button variant="ghost" size="sm" icon={Unlink} onClick={remove}>
            {t('link.remove')}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={kind === 'url' ? !address.trim() : !slideId}
          onClick={apply}
        >
          {t('link.apply')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The link of the text: on the editor's selection, or on all the text of a selected text box, of
 * a selected shape, or of the selected cells of a table. With the caret inside a link and nothing
 * selected, it is that whole link; inside a plain word, the word.
 *
 * The row of a table is full at 1366 (SPEC 4.4), and has no room for the button there: the
 * popover then opens from its place in the row, for Ctrl+K and for the menu of the text.
 */
export function LinkTool({ kind }: Partial<ContextToolProps>) {
  const { t } = useTranslation('text');
  const text = useText();
  const compact = useCompact();
  const [open, setOpen] = useState(false);
  const current = text && linksText(text.target) ? currentLink(text) : null;
  // Ctrl+K opens the popover only when there is something to link right now. A request that
  // could not be shown is forgotten: kept, it would open the popover later, in the middle of
  // typing, when the caret came to stand in a word.
  const can = useRef(false);
  useEffect(() => {
    can.current = Boolean(current?.linkable);
  });
  useEffect(
    () =>
      requests.subscribe(() => {
        if (can.current) setOpen(true);
      }),
    [],
  );
  // And a popover whose text went away under it (an undo, another selection) is closed for good.
  if (open && !current?.linkable) setOpen(false);
  if (!text || !current) return null;
  const { link, linkable } = current;
  return (
    <Popover open={open && linkable} onOpenChange={setOpen}>
      {kind === 'table' && compact ? (
        <PopoverAnchor asChild>
          {/* No width, and none of the gap between the tools of its group. */}
          <span aria-hidden data-testid="link-anchor" className="-ms-0.5 h-control-sm w-0" />
        </PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <IconButton
            size="sm"
            icon={Link}
            label={t('link.label')}
            shortcut={LINK_KEYS}
            disabled={!linkable}
            data-linked={link !== null}
            className={cx(link !== null && 'bg-ui-accent-soft text-ui-accent-fg')}
            onMouseDown={keepFocus}
          />
        </PopoverTrigger>
      )}
      <PopoverContent
        // The keyboard starts in the address field, which the popover is for; with a slide
        // chosen it starts on the popover itself, so that Esc closes it and not the text.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const popover = event.currentTarget as HTMLElement;
          (popover.querySelector('input') ?? popover).focus({ preventScroll: true });
        }}
        onCloseAutoFocus={closeToText}
        className="focus-visible:outline-none"
      >
        <LinkForm text={text} link={link} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
