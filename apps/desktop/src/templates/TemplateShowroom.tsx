import type { Deck, Theme } from '@slidr/model';
import { fontStack, ScaledSlide } from '@slidr/renderer';
import { Button, cx, Icon, ScrollArea, Spinner } from '@slidr/ui';
import { Check, Sparkles } from '@slidr/ui/icons';
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { library } from './app';
import { coverAsset, coverOf } from './covers';
import type { LibraryEntry } from './library';
import { templateName, templateTagline } from './names';
import { PreviewGrid, useLaidOutSize, usePreviewLayers } from './PreviewGrid';

/*
 * The templates of the welcome screen (DOC-05), once "Create from template" was chosen: the
 * covers to pick from, beside every slide of the one that is picked, all seen at once as the
 * Templates panel spreads them over the editor (`./PreviewGrid`). Picking a cover shows its
 * slides, which fade in over those of the one before; the button over them, or a double click on
 * the cover, starts the deck. The arrow keys walk the covers.
 *
 * The slides are in the language and direction the new deck will have (`like`), which is the
 * UI's and not that of a document the screen may stand over.
 */

/** Space between two covers of the rail, in px: `gap-x-3`. */
const COVER_GAP = 12;

/** The colours of a template that tell it at a glance: its ground, then the three it is drawn in. */
function swatches(theme: Theme): string[] {
  const { bg, primary, secondary, accent } = theme.colors;
  return [bg, primary, secondary, accent];
}

function Cover({
  entry,
  like,
  width,
  picked,
  onPick,
  onCreate,
}: {
  entry: LibraryEntry;
  like: Deck;
  width: number;
  picked: boolean;
  onPick: () => void;
  onCreate: () => void;
}) {
  const { i18n } = useTranslation();
  const { template } = entry;
  const { theme } = template;
  const cover = useMemo(
    () => coverOf(library.forDeck(theme.id, like.meta.lang) ?? template, like),
    [template, theme.id, like],
  );
  return (
    <button
      type="button"
      role="radio"
      data-welcome-template={theme.id}
      aria-checked={picked}
      // Only the picked cover is in the tab order; the arrow keys walk the others.
      tabIndex={picked ? 0 : -1}
      onClick={onPick}
      onDoubleClick={onCreate}
      className="group flex min-w-0 cursor-default flex-col gap-1.5 rounded-control text-start"
    >
      {/* The cover is a picture, with every word of its slide: the card is named by its name. */}
      <span
        aria-hidden
        className={cx(
          'relative block overflow-hidden rounded-inset shadow-slide transition-[box-shadow,translate]',
          picked
            ? 'ring-2 ring-ui-accent ring-offset-2 ring-offset-ui-panel'
            : 'group-hover:-translate-y-0.5 group-hover:shadow-floating',
        )}
      >
        {width > 0 && (
          <ScaledSlide
            deck={cover.deck}
            slide={cover.slide}
            mode="thumbnail"
            width={width}
            resolveAsset={coverAsset}
          />
        )}
        {picked && (
          <span className="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-ui-accent text-ui-on-accent shadow-raised">
            <Icon icon={Check} size="sm" />
          </span>
        )}
      </span>
      <span
        dir="auto"
        className={cx(
          'truncate px-0.5 text-sm',
          picked
            ? 'font-semibold text-ui-fg'
            : 'font-medium text-ui-fg-muted group-hover:text-ui-fg',
        )}
      >
        {templateName(theme, i18n.language)}
      </span>
    </button>
  );
}

