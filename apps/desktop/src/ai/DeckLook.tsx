import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { FontPair } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { Check } from '@slidr/ui/icons';
import { cx, Icon } from '@slidr/ui';
import { useDeck, useEditor, useElementSize } from '../shell';
import { showPreview } from '../stage/preview';
import { library } from '../templates/app';
import { coverAsset, coverOf } from '../templates/covers';
import type { LibraryEntry } from '../templates/library';
import {
  applyLook,
  fontChoices,
  isCurrent,
  lookPreview,
  palettes,
  previewNeedsFiles,
  supplyPreview,
  type FontChoice,
  type Look,
  type Palette,
} from './look';

/*
 * The look of the deck in the Actions tab of the AI chat (AID-05, THM-03): the template
 * gallery, the colour palettes and the font pairs. Hovering a card, or reaching it with the
 * keyboard, shows it on the Stage without changing the deck, and a click applies it as one undo
 * step. They are the user's own edits, not actions of the agent, so they stay usable while the
 * chat is in a turn, like the layout, background and transition of the slide.
 */

/** Space between the cards of a row: Tailwind's 2. */
const GAP = 8;
/** A template card's padding and border, on both sides. */
const CARD_EDGE = 2 * (GAP + 1);
/**
 * How many cards a row takes, by the width the panel gives it: the narrowest panel (a quarter of
 * a 1366 window) keeps a cover readable, and a wide one does not blow the cards up.
 */
const TEMPLATE_COLUMNS = [
  { from: 720, className: 'grid-cols-4', count: 4 },
  { from: 360, className: 'grid-cols-3', count: 3 },
  { from: 0, className: 'grid-cols-2', count: 2 },
] as const;
const PALETTE_COLUMNS = [
  { from: 520, className: 'grid-cols-6' },
  { from: 360, className: 'grid-cols-5' },
  { from: 0, className: 'grid-cols-4' },
] as const;

const columnsFor = <T extends { from: number }>(choices: readonly T[], width: number): T =>
  choices.find((choice) => width >= choice.from) ?? choices.at(-1)!;

/** What the cards of a section do: try a look on the Stage, stop trying it, apply it. */
interface Trying {
  show: (look: Look) => void;
  hide: (look: Look) => void;
  apply: (look: Look, label: string) => void;
}

/**
 * Shows the look that is being tried on the Stage. The preview follows the deck while it is up
 * (a turn of the agent may be changing it), and comes down when the look is left or applied,
 * and when the panel goes away: whoever shows a preview takes it down. It draws nothing itself;
 * it is a component so that only it, and not the cards, follows every change of the deck.
 */
function StagePreview({ look }: { look: Look | null }) {
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  /** This panel has a preview up, so it takes down only what it put there. */
  const up = useRef(false);
  /** The look whose pictures are with the document already. */
  const supplied = useRef<Look | null>(null);
  useEffect(() => {
    let current = true;
    const show = (preview: ReturnType<typeof lookPreview>) => {
      if (preview || up.current) showPreview(preview);
      up.current = preview !== null;
    };
    if (look && supplied.current !== look && previewNeedsFiles(deck, library, look)) {
      // The logo of a personal template: its file goes to the document before the Stage asks
      // for it, because a picture that failed to load is not asked for again.
      show(null);
      void supplyPreview(editor, library, look)
        .catch((error: unknown) => {
          console.error("The pictures of the template's preview could not be stored", error);
        })
        .then(() => {
          if (!current) return;
          supplied.current = look;
          show(lookPreview(deck, library, look));
        });
    } else {
      show(look ? lookPreview(deck, library, look) : null);
    }
    return () => {
      current = false;
    };
  }, [editor, deck, look]);
  useEffect(
    () => () => {
      if (up.current) showPreview(null);
    },
    [],
  );
  return null;
}

function Section({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-look={name} className="flex flex-col gap-0.5">
      <h4 className="px-2 pb-1 text-xs font-medium text-ui-fg-muted">{title}</h4>
      {children}
    </section>
  );
}

/** What every card of a look is: a button that tries its look and applies it. */
function tryingProps(trying: Trying, look: Look, label: string, current: boolean) {
  return {
    type: 'button' as const,
    'aria-pressed': current,
    'data-current': current || undefined,
    onPointerEnter: () => trying.show(look),
    onPointerLeave: () => trying.hide(look),
    onFocus: () => trying.show(look),
    onBlur: () => trying.hide(look),
    onClick: () => trying.apply(look, label),
  };
}

