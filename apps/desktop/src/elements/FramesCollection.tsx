import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetMeta, ImageElement, Theme } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import { ImageUp, Replace, Search } from '@slidr/ui/icons';
import { Button, cx, Icon, Input, Tooltip } from '@slidr/ui';
import { useSelectedPicture } from '../media/replace';
import { replaceImage } from '../objects/replace';
import type { Target } from '../objects/target';
import { tell, useDeck, useEditor, useElementSize } from '../shell';
import { LoadFailed, Loading, NothingFound, Section, useLoaded } from './collections';
import {
  drawnWhole,
  featuredFrames,
  FRAME_GROUPS,
  frameOutline,
  framePreview,
  loadFrames,
  MAGNET_SETS,
  SAMPLE_PHOTO,
  searchFrames,
  type FrameGroup,
  type MagnetSet,
  type PhotoFrame,
} from './frames';
import { framePicture, insertFrame } from './insert';
import { useColumns, useNear } from './StickerGrid';
import { FRAME_PHOTO, FRAME_PHOTO_URL, FrameThumbDefs } from './tiles';

/*
 * The photo frames of Elements: what the collection shows, and a frame drawn small. A click on
 * a frame puts it on the slide, empty; while a picture with a photograph is selected on the
 * Stage, the click puts that picture in the frame instead.
 */

/** The most frames a search shows. */
const MOST_FOUND = 60;
/** How many rows of a group the overview shows. */
const PREVIEW_ROWS = 2;

/**
 * A frame drawn small. The photograph it waits for is a landscape (`FrameThumbDefs`, which the
 * panel draws once), cut as the frame cuts it. A frame with artwork or with stickers is drawn
 * by the renderer instead, in the colours of the deck's theme.
 */
export function FrameThumb({ frame }: { frame: PhotoFrame }) {
  return drawnWhole(frame) ? <DrawnThumb frame={frame} /> : <OutlineThumb frame={frame} />;
}

/**
 * A frame as the renderer draws it on a slide, `width` wide: its picture around a stand-in
 * photograph, and the stickers and the caption beside it in the language given.
 */
export function DrawnFrame({
  frame,
  lang,
  theme,
  width,
}: {
  frame: PhotoFrame;
  lang: string;
  theme: Theme;
  width: number;
}) {
  const { deck, slide } = useMemo(() => framePreview(frame, lang, theme), [frame, lang, theme]);
  const scale = width / frame.size.w;
  return (
    // The slide is scaled from its left corner, in a panel that may read from the right. It is
    // cut to the frame, with room around it for the shadow the frame casts.
    <div
      aria-hidden
      dir="ltr"
      className="relative overflow-clip [overflow-clip-margin:12px]"
      style={{ width, height: frame.size.h * scale }}
    >
      <div className="absolute start-0 top-0 origin-top-left" style={{ scale }}>
        <SlideRenderer deck={deck} slide={slide} mode="thumbnail" resolveAsset={samplePhoto} />
      </div>
    </div>
  );
}

/** Where the stand-in photograph of a drawn thumbnail is: the landscape of the other thumbnails. */
const samplePhoto = (asset: AssetMeta) =>
  asset.id === SAMPLE_PHOTO.id ? FRAME_PHOTO_URL : undefined;

/** The thumbnail of a frame the renderer draws: as large as fits the tile it is in. */
function DrawnThumb({ frame }: { frame: PhotoFrame }) {
  const theme = useDeck((s) => s.deck.theme);
  const lang = useDeck((s) => s.deck.meta.lang);
  const tile = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(tile);
  const fit = Math.floor(Math.min(width, (height * frame.size.w) / frame.size.h));
  return (
    <div ref={tile} className="flex size-full items-center justify-center">
      {fit > 0 && <DrawnFrame frame={frame} lang={lang} theme={theme} width={fit} />}
    </div>
  );
}

function OutlineThumb({ frame }: { frame: PhotoFrame }) {
  const clip = `frame${useId().replace(/[^\w-]/g, '')}`;
  const { size } = frame;
  const outline = useMemo(() => frameOutline(frame), [frame]);
  return (
    <svg aria-hidden viewBox={`0 0 ${size.w} ${size.h}`} className="overflow-visible">
      <clipPath id={clip}>
        <path d={outline} />
      </clipPath>
      <use href={`#${FRAME_PHOTO}`} width={size.w} height={size.h} clipPath={`url(#${clip})`} />
    </svg>
  );
}

/** The picture a click on a frame goes to: the one selected on the Stage, when it has a photograph. */
function useFramedPicture(): Target<ImageElement> | undefined {
  const picture = useSelectedPicture();
  return picture?.element.assetId ? picture : undefined;
}

