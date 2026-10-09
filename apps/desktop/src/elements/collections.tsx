import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { extraShapes } from '@slidr/renderer';
import {
  Flag,
  Hand,
  Hash,
  Lightbulb,
  PawPrint,
  Pizza,
  Plane,
  Search,
  SearchX,
  Smile,
  Trophy,
  Upload,
  type LucideIcon,
} from '@slidr/ui/icons';
import {
  Button,
  cx,
  EmptyState,
  Icon,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
  Tooltip,
} from '@slidr/ui';
import { CHART_TYPES, typeIcons } from '../chart/icons';
import { insertChart } from '../chart/insert';
import { insertClips } from '../media/insertClip';
import { insertCard, insertLine, insertShape } from '../objects/insert';
import { LINE_KINDS, shapeLibrary } from '../objects/shapes';
import { useDeck, useEditor } from '../shell';
import { insertTable } from '../table/insert';
import { TableInsert } from '../table/TableInsert';
import { CardArt, LineArt, ShapeArt, ShapeInks } from './shapeArt';
import { ListEnd, StickerGrid } from './StickerGrid';
import {
  EMOJI_GROUPS,
  GRAPHIC_STYLES,
  loadEmoji,
  loadGraphics,
  searchStickers,
  type EmojiGroup,
  type GraphicStyle,
  type Sticker,
} from './stickers';

/* What each collection of Elements shows once it is opened. */

/** The most results a search shows: the best matches come first, the rest are a better query away. */
const MOST_FOUND = 120;

/** What a loader gave: undefined while it runs, `failed` when it could not. */
export function useLoaded<T>(load: () => Promise<T>): T | 'failed' | undefined {
  const [value, setValue] = useState<T | 'failed'>();
  useEffect(() => {
    let current = true;
    load()
      .then((loaded) => current && setValue(loaded))
      .catch(() => current && setValue('failed'));
    return () => {
      current = false;
    };
  }, [load]);
  return value;
}

