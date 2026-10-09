import { useId, useMemo, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Fill, ImageElement, Theme } from '@slidr/model';
import { ImageUp, Replace, Search } from '@slidr/ui/icons';
import { Button, cx, Icon, Input, Tooltip } from '@slidr/ui';
import { useSelectedPicture } from '../media/replace';
import { replaceImage } from '../objects/replace';
import type { Target } from '../objects/target';
import { tell, useDeck, useEditor } from '../shell';
import { LoadFailed, Loading, NothingFound, Section, useLoaded } from './collections';
import {
  featuredFrames,
  FRAME_GROUPS,
  frameOutline,
  loadFrames,
  searchFrames,
  type FrameGroup,
  type PhotoFrame,
} from './frames';
import { framePicture, insertFrame } from './insert';
import { useColumns } from './StickerGrid';
import { FRAME_PHOTO, FRAME_SHADOW, FrameThumbDefs } from './tiles';

/*
 * The photo frames of Elements: what the collection shows, and a frame drawn small. A click on
 * a frame puts it on the slide, empty; while a picture with a photograph is selected on the
 * Stage, the click puts that picture in the frame instead.
 */

/** The most frames a search shows. */
const MOST_FOUND = 60;
/** How many rows of a group the overview shows. */
const PREVIEW_ROWS = 2;

/** What a layer of artwork is painted with in a thumbnail: the deck's own colour for a token. */
function paint(fill: Fill, theme: Theme): { fill: string; fillOpacity?: number } {
  if (fill.kind !== 'solid') return { fill: 'none' };
  const { color } = fill;
  return {
    fill: 'token' in color ? theme.colors[color.token] : color.value,
    ...(color.alpha === undefined ? {} : { fillOpacity: color.alpha }),
  };
}

/**
 * A frame drawn small. The photograph it waits for is a landscape (`FrameThumbDefs`, which the
 * panel draws once), cut as the frame cuts it, under the frame's artwork in the colours of the
 * deck's theme.
 */
export function FrameThumb({ frame }: { frame: PhotoFrame }) {
  const theme = useDeck((s) => s.deck.theme);
  const clip = `frame${useId().replace(/[^\w-]/g, '')}`;
  const { art, size } = frame;
  const view = art?.opening ?? { x: 0, y: 0, ...size };
  const outline = useMemo(() => (art ? undefined : frameOutline(frame)), [art, frame]);
  return (
    <svg aria-hidden viewBox={`0 0 ${size.w} ${size.h}`} className="overflow-visible">
      <clipPath id={clip}>
        {outline !== undefined ? (
          <path d={outline} />
        ) : art?.clip ? (
          <path d={art.clip} transform={`translate(${view.x} ${view.y})`} />
        ) : (
          <rect x={view.x} y={view.y} width={view.w} height={view.h} />
        )}
      </clipPath>
      <use
        href={`#${FRAME_PHOTO}`}
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        clipPath={`url(#${clip})`}
      />
      {art?.layers.map((layer, index) => (
        <path
          key={index}
          d={layer.d}
          filter={layer.shadow ? `url(#${FRAME_SHADOW})` : undefined}
          {...paint(layer.fill, theme)}
        />
      ))}
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
          if (picture) framePicture(picture, frame);
          else if (!insertFrame(editor, frame)) void tell(t('media:noSlide'));
        }}
        className={cx(
          'flex aspect-square w-full cursor-default items-center justify-center rounded-control p-2 transition-colors',
          'focus-visible:-outline-offset-2',
          '[&>svg]:size-full [&>svg]:transition-transform hover:[&>svg]:scale-105',
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
      className="grid grid-cols-3 gap-1 @sm:grid-cols-4 @lg:grid-cols-5 @2xl:grid-cols-6"
      data-testid={testId}
    >
      {frames.map((frame) => (
        <FrameButton key={frame.id} frame={frame} picture={picture} />
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
  const shown = frames.slice(0, PREVIEW_ROWS * useColumns(grid));
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
          <FrameGrid
            frames={byGroup.find(({ id }) => id === group)?.frames ?? []}
            label={t(`frames.group.${group}`)}
            group={group}
            testId="frame-results"
          />
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