/** The look of a template in a line: its colours, and its heading font in two letters. */
function Look({ theme, lang }: { theme: Theme; lang: string }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center gap-2.5 rounded-full border border-ui-line bg-ui-panel py-1 ps-1.5 pe-3 shadow-raised"
    >
      <span className="flex -space-x-1.5">
        {swatches(theme).map((color, index) => (
          <span
            key={index}
            className="size-5 rounded-full border border-ui-line ring-2 ring-ui-panel"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="text-lg text-ui-fg" style={{ fontFamily: fontStack(theme.fonts.heading) }}>
        {lang === 'he' ? 'אב' : 'Aa'}
      </span>
    </div>
  );
}

/** Every slide of the picked template, under its name and the way to start a deck in it. */
function Slides({
  entry,
  like,
  busy,
  onCreate,
}: {
  entry: LibraryEntry;
  like: Deck;
  busy: boolean;
  onCreate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const space = useRef<HTMLDivElement>(null);
  const size = useLaidOutSize(space);
  const { shown, leaving, entering } = usePreviewLayers(entry, like);
  const { theme } = entry.template;
  const name = templateName(theme, i18n.language);
  const tagline = templateTagline(theme, i18n.language);
  // The light behind the slides takes the colours of the template, and goes over to the next.
  const glow = {
    '--showroom-glow-start': theme.colors.primary,
    '--showroom-glow-end': theme.colors.accent,
  } as CSSProperties;
  return (
    <div className="welcome-showroom-stage relative flex min-w-0 flex-1 flex-col" style={glow}>
      <header className="relative flex items-center gap-4 px-6 pt-5 pb-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3
            dir="auto"
            data-testid="welcome-template-name"
            className="truncate text-xl font-semibold text-ui-fg"
          >
            {name}
          </h3>
          {tagline && (
            <p dir="auto" className="truncate text-sm text-ui-fg-muted">
              {tagline}
            </p>
          )}
        </div>
        <Look theme={theme} lang={like.meta.lang} />
        <Button
          variant="primary"
          icon={Sparkles}
          loading={busy}
          data-testid="welcome-create"
          onClick={onCreate}
        >
          {t('welcome.create')}
        </Button>
      </header>
      {/* Pictures of slides: the heading said whose they are. */}
      <div ref={space} aria-hidden className="relative mx-6 mb-6 min-h-0 flex-1">
        {leaving && <PreviewGrid key={leaving.deck.id} shown={leaving} size={size} leaving hero />}
        {shown ? (
          <PreviewGrid
            key={shown.deck.id}
            shown={shown}
            size={size}
            leaving={false}
            entering={entering}
            hero
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-ui-fg-muted">
            <Spinner size="lg" />
          </span>
        )}
      </div>
    </div>
  );
}

export interface TemplateShowroomProps {
  /** The templates to pick from, in the library's order. */
  entries: readonly LibraryEntry[];
  /** A deck in the language and direction of the deck that will be made. */
  like: Deck;
  /** The template picked at first: the default one, when there is a default. */
  initial?: string | null;
  /** Starts a deck in the template; resolves when it did, or when the user kept their document. */
  onCreate: (entry: LibraryEntry) => Promise<void>;
  ref?: Ref<HTMLElement>;
}

export function TemplateShowroom({ entries, like, initial, onCreate, ref }: TemplateShowroomProps) {
  const { t } = useTranslation();
  const [pickedId, setPickedId] = useState(initial ?? null);
  const [busy, setBusy] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const { width } = useLaidOutSize(rail);
  // Two covers to a row, each as wide as its picture.
  const cover = Math.max(0, Math.floor((width - COVER_GAP) / 2));
  // A template that went away (a personal one deleted) leaves the first one picked.
  const picked = entries.find((entry) => entry.template.theme.id === pickedId) ?? entries[0];

  const create = async (entry: LibraryEntry) => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(entry);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The arrows walk the covers as they stand, two to a row, and Home and End go to the ends; the
   * cover the focus is on is the one picked. Enter starts the deck in it, as the button does.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const covers = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-welcome-template]'),
    ];
    const at = covers.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[at];
      if (entry) void create(entry);
      return;
    }
    const forward = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
    const steps: Record<string, number> = {
      ArrowRight: forward,
      ArrowLeft: -forward,
      ArrowDown: 2,
      ArrowUp: -2,
      Home: -at,
      End: covers.length - 1 - at,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = Math.min(covers.length - 1, Math.max(0, at + step));
    const entry = entries[next];
    if (!entry) return;
    setPickedId(entry.template.theme.id);
    covers[next]?.focus();
    covers[next]?.scrollIntoView({ block: 'nearest' });
  };

  if (!picked) return null;
  return (
    <section
      ref={ref}
      aria-labelledby="welcome-templates-title"
      data-testid="welcome-templates"
      className="welcome-showroom flex scroll-mt-6 scroll-mb-8 overflow-hidden rounded-panel border border-ui-line bg-ui-panel shadow-floating"
    >
      <div className="flex w-86 shrink-0 flex-col border-e border-ui-line">
        <header className="flex items-center gap-2 px-5 pt-5 pb-4">
          <h2 id="welcome-templates-title" className="text-md font-semibold text-ui-fg">
            {t('welcome.templates')}
          </h2>
          <span className="rounded-full bg-ui-field px-2 text-xs leading-5 tabular-nums text-ui-fg-muted">
            {entries.length}
          </span>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={rail}
            role="radiogroup"
            aria-labelledby="welcome-templates-title"
            onKeyDown={onKeyDown}
            className="grid grid-cols-2 gap-x-3 gap-y-4 px-5 pt-1 pb-5"
          >
            {entries.map((entry) => (
              <Cover
                key={entry.template.theme.id}
                entry={entry}
                like={like}
                width={cover}
                picked={entry === picked}
                onPick={() => setPickedId(entry.template.theme.id)}
                onCreate={() => void create(entry)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      <Slides entry={picked} like={like} busy={busy} onCreate={() => void create(picked)} />
    </section>
  );
}