function CurrentMark() {
  const { t } = useTranslation('ai');
  return (
    <>
      <Icon icon={Check} className="shrink-0 text-ui-accent-fg" />
      <span className="sr-only">{t('look.current')}</span>
    </>
  );
}

/* ---------------------------------------------------------------- the template gallery */

function TemplateCard({
  entry,
  width,
  trying,
}: {
  entry: LibraryEntry;
  width: number;
  trying: Trying;
}) {
  const { t } = useTranslation('ai');
  const { bus } = useEditor();
  const { template, personal } = entry;
  const { id, name } = template.theme;
  const lang = useDeck((s) => s.deck.meta.lang);
  const dir = useDeck((s) => s.deck.meta.dir);
  const current = useDeck((s) => s.deck.theme.id === id);
  const look = useMemo<Look>(() => ({ kind: 'template', id }), [id]);
  // The cover follows the deck's direction and language, not every edit of the deck.
  const cover = useMemo(
    () => coverOf(library.forDeck(id, lang) ?? template, bus.deck),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, id, lang, dir],
  );
  return (
    <button
      {...tryingProps(trying, look, t('look.template.undo'), current)}
      aria-label={name}
      data-template={id}
      className={cx(
        'flex min-w-0 cursor-default flex-col gap-1.5 rounded-control border p-2 text-start transition-colors',
        current
          ? 'border-ui-accent bg-ui-accent-soft'
          : 'border-ui-line hover:border-ui-accent hover:bg-ui-hover active:bg-ui-pressed',
      )}
    >
      <div className="aspect-video overflow-hidden rounded-small">
        {width > 0 && (
          <ScaledSlide
            deck={cover.deck}
            slide={cover.slide}
            mode="thumbnail"
            width={width}
            resolveAsset={coverAsset}
          />
        )}
      </div>
      <span className="flex min-w-0 items-center gap-1">
        <span className="flex min-w-0 flex-1 flex-col">
          {/* A name is in its own language; the line stays on the side the panel reads from. */}
          <span className="truncate text-sm font-medium text-ui-fg">
            <bdi>{name}</bdi>
          </span>
          <span className="truncate text-xs text-ui-fg-muted">
            {t(personal ? 'look.template.personal' : 'look.template.builtIn')}
          </span>
        </span>
        {current && <CurrentMark />}
      </span>
    </button>
  );
}

