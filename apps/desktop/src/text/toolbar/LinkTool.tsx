import { plainText, walkElements, type Slide } from '@slidr/model';
import {
  Button,
  cx,
  IconButton,
  Popover,
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
import { useDeck } from '../../shell';
import { linkTarget, setLink } from '../actions';
import { orNull } from '../format';
import { linkedSlide, slideLink, typedLink } from '../paste';
import { closeToText, keepFocus, LINK_KEYS, useText, type Text } from './shared';

/* Row B for text: a link to a web address or to a slide of the deck (WG4-T09, TXT-09). */

/** Ctrl+K asks for the link popover; the tool in row B is what opens it. */
const requests = createStore<{ count: number }>(() => ({ count: 0 }));

export function requestLink(): void {
  requests.setState((s) => ({ count: s.count + 1 }));
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
 * The link of the text: on the editor's selection, or on all the text of a selected box. With the
 * caret inside a link and nothing selected, it is that whole link; inside a plain word, the word.
 */
export function LinkTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const [open, setOpen] = useState(false);
  useEffect(() => requests.subscribe(() => setOpen(true)), []);
  if (!text) return null;
  const { link, linkable } = currentLink(text);
  return (
    <Popover open={open && linkable} onOpenChange={setOpen}>
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
