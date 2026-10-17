import type { Deck, Theme } from '@slidr/model';
import { fontStack, ScaledSlide } from '@slidr/renderer';
import { Button, cx, Icon, ScrollArea, Spinner } from '@slidr/ui';
import { ArrowLeft, Check, Sparkles } from '@slidr/ui/icons';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { library } from './app';
import { coverAsset, coverOf } from './covers';
import type { LibraryEntry } from './library';
import { templateName, templateTagline } from './names';
import { fit, PreviewGrid, useLaidOutSize, usePreviewLayers } from './PreviewGrid';

/*
 * The templates of the welcome screen (DOC-05), once "All templates" or a cover was chosen: the
 * covers to pick from, beside every slide of the one that is picked, all seen at once as the
 * Templates panel spreads them over the editor (`./PreviewGrid`). Picking a cover shows its
 * slides, which fade in over those of the one before; the button over them, or a double click on
 * the cover, starts the deck. The arrow keys walk the covers. The showroom fills the screen, so
 * the way back to the rest of the welcome screen is a button of its own, at the top of the covers.
 *
 * The slides are in the language and direction the new deck will have (`like`), which is the
 * UI's and not that of a document the screen may stand over.
 */

/** The rail of covers: `w-52` and its border, in px. */
const RAIL = 209;
/** The margin round the slides: `px-6`, in px. */
const STAGE_PAD = 24;
/** The least the stage is wide, for its heading and button to stand in a row, in px. */
const STAGE_MIN = 560;
/** Space between the slides, in px: as in PreviewGrid. */
const SLIDE_GAP = 16;

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
      // The name is in the picture of the cover, which a screen reader does not read.
      aria-label={templateName(theme, i18n.language)}
      // Only the picked cover is in the tab order; the arrow keys walk the others.
      tabIndex={picked ? 0 : -1}
      onClick={onPick}
      onDoubleClick={onCreate}
      className="group flex min-w-0 cursor-default flex-col gap-1.5 rounded-control text-start"
    >
      {/* The cover is a picture, with every word of its slide, the name among them. */}
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
  maxWidth,
  onWidth,
}: {
  entry: LibraryEntry;
  like: Deck;
  busy: boolean;
  onCreate: () => void;
  /** The most the slides may spread across, in px. */
  maxWidth: number;
  /** Told how wide the slides come out, for the showroom to be no wider. */
  onWidth: (width: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const space = useRef<HTMLDivElement>(null);
  const size = useLaidOutSize(space);
  const { shown, leaving, entering } = usePreviewLayers(entry, like);
  // The slides are laid out for the widest the showroom may be; they come out no wider than the
  // height lets them, and the showroom closes in on them.
  const room = { width: maxWidth, height: size.height };
  const { columns, thumb } = fit(shown?.deck.slides.length ?? 0, room);
  const spread = thumb > 0 ? columns * thumb + SLIDE_GAP * (columns - 1) : maxWidth;
  useEffect(() => onWidth(spread), [onWidth, spread]);
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
      <header className="relative flex h-14 shrink-0 items-center gap-4 px-6">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h3
            dir="auto"
            data-testid="welcome-template-name"
            className="shrink-0 truncate text-lg font-semibold text-ui-fg"
          >
            {name}
          </h3>
          {tagline && (
            <p dir="auto" className="min-w-0 truncate text-sm text-ui-fg-muted">
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
      {/* Pictures of slides: the heading said whose they are. They are sized to the space the
          showroom leaves, every slide in it with nothing to scroll. */}
      <div className="min-h-0 flex-1 px-6 pb-4">
        <div ref={space} aria-hidden className="relative h-full min-h-60">
          {leaving && <PreviewGrid key={leaving.deck.id} shown={leaving} size={room} leaving />}
          {shown ? (
            <PreviewGrid
              key={shown.deck.id}
              shown={shown}
              size={room}
              leaving={false}
              entering={entering}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-ui-fg-muted">
              <Spinner size="lg" />
            </span>
          )}
        </div>
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
  /** Closes the showroom, back to the rest of the welcome screen; `byKey`: from the keyboard. */
  onBack: (byKey: boolean) => void;
  /** The size of the showroom: it is as large as the screen it fills. */
  style?: CSSProperties;
  ref?: Ref<HTMLElement>;
}

export function TemplateShowroom({
  entries,
  like,
  initial,
  onCreate,
  onBack,
  style,
  ref,
}: TemplateShowroomProps) {
  const { t } = useTranslation();
  const [pickedId, setPickedId] = useState(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [spread, setSpread] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  // One cover to a row, as wide as the rail.
  const { width: cover } = useLaidOutSize(rail);
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
   * The arrows walk the covers, down the rail or along the reading direction, and Home and End go
   * to the ends; the cover the focus is on is the one picked. Enter starts the deck in it, as the
   * button does.
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
      ArrowDown: 1,
      ArrowUp: -1,
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

  // The showroom is as wide as its slides make it, in the width the screen gives it.
  const given = typeof style?.width === 'number' ? style.width : undefined;
  const maxStage = Math.max(0, (given ?? 1600) - RAIL - 2 * STAGE_PAD);
  const width =
    given === undefined || spread === null
      ? given
      : Math.min(given, RAIL + Math.max(STAGE_MIN, spread + 2 * STAGE_PAD));
  if (!picked) return null;
  return (
    <section
      ref={ref}
      aria-labelledby="welcome-templates-title"
      data-testid="welcome-templates"
      className="welcome-showroom flex overflow-hidden rounded-panel border border-ui-line bg-ui-panel shadow-floating"
      style={{ ...style, width }}
    >
      {/* The rail is as tall as the showroom, and scrolls its covers. */}
      <div className="relative w-52 shrink-0 border-e border-ui-line">
        <div className="absolute inset-0 flex flex-col">
          <header className="flex h-14 shrink-0 items-center px-5">
            <Button
              variant="ghost"
              size="sm"
              data-testid="welcome-templates-back"
              className="-ms-2.5"
              // A click that no pointer made (detail 0) came from Enter or Space.
              onClick={(event) => onBack(event.detail === 0)}
            >
              <Icon icon={ArrowLeft} mirror />
              {t('welcome.templatesBack')}
            </Button>
            {/* The covers' name, for a screen reader: the sight of them says it. */}
            <h2 id="welcome-templates-title" className="sr-only">
              {t('welcome.templates')} ({entries.length})
            </h2>
          </header>
          <ScrollArea className="min-h-0 flex-1">
            {/* The rail is measured inside its margins: a cover is drawn as wide as it stands. */}
            <div className="px-5 pt-1 pb-5">
              <div
                ref={rail}
                role="radiogroup"
                aria-labelledby="welcome-templates-title"
                onKeyDown={onKeyDown}
                className="flex flex-col gap-4"
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
            </div>
          </ScrollArea>
        </div>
      </div>
      <Slides
        entry={picked}
        like={like}
        busy={busy}
        onCreate={() => void create(picked)}
        maxWidth={maxStage}
        onWidth={setSpread}
      />
    </section>
  );
}