function Templates({ trying }: { trying: Trying }) {
  const { t } = useTranslation('ai');
  const { personal } = useStore(library.state);
  const grid = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(grid);
  const columns = columnsFor(TEMPLATE_COLUMNS, width);
  const thumb = Math.max(
    0,
    Math.floor((width - GAP * (columns.count - 1)) / columns.count) - CARD_EDGE,
  );
  const entries = useMemo(
    () => library.entries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );
  return (
    <Section title={t('look.template.title')} name="template">
      <p className="px-2 pb-1.5 text-xs text-ui-fg-muted">{t('look.hint')}</p>
      <div className="px-2">
        <div ref={grid} className={cx('grid gap-2', columns.className)}>
          {entries.map((entry) => (
            <TemplateCard
              key={entry.template.theme.id}
              entry={entry}
              width={thumb}
              trying={trying}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- the palettes */

function PaletteCard({ palette, trying }: { palette: Palette; trying: Trying }) {
  const { t } = useTranslation('ai');
  const { colors } = palette;
  const look = useMemo<Look>(() => ({ kind: 'palette', colors }), [colors]);
  const current = useDeck((s) => isCurrent(s.deck.theme, look));
  const name = palette.name ?? t(`look.palette.names.${palette.id}`);
  return (
    <button
      {...tryingProps(trying, look, t('look.palette.undo'), current)}
      aria-label={name}
      data-palette={palette.id}
      className="flex min-w-0 cursor-default flex-col gap-1 rounded-control p-1 text-start transition-colors hover:bg-ui-hover active:bg-ui-pressed"
    >
      {/* The palette as a slide wears it: its text on its background, and its three colours. */}
      <span
        aria-hidden
        style={{ background: colors.bg, color: colors.text }}
        className={cx(
          'flex h-12 flex-col justify-between rounded-inset border p-1.5',
          current ? 'border-ui-accent outline-2 outline-ui-accent' : 'border-ui-line-strong',
        )}
      >
        <span className="text-xs font-semibold">{t('look.palette.sample')}</span>
        <span className="flex gap-1">
          {[colors.primary, colors.secondary, colors.accent].map((color, i) => (
            <span key={i} style={{ background: color }} className="size-2.5 rounded-full" />
          ))}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-0.5">
        <span
          className={cx(
            'min-w-0 flex-1 truncate text-xs',
            current ? 'font-medium text-ui-accent-fg' : 'text-ui-fg-muted',
          )}
        >
          <bdi>{name}</bdi>
        </span>
        {current && <span className="sr-only">{t('look.current')}</span>}
      </span>
    </button>
  );
}

function Palettes({ trying }: { trying: Trying }) {
  const { t } = useTranslation('ai');
  const { personal } = useStore(library.state);
  const grid = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(grid);
  const list = useMemo(
    () => palettes(library),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );
  return (
    <Section title={t('look.palette.title')} name="palette">
      <div className="px-1">
        <div
          ref={grid}
          className={cx('grid gap-x-1 gap-y-1.5', columnsFor(PALETTE_COLUMNS, width).className)}
        >
          {list.map((palette) => (
            <PaletteCard key={palette.id} palette={palette} trying={trying} />
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- the font pairs */

const familiesOf = (pair: FontPair) =>
  pair.he === pair.latin ? pair.he : `${pair.he} · ${pair.latin}`;

/** A few letters of each script in the face a pair gives it. */
function Letters({ pair, className }: { pair: FontPair; className: string }) {
  return (
    <span aria-hidden className={cx('w-20 shrink-0 truncate', className)}>
      <span style={{ fontFamily: `"${pair.he}"` }}>אבג</span>{' '}
      <span style={{ fontFamily: `"${pair.latin}"` }}>Abc</span>
    </span>
  );
}

function FontCard({ choice, trying }: { choice: FontChoice; trying: Trying }) {
  const { t } = useTranslation('ai');
  const { fonts } = choice;
  const look = useMemo<Look>(() => ({ kind: 'fonts', fonts }), [fonts]);
  const current = useDeck((s) => isCurrent(s.deck.theme, look));
  const heading = familiesOf(fonts.heading);
  const body = familiesOf(fonts.body);
  return (
    <button
      {...tryingProps(trying, look, t('look.fonts.undo'), current)}
      aria-label={t('look.fonts.pair', { heading, body })}
      data-fonts={choice.id}
      className={cx(
        'flex min-w-0 cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-start transition-colors',
        current ? 'bg-ui-accent-soft' : 'hover:bg-ui-hover active:bg-ui-pressed',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <Letters pair={fonts.heading} className="text-lg font-semibold text-ui-fg" />
          <span className="min-w-0 truncate text-xs text-ui-fg">{heading}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <Letters pair={fonts.body} className="text-sm text-ui-fg-muted" />
          <span className="min-w-0 truncate text-xs text-ui-fg-muted">{body}</span>
        </span>
      </span>
      {current && <CurrentMark />}
    </button>
  );
}

function Fonts({ trying }: { trying: Trying }) {
  const { t } = useTranslation('ai');
  const { personal } = useStore(library.state);
  const list = useMemo(
    () => fontChoices(library),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );
  return (
    <Section title={t('look.fonts.title')} name="fonts">
      {list.map((choice) => (
        <FontCard key={choice.id} choice={choice} trying={trying} />
      ))}
    </Section>
  );
}

/* ---------------------------------------------------------------- the three together */

/** The cards do not change with the look that is tried, so trying one does not draw them again. */
const Sections = memo(function Sections({ trying }: { trying: Trying }) {
  return (
    <>
      <Templates trying={trying} />
      <Palettes trying={trying} />
      <Fonts trying={trying} />
    </>
  );
});

export function DeckLook() {
  const editor = useEditor();
  const [look, setLook] = useState<Look | null>(null);
  const trying = useMemo<Trying>(
    () => ({
      show: setLook,
      // A card that is left takes down its own look, not one another card has put up since.
      hide: (left) => setLook((now) => (now === left ? null : now)),
      apply: (chosen, label) => {
        // The look is the deck's from here: what the Stage shows next is the deck itself, also
        // after an undo, until a card is entered again.
        setLook(null);
        void applyLook(editor, library, chosen, label).catch((error: unknown) => {
          console.error('The look could not be applied', error);
        });
      },
    }),
    [editor],
  );
  return (
    <>
      <StagePreview look={look} />
      <Sections trying={trying} />
    </>
  );
}
