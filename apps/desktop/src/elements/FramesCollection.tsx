import { useCallback, useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetMeta, ImageElement, Theme } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import { Replace, Search } from '@slidr/ui/icons';
import { Button, cx, Icon, Input, Tooltip } from '@slidr/ui';
import { useLanguage } from '../i18n';
import { useSelectedPicture } from '../media/replace';
import type { Target } from '../objects/target';
import { tell, useDeck, useEditor, useElementSize } from '../shell';
import {
  Drill,
  LoadFailed,
  Loading,
  NothingFound,
  Section,
  useLoaded,
  useOpenGroup,
} from './collections';
import {
  drawnWhole,
  featuredFrames,
  FRAME_GROUPS,
  frameOutline,
  framePreview,
  framesIn,
  loadFrames,
  MAGNET_SETS,
  SAMPLE_PHOTO,
  searchFrames,
  type FrameGroup,
  type MagnetSet,
  type PhotoFrame,
} from './frames';
import { frameThumb, prepareFrameThumbs, type FrameThumbPicture } from './frameThumbs';
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
 * panel draws once), cut as the frame cuts it. A frame with artwork is drawn by the renderer
 * instead, in the colours of the deck's theme. A whole design, with stickers and words, is
 * shown from the picture that was made of it ahead (`frameThumbs.ts`); one that has no such
 * picture is drawn by the renderer too, once it comes near the visible part of the panel.
 */
export function FrameThumb({ frame }: { frame: PhotoFrame }) {
  const picture = frameThumb(frame, useLanguage());
  if (picture) return <PictureThumb picture={picture} />;
  if (!drawnWhole(frame)) return <OutlineThumb frame={frame} />;
  return frame.extras?.length ? <LateDrawnThumb frame={frame} /> : <DrawnThumb frame={frame} />;
}

/**
 * The picture of a frame that was made ahead. The frame is as large in its tile as the renderer
 * would draw it there, and the room of its shadow reaches past the tile on every side.
 */
function PictureThumb({ picture: { url, spread } }: { picture: FrameThumbPicture }) {
  const size = `${spread * 100}%`;
  const away = `${((1 - spread) / 2) * 100}%`;
  return (
    <span aria-hidden className="relative block size-full">
      <img
        src={url}
        alt=""
        draggable={false}
        // Small, and its tile waits for it: decoded with the frame that first shows it.
        decoding="sync"
        className="absolute max-w-none object-contain"
        style={{ width: size, height: size, left: away, top: away }}
      />
    </span>
  );
}

/**
 * A frame as the renderer draws it on a slide, `width` wide: its picture around a stand-in
 * photograph, and the stickers and the caption beside it in the language given. `bleed` is the
 * room around it for the shadow the frame casts, in pixels.
 */