/** One frame: a click puts it on the current slide, or puts the selected picture in it. */
function FrameButton({
  frame,
  picture,
}: {
  frame: PhotoFrame;
  picture: Target<ImageElement> | undefined;
}) {
  const { t, i18n } = useTranslation('elements');
  const editor = useEditor();
  const name = i18n.language.startsWith('he') ? frame.label.he : frame.label.en;
  return (
    <Tooltip content={name}>
      <button
        type="button"
        aria-label={t(picture ? 'frames.reframe' : 'insert', { name })}
        data-frame={frame.id}
        onClick={() => {
          if (picture) void framePicture(editor, picture, frame);
          else if (!insertFrame(editor, frame)) void tell(t('media:noSlide'));
        }}
        className={cx(
          'flex aspect-square w-full cursor-default items-center justify-center rounded-control p-2 transition-colors',
          'focus-visible:-outline-offset-2',
          '[&>svg]:size-full [&>*]:transition-transform hover:[&>*]:scale-105',
          // Artwork with a dark body is lost on the dark panel: there it sits on paper.
          frame.art
            ? 'bg-ui-paper hover:bg-ui-paper-hover'
            : 'hover:bg-ui-hover active:bg-ui-pressed',
        )}
      >
        <FrameThumb frame={frame} />
      </button>
    </Tooltip>
  );
}

/** The alphabet and the digits of English read from the left, in a Hebrew interface too. */
const fromLeft = (group: FrameGroup) => group === 'latin' || group === 'digits';

/** The groups whose frames are whole designs, looked at larger: two in a row to begin with. */
const large = (group: FrameGroup | undefined) => group === 'magnets';

/**
 * A grid of frames. A frame is looked at more closely than a graphic is, so the grid has fewer
 * of them in a row: three in a narrow panel, more as the panel is made wider.
 */
export function FrameGrid({
  frames,
  label,
  group,
  testId,
  ref,
}: {
  frames: readonly PhotoFrame[];
  /** Names the grid for screen readers. */
  label: string;
  /** The group the frames are of, when they are all of one. */
  group?: FrameGroup;
  testId?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const picture = useFramedPicture();
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      dir={group && fromLeft(group) ? 'ltr' : undefined}
      className={cx(
        'grid gap-1',
        large(group)
          ? 'grid-cols-2 @sm:grid-cols-3 @2xl:grid-cols-4'
          : 'grid-cols-3 @sm:grid-cols-4 @lg:grid-cols-5 @2xl:grid-cols-6',
      )}
      data-testid={testId}
    >
      {frames.map((frame) => (
        <FrameButton key={frame.id} frame={frame} picture={picture} />
      ))}
    </div>
  );
}

/** The magnets of each set, in the order the panel shows the sets. */
const bySet = (frames: readonly PhotoFrame[]) =>
  MAGNET_SETS.map((set) => ({ set, frames: frames.filter((frame) => frame.set === set) }));

/**
 * The magnets with the first of every set first, then the second of every set: the first rows
 * of the group show every kind of event, not one.
 */
function mixed(frames: readonly PhotoFrame[]): PhotoFrame[] {
  const sets = bySet(frames).map((one) => one.frames);
  const most = Math.max(0, ...sets.map((one) => one.length));
  return Array.from({ length: most }, (_, i) => sets.flatMap((one) => one.slice(i, i + 1))).flat();
}

/** One set of magnets under its name: drawn once it comes near the visible part of the panel. */
function MagnetSet({ set, frames }: { set: MagnetSet; frames: readonly PhotoFrame[] }) {
  const { t } = useTranslation('elements');
  const [room, near] = useNear<HTMLDivElement>();
  const title = t(`frames.set.${set}`);
  return (
    <Section title={title} data-group={`magnets-${set}`}>
      <div ref={room} className="min-h-24">
        {near && <FrameGrid frames={frames} label={title} group="magnets" />}
      </div>
    </Section>
  );
}

/**
 * The magnets in full. They are a hundred, so they are shown by set, what the event is or that
 * the magnet is a style with no event: every set under its name, or one set alone.
 */