/** A heading inside a collection, with room for a button at its end. */
export function Section({
  title,
  action,
  children,
  ...props
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  'data-group'?: string;
}) {
  return (
    <section
      role="group"
      aria-label={title}
      className="flex scroll-mt-28 flex-col gap-2"
      {...props}
    >
      <div className="flex min-h-control-sm items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-ui-fg">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function NothingFound() {
  const { t } = useTranslation('elements');
  return <EmptyState icon={SearchX} title={t('empty')} description={t('emptyHint')} />;
}

export function Loading() {
  return (
    <div className="element-grid" data-size="graphic" aria-busy>
      {Array.from({ length: 12 }, (_, index) => (
        <Skeleton key={index} className="m-1 aspect-square" />
      ))}
    </div>
  );
}

export function LoadFailed() {
  const { t } = useTranslation('elements');
  return <p className="py-8 text-center text-sm text-ui-fg-muted">{t('loadFailed')}</p>;
}

/* ---------------------------------------------------------------- graphics */

/** How many rows of a style the overview shows, and how many graphics each scroll brings. */
const PREVIEW_ROWS = 2;
const PAGE = 60;

/** The colour graphics: an overview of the styles, one style in full, or what a search found. */
export function GraphicsCollection() {
  const { t } = useTranslation('elements');
  const all = useLoaded(loadGraphics);
  const [style, setStyle] = useState<GraphicStyle | 'all'>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const stickers = Array.isArray(all) ? all : undefined;
  const ofStyle = useMemo(
    () => (stickers ?? []).filter((sticker) => style === 'all' || sticker.group === style),
    [stickers, style],
  );
  const found = useMemo(
    () => (query.trim() ? searchStickers(ofStyle, query, MOST_FOUND) : undefined),
    [ofStyle, query],
  );
  const page = useMemo(() => ofStyle.slice(0, shown), [ofStyle, shown]);
  const more = useCallback(() => setShown((count) => count + PAGE), []);

  return (
    <>
      <Input
        icon={Search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('graphics.searchPlaceholder')}
        aria-label={t('graphics.search')}
        data-testid="graphics-query"
      />
      <SegmentedControl
        aria-label={t('graphics.style')}
        fill
        value={style}
        onValueChange={(next) => {
          setStyle(next);
          setShown(PAGE);
        }}
        options={(['all', ...GRAPHIC_STYLES] as const).map((value) => ({
          value,
          label: t(`graphics.${value}`),
        }))}
      />
      {all === 'failed' ? (
        <LoadFailed />
      ) : !stickers ? (
        <Loading />
      ) : found ? (
        found.length === 0 ? (
          <NothingFound />
        ) : (
          <StickerGrid
            stickers={found}
            size="graphic"
            label={t('collection.graphics')}
            testId="graphic-results"
          />
        )
      ) : style === 'all' ? (
        GRAPHIC_STYLES.map((id) => (
          <StylePreview key={id} style={id} stickers={stickers} onShowAll={() => setStyle(id)} />
        ))
      ) : (
        <>
          <StickerGrid
            stickers={page}
            size="graphic"
            label={t(`graphics.${style}`)}
            testId="graphic-results"
          />
          {ofStyle.length > shown && <ListEnd onReach={more} at={shown} />}
        </>
      )}
    </>
  );
}

function StylePreview({
  style,
  stickers,
  onShowAll,
}: {
  style: GraphicStyle;
  stickers: readonly Sticker[];
  onShowAll: () => void;
}) {
  const { t } = useTranslation('elements');
  const ofStyle = useMemo(
    () => stickers.filter((sticker) => sticker.group === style),
    [stickers, style],
  );
  return (
    <Section
      title={t(`graphics.${style}`)}
      data-group={style}
      action={
        <Button variant="ghost" size="sm" onClick={onShowAll}>
          {t('showAll')}
        </Button>
      }
    >
      <StickerGrid
        stickers={ofStyle}
        size="graphic"
        rows={PREVIEW_ROWS}
        label={t(`graphics.${style}`)}
      />
    </Section>
  );
}

/* ---------------------------------------------------------------- emoji */

const groupIcons: Record<EmojiGroup, LucideIcon> = {
  smileys: Smile,
  people: Hand,
  animals: PawPrint,
  food: Pizza,
  travel: Plane,
  activities: Trophy,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag,
};

/** Every emoji, group after group in one list, with a way to each group and a search. */
export function EmojiCollection() {
  const { t } = useTranslation('elements');
  const all = useLoaded(loadEmoji);
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);

  const stickers = Array.isArray(all) ? all : undefined;
  const groups = useMemo(
    () =>
      EMOJI_GROUPS.map((id) => ({
        id,
        stickers: (stickers ?? []).filter((sticker) => sticker.group === id),
      })),
    [stickers],
  );
  const found = useMemo(
    () => (stickers && query.trim() ? searchStickers(stickers, query, MOST_FOUND) : undefined),
    [stickers, query],
  );

  return (
    <>
      <Input
        icon={Search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('emoji.searchPlaceholder')}
        aria-label={t('emoji.search')}
        data-testid="emoji-query"
      />
      {all === 'failed' ? (
        <LoadFailed />
      ) : !stickers ? (
        <Loading />
      ) : found ? (
        found.length === 0 ? (
          <NothingFound />
        ) : (
          <StickerGrid
            stickers={found}
            size="emoji"
            label={t('collection.emoji')}
            testId="emoji-results"
          />
        )
      ) : (
        <>
          <div role="group" aria-label={t('emoji.groups')} className="flex flex-wrap gap-0.5">
            {EMOJI_GROUPS.map((id) => (
              <IconButton
                key={id}
                icon={groupIcons[id]}
                label={t(`emoji.group.${id}`)}
                data-emoji-group={id}
                onClick={() =>
                  list.current
                    ?.querySelector(`[data-group="${id}"]`)
                    ?.scrollIntoView({ block: 'start' })
                }
              />
            ))}
          </div>
          <div ref={list} className="flex flex-col gap-4" data-testid="emoji-groups">
            {groups.map(({ id, stickers: ofGroup }) => (
              <Section key={id} title={t(`emoji.group.${id}`)} data-group={id}>
                <StickerGrid stickers={ofGroup} size="emoji" label={t(`emoji.group.${id}`)} />
              </Section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- shapes */

/** A drawing of the collection: a soft tile that lifts off the panel under the pointer. */
const tile =
  'group flex aspect-square cursor-default items-center justify-center rounded-control bg-ui-field transition-[background-color,box-shadow] duration-(--duration-base) hover:bg-ui-raised hover:shadow-floating active:bg-ui-pressed active:shadow-none focus-visible:-outline-offset-2';
/** The picture on a tile, which comes forward with it. */
const tileArt =
  'size-4/5 transition-transform duration-(--duration-base) ease-out group-hover:scale-110 group-active:scale-100';

/**
 * A group of the Shapes collection: its name over its tiles, which stand in the columns of the
 * whole page (`.shape-group`). `tiles` is how many it has, for the room it takes.
 */
function ShapeTiles({
  title,
  tiles,
  children,
}: {
  title: string;
  tiles: number;
  children: ReactNode;
}) {
  return (
    <section role="group" aria-label={title} className="shape-group" data-tiles={tiles}>
      <h4 className="col-span-full truncate py-1 text-sm font-semibold text-ui-fg">{title}</h4>
      {children}
    </section>
  );
}

/** The shape library, the lines and the card. */
export function ShapesCollection() {
  const editor = useEditor();
  const { t, i18n } = useTranslation('objects');
  const { t: own } = useTranslation('elements');
  const groups = useMemo(() => shapeLibrary(), []);
  // A new line and the words of a new card run in the deck's reading direction, and so do
  // their pictures.
  const rtl = useDeck((s) => s.deck.meta.dir === 'rtl');
  const nameOf = (preset: string) => {
    const extra = extraShapes[preset];
    if (extra) return i18n.language.startsWith('he') ? extra.he : extra.en;
    return i18n.exists(`objects:shape.${preset}`) ? t(`shape.${preset}`) : preset;
  };
  return (
    <div className="element-grid" data-size="shape" data-testid="elements-shapes">
      <ShapeInks />
      {groups.map(({ group, presets }) => (
        <ShapeTiles key={group} title={t(`library.${group}`)} tiles={presets.length}>
          {presets.map((preset) => (
            <Tooltip key={preset} content={nameOf(preset)}>
              <button
                type="button"
                aria-label={nameOf(preset)}
                data-preset={preset}
                className={tile}
                onClick={() => insertShape(editor, preset)}
              >
                <ShapeArt preset={preset} className={tileArt} />
              </button>
            </Tooltip>
          ))}
        </ShapeTiles>
      ))}
      <ShapeTiles title={own('lines')} tiles={LINE_KINDS.length}>
        {LINE_KINDS.map((kind) => (
          <Tooltip key={kind} content={t(`line.${kind}`)}>
            <button
              type="button"
              aria-label={t(`line.${kind}`)}
              data-line={kind}
              className={tile}
              onClick={() => insertLine(editor, kind)}
            >
              <LineArt kind={kind} flip={rtl} className={tileArt} />
            </button>
          </Tooltip>
        ))}
      </ShapeTiles>
      <ShapeTiles title={t('library.cards')} tiles={1}>
        <Tooltip content={t('card.title')}>
          <button
            type="button"
            aria-label={t('card.title')}
            onClick={() => insertCard(editor)}
            className={tile}
          >
            <CardArt ink="violet" flip={rtl} className={tileArt} />
          </button>
        </Tooltip>
      </ShapeTiles>
    </div>
  );
}

/* ---------------------------------------------------------------- tables, charts, clips */

/** The tints of row A's tools, for tiles that stand for a kind of element. */
const tones = [
  'bg-ui-tool-green text-ui-tool-green-fg',
  'bg-ui-tool-blue text-ui-tool-blue-fg',
  'bg-ui-tool-violet text-ui-tool-violet-fg',
  'bg-ui-tool-orange text-ui-tool-orange-fg',
  'bg-ui-tool-pink text-ui-tool-pink-fg',
  'bg-ui-tool-teal text-ui-tool-teal-fg',
  'bg-ui-tool-rose text-ui-tool-rose-fg',
];

const kindTiles = 'grid grid-cols-3 gap-2 @md:grid-cols-4';
const kindTile =
  'group flex cursor-default flex-col items-center gap-1.5 rounded-control p-1.5 text-xs font-medium text-ui-fg transition-colors hover:bg-ui-hover active:bg-ui-pressed';
const kindPicture =
  'flex aspect-4/3 w-full items-center justify-center rounded-control transition-transform group-hover:scale-105';

/** The sizes offered at a click, as rows and columns. */
const TABLE_SIZES = [
  [2, 2],
  [2, 3],
  [3, 3],
  [3, 4],
  [4, 3],
  [4, 4],
  [5, 4],
  [6, 5],
] as const;

/** A small table of the given size, in the colour of the text around it. */
function TableGlyph({ rows, cols }: { rows: number; cols: number }) {
  const [w, h] = [48, 34];
  const lines = [
    ...Array.from({ length: rows - 1 }, (_, i) => `M0 ${((i + 1) * h) / rows}h${w}`),
    ...Array.from({ length: cols - 1 }, (_, i) => `M${((i + 1) * w) / cols} 0v${h}`),
  ].join('');
  return (
    <svg aria-hidden viewBox={`-1 -1 ${w + 2} ${h + 2}`} className="w-3/5">
      <rect width={w} height={h} rx="3" className="fill-ui-panel" />
      <path
        d={`M0 ${h / rows}V3a3 3 0 0 1 3-3h${w - 6}a3 3 0 0 1 3 3v${h / rows - 3}Z`}
        fill="currentColor"
        opacity=".3"
      />
      <path d={lines} stroke="currentColor" strokeWidth="1" opacity=".7" />
      <rect width={w} height={h} rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Tables: a few sizes at a click, and the grid of row A for any other. */
export function TablesCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  return (
    <>
      <Section title={t('tables.ready')}>
        <div className={kindTiles} data-testid="elements-tables">
          {TABLE_SIZES.map(([rows, cols], index) => (
            <button
              key={`${rows}x${cols}`}
              type="button"
              aria-label={t('tables.size', { rows, cols })}
              data-table={`${rows}x${cols}`}
              className={kindTile}
              onClick={() => insertTable(editor, rows, cols)}
            >
              <span className={cx(kindPicture, tones[index % tones.length])}>
                <TableGlyph rows={rows} cols={cols} />
              </span>
              <span dir="ltr">
                {rows} × {cols}
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('tables.custom')}>
        <div className="self-start">
          <TableInsert close={() => {}} />
        </div>
      </Section>
    </>
  );
}

/** Charts: the eight types, each inserted with sample data at a click. */
export function ChartsCollection() {
  const { t } = useTranslation('chart');
  const editor = useEditor();
  return (
    <div
      role="group"
      aria-label={t('insert.gallery')}
      className={kindTiles}
      data-testid="elements-charts"
    >
      {CHART_TYPES.map((chartType, index) => (
        <button
          key={chartType}
          type="button"
          data-chart-type={chartType}
          className={kindTile}
          onClick={() => insertChart(editor, chartType)}
        >
          <span className={cx(kindPicture, tones[(index + 3) % tones.length])}>
            <Icon icon={typeIcons[chartType]} className="size-9" />
          </span>
          {t(`types.${chartType}`)}
        </button>
      ))}
    </div>
  );
}

/** Video and audio come from files of the user's: the collection is the way to the file dialog. */
export function ClipsCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  return (
    <button
      type="button"
      data-testid="elements-clips"
      onClick={() => void insertClips(editor)}
      className="flex cursor-default flex-col items-center gap-3 rounded-panel border border-dashed border-ui-line-strong px-6 py-10 text-center transition-colors hover:border-ui-accent hover:bg-ui-hover"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-ui-tool-rose text-ui-tool-rose-fg">
        <Icon icon={Upload} size="lg" />
      </span>
      <span className="text-sm font-semibold text-ui-fg">{t('clips.pick')}</span>
      <span className="text-xs text-ui-fg-muted">{t('clips.hint')}</span>
    </button>
  );
}