export function DrawnFrame({
  frame,
  lang,
  theme,
  width,
  bleed = 12,
}: {
  frame: PhotoFrame;
  lang: string;
  theme: Theme;
  width: number;
  bleed?: number;
}) {
  const { deck, slide } = useMemo(() => framePreview(frame, lang, theme), [frame, lang, theme]);
  const scale = width / frame.size.w;
  return (
    // The slide is scaled from its left corner, in a panel that may read from the right. It is
    // cut to the frame, with room around it for the shadow the frame casts.
    <div
      aria-hidden
      dir="ltr"
      className="relative overflow-clip"
      style={{ width, height: frame.size.h * scale, overflowClipMargin: bleed }}
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
  const lang = useLanguage();
  const tile = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(tile);
  const fit = Math.floor(Math.min(width, (height * frame.size.w) / frame.size.h));
  return (
    <div ref={tile} className="flex size-full items-center justify-center">
      {fit > 0 && <DrawnFrame frame={frame} lang={lang} theme={theme} width={fit} />}
    </div>
  );
}

/**
 * The thumbnail of a whole design that has no picture made ahead: drawn by the renderer once its
 * tile is near the visible part of the panel, so a list of many such frames opens at once.
 */
function LateDrawnThumb({ frame }: { frame: PhotoFrame }) {
  const [tile, near] = useNear<HTMLDivElement>();
  return (
    <div ref={tile} className="size-full">
      {near && <DrawnThumb frame={frame} />}
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
  const lang = useLanguage();
  const name = i18n.language.startsWith('he') ? frame.label.he : frame.label.en;
  return (
    <Tooltip content={name}>
      <button
        type="button"
        aria-label={t(picture ? 'frames.reframe' : 'insert', { name })}
        data-frame={frame.id}
        onClick={() => {
          if (picture) void framePicture(editor, picture, frame, lang);
          else if (!insertFrame(editor, frame, lang)) void tell(t('media:noSlide'));
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

/** The digits, and the Latin alphabet, read from the left in an interface read from the right. */
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

/** One set of magnets, under its name. */
function MagnetSet({ set, frames }: { set: MagnetSet; frames: readonly PhotoFrame[] }) {
  const { t } = useTranslation('elements');
  const title = t(`frames.set.${set}`);
  return (
    <Section title={title} data-group={`magnets-${set}`}>
      <FrameGrid frames={frames} label={title} group="magnets" />
    </Section>
  );
}

/**
 * Every magnet, set by set under the name of each set. A magnet is shown from the picture that
 * was made of it ahead (`FrameThumb`), so the list is there at once, each time it is opened.
 */
function Magnets({ frames }: { frames: readonly PhotoFrame[] }) {
  const sets = useMemo(() => bySet(frames).filter((one) => one.frames.length > 0), [frames]);
  return (
    <div className="flex flex-col gap-3" data-testid="frame-results">
      {sets.map((one) => (
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

/** What the selection on the Stage means here: a photograph takes the frame that is clicked. */
function SelectionHint() {
  const { t } = useTranslation('elements');
  if (!useFramedPicture()) return null;
  return (
    <p
      role="status"
      data-testid="frames-hint"
      className="flex items-start gap-2 rounded-control bg-ui-field px-3 py-2 text-xs text-ui-fg"
    >
      <Icon icon={Replace} className="mt-0.5" />
      <span className="min-w-0 flex-1">{t('frames.reframeHint')}</span>
    </p>
  );
}

/**
 * The photo frames: the best of them and every group's first rows, one group in full under its
 * own name, or what a search found. Only the frames of the UI language, and those that have no
 * language (`frameIn`): a group with none of them is not shown.
 */
export function FramesCollection() {
  const { t } = useTranslation('elements');
  const all = useLoaded(loadFrames);
  const lang = useLanguage();
  const [query, setQuery] = useState('');
  const [chosen, setGroup] = useState<FrameGroup>();

  const frames = useMemo(() => (Array.isArray(all) ? framesIn(all, lang) : undefined), [all, lang]);
  const featured = useMemo(() => featuredFrames(frames ?? []), [frames]);
  const byGroup = useMemo(
    () =>
      FRAME_GROUPS.map((id) => ({
        id,
        frames: (frames ?? []).filter((f) => f.group === id),
      })).filter((one) => one.frames.length > 0),
    [frames],
  );
  // A group the language was switched away from, open as it was switched, is no longer shown.
  const group = byGroup.some(({ id }) => id === chosen) ? chosen : undefined;
  const found = useMemo(
    () => (frames && query.trim() ? searchFrames(frames, query, MOST_FOUND) : undefined),
    [frames, query],
  );
  // The magnets are shown from pictures, which are at hand before their group is opened.
  const magnets = byGroup.find(({ id }) => id === 'magnets')?.frames;
  useEffect(
    () => (magnets?.length ? prepareFrameThumbs(magnets, lang) : undefined),
    [magnets, lang],
  );
  // One group in full has the header of the panel: its name, and the way back to all of them.
  const opened = frames && !found ? group : undefined;
  const showGroups = useCallback(() => setGroup(undefined), []);
  useOpenGroup(opened && t(`frames.group.${opened}`), showGroups);

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
      ) : (
        <Drill screen={group ?? 'groups'} depth={group ? 1 : 0} className="flex flex-col">
          {group === 'magnets' ? (
            <Magnets frames={byGroup.find(({ id }) => id === group)?.frames ?? []} />
          ) : group ? (
            <FrameGrid
              frames={byGroup.find(({ id }) => id === group)?.frames ?? []}
              label={t(`frames.group.${group}`)}
              group={group}
              testId="frame-results"
            />
          ) : (
            <div className="flex flex-col gap-4" data-testid="frame-groups">
              {featured.length > 0 && (
                <Section title={t('frames.featured')} data-group="featured">
                  <FrameGrid frames={featured} label={t('frames.featured')} />
                </Section>
              )}
              {byGroup.map(({ id, frames: ofGroup }) => (
                <GroupPreview key={id} group={id} frames={ofGroup} onShowAll={() => setGroup(id)} />
              ))}
            </div>
          )}
        </Drill>
      )}
    </>
  );
}