function Magnets({ frames }: { frames: readonly PhotoFrame[] }) {
  const { t } = useTranslation('elements');
  const [set, setSet] = useState<MagnetSet | 'all'>('all');
  const sets = useMemo(() => bySet(frames).filter((one) => one.frames.length > 0), [frames]);
  const list = useRef<HTMLDivElement>(null);
  // The list opens at its top. The panel was scrolled down to the group it was opened from,
  // and a set that is not in view yet is not drawn: the first one would wait above the fold.
  useEffect(() => {
    list.current?.closest('section')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <div ref={list} className="flex flex-col gap-3" data-testid="frame-results">
      <div role="group" aria-label={t('frames.sets')} className="flex flex-wrap gap-1">
        {(['all', ...sets.map((one) => one.set)] as const).map((id) => (
          <Button
            key={id}
            variant={id === set ? 'soft' : 'ghost'}
            size="sm"
            aria-pressed={id === set}
            data-magnet-set={id}
            onClick={() => setSet(id)}
          >
            {id === 'all' ? t('frames.allSets') : t(`frames.set.${id}`)}
          </Button>
        ))}
      </div>
      {sets
        .filter((one) => set === 'all' || one.set === set)
        .map((one) => (
          <MagnetSet key={one.set} set={one.set} frames={one.frames} />
        ))}
    </div>
  );
}

/** The first rows of a group, as many frames as fill them at the width the panel has. */
function GroupPreview({
  group,
  frames,
  onShowAll,
}: {
  group: FrameGroup;
  frames: readonly PhotoFrame[];
  onShowAll: () => void;
}) {
  const { t } = useTranslation('elements');
  const grid = useRef<HTMLDivElement>(null);
  const first = useMemo(() => (large(group) ? mixed(frames) : frames), [group, frames]);
  const shown = first.slice(0, PREVIEW_ROWS * useColumns(grid));
  const title = t(`frames.group.${group}`);
  return (
    <Section
      title={title}
      data-group={group}
      action={
        shown.length < frames.length && (
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            {t('showAll')}
          </Button>
        )
      }
    >
      <FrameGrid ref={grid} frames={shown} label={title} group={group} />
    </Section>
  );
}

/**
 * What the selection on the Stage means here: a picture takes the frame that is clicked, and
 * an empty frame waits for a photograph, which can be chosen from the computer at once.
 */
function SelectionHint() {
  const { t } = useTranslation('elements');
  const { t: objects } = useTranslation('objects');
  const editor = useEditor();
  const picture = useSelectedPicture();
  if (!picture) return null;
  const empty = !picture.element.assetId;
  return (
    <div
      data-testid="frames-hint"
      className="flex flex-col items-start gap-2 rounded-control bg-ui-field px-3 py-2 text-xs text-ui-fg"
    >
      <p role="status" className="flex items-start gap-2">
        {!empty && <Icon icon={Replace} className="mt-0.5" />}
        <span className="min-w-0 flex-1">
          {t(empty ? 'frames.emptyHint' : 'frames.reframeHint')}
        </span>
      </p>
      {empty && (
        <Button
          variant="soft"
          size="sm"
          icon={ImageUp}
          data-testid="frames-pick"
          onClick={() =>
            void replaceImage(editor, picture, {
              history: objects('history.replace'),
              failed: objects('insert.failed'),
            })
          }
        >
          {t('frames.pick')}
        </Button>
      )}
    </div>
  );
}

/** The photo frames: the best of them and every group's first rows, one group in full, or what a search found. */
export function FramesCollection() {
  const { t } = useTranslation('elements');
  const all = useLoaded(loadFrames);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<FrameGroup>();

  const frames = Array.isArray(all) ? all : undefined;
  const featured = useMemo(() => featuredFrames(frames ?? []), [frames]);
  const byGroup = useMemo(
    () => FRAME_GROUPS.map((id) => ({ id, frames: (frames ?? []).filter((f) => f.group === id) })),
    [frames],
  );
  const found = useMemo(
    () => (frames && query.trim() ? searchFrames(frames, query, MOST_FOUND) : undefined),
    [frames, query],
  );

  return (
    <>
      <FrameThumbDefs />
      <Input
        icon={Search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('frames.searchPlaceholder')}
        aria-label={t('frames.search')}
        data-testid="frames-query"
      />
      <SelectionHint />
      {all === 'failed' ? (
        <LoadFailed />
      ) : !frames ? (
        <Loading />
      ) : found ? (
        found.length === 0 ? (
          <NothingFound />
        ) : (
          <FrameGrid frames={found} label={t('collection.frames')} testId="frame-results" />
        )
      ) : group ? (
        <Section
          title={t(`frames.group.${group}`)}
          data-group={group}
          action={
            <Button variant="ghost" size="sm" onClick={() => setGroup(undefined)}>
              {t('frames.allGroups')}
            </Button>
          }
        >
          {group === 'magnets' ? (
            <Magnets frames={byGroup.find(({ id }) => id === group)?.frames ?? []} />
          ) : (
            <FrameGrid
              frames={byGroup.find(({ id }) => id === group)?.frames ?? []}
              label={t(`frames.group.${group}`)}
              group={group}
              testId="frame-results"
            />
          )}
        </Section>
      ) : (
        <div className="flex flex-col gap-4" data-testid="frame-groups">
          <Section title={t('frames.featured')} data-group="featured">
            <FrameGrid frames={featured} label={t('frames.featured')} />
          </Section>
          {byGroup.map(({ id, frames: ofGroup }) => (
            <GroupPreview key={id} group={id} frames={ofGroup} onShowAll={() => setGroup(id)} />
          ))}
        </div>
      )}
    </>
  );
}
