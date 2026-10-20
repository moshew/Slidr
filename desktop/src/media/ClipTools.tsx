import type { VideoElement } from '@slidr/model';
import {
  Button,
  Field,
  IconButton,
  NumberField,
  Toggle,
  SegmentedControl,
  Slider,
} from '@slidr/ui';
import {
  ImagePlay,
  PanelBottom,
  Pause,
  Play,
  Repeat,
  Scissors,
  Volume2,
  VolumeX,
} from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../controls';
import { IMAGE_FILES, isPicture, pickFiles } from '../objects/insert';
import { importPicture } from '../objects/takeIn';
import { PopoverTool, SliderField, ToolGroup, ToolRow } from '../objects/parts';
import { isTarget, useTarget, type Target } from '../objects/target';
import { tell, useDeck, useEditor } from '../shell';
import {
  formatMoment,
  formatTime,
  MIN_CLIP_MS,
  posterKind,
  trimPatch,
  trimRange,
  type ClipElement,
} from './clip';
import { usePlayback, type Playback } from './playback';

/*
 * Row B for a video or a sound (SPEC 4.4, 8.8; WG5-T12): playing it in place, how it starts,
 * loop, mute and volume (MED-02), and its trim and poster (MED-03). Every control writes fields
 * of the element with one `element.update`: one undo step, and a drag of a slider is one step.
 * Playing and scrubbing change nothing in the deck.
 */

type ClipTarget = Target<ClipElement>;

interface ToolProps {
  target: ClipTarget;
  playback: Playback;
}

/** The length of the clip's file in seconds: as the browser reads it, else as the asset states it. */
function useDuration(target: ClipTarget, playback: Playback): number | undefined {
  const stated = useDeck((s) => s.deck.assets[target.element.assetId]?.durationMs);
  return playback.duration ?? (stated === undefined ? undefined : stated / 1000);
}

/* ---------------------------------------------------------------- playing in place */

function PlayTool({ target, playback }: ToolProps) {
  const { t } = useTranslation('media');
  const duration = useDuration(target, playback);
  const now = formatTime(playback.time);
  const total = duration === undefined ? undefined : formatTime(duration);
  return (
    <>
      <IconButton
        icon={playback.playing ? Pause : Play}
        size="sm"
        label={playback.playing ? t('clip.pause') : t('clip.play')}
        data-testid="clip-play"
        data-playing={playback.playing}
        disabled={!playback.ready}
        onClick={playback.toggle}
      />
      {/* A time reads left to right in every language. */}
      <span
        dir="ltr"
        data-testid="clip-time"
        // A role, so that the name is read: on a bare span it is not.
        role="timer"
        aria-label={total ? t('clip.time', { now, total }) : now}
        className="px-1 text-xs text-ui-fg-muted tabular-nums"
      >
        {total ? `${now} / ${total}` : now}
      </span>
    </>
  );
}

/* ---------------------------------------------------------------- how it plays */

function StartTool({ target }: { target: ClipTarget }) {
  const { t } = useTranslation('media');
  return (
    <SegmentedControl
      aria-label={t('clip.start.label')}
      size="sm"
      value={target.element.autoplay ? 'auto' : 'click'}
      onValueChange={(start) =>
        target.update({ autoplay: start === 'auto' }, { label: t('clip.history.start') })
      }
      options={[
        { value: 'auto', label: t('clip.start.auto') },
        { value: 'click', label: t('clip.start.click') },
      ]}
    />
  );
}

function VolumeTool({ target }: { target: ClipTarget }) {
  const { t } = useTranslation('media');
  const tx = useGestureTx();
  return (
    <PopoverTool label={t('clip.volume')} icon={Volume2} onClose={tx.end}>
      <SliderField
        label={t('clip.volume')}
        value={Math.round(target.element.volume * 100)}
        unit="%"
        onChange={(percent) =>
          target.update(
            { volume: percent / 100 },
            { txId: tx.id(), label: t('clip.history.volume') },
          )
        }
        onCommit={tx.end}
      />
    </PopoverTool>
  );
}

function PlaybackTools({ target }: { target: ClipTarget }) {
  const { t } = useTranslation('media');
  const { element } = target;
  return (
    <ToolGroup label={t('clip.groups.playback')}>
      <StartTool target={target} />
      <Toggle
        icon={Repeat}
        size="sm"
        label={t('clip.loop')}
        pressed={element.loop}
        onPressedChange={(loop) => target.update({ loop }, { label: t('clip.history.loop') })}
      />
      {element.type === 'video' && (
        <Toggle
          icon={VolumeX}
          size="sm"
          label={t('clip.mute')}
          pressed={element.muted}
          onPressedChange={(muted) => target.update({ muted }, { label: t('clip.history.mute') })}
        />
      )}
      <VolumeTool target={target} />
      {element.type === 'audio' && (
        <Toggle
          icon={PanelBottom}
          size="sm"
          label={t('clip.controls')}
          pressed={element.showControls}
          onPressedChange={(showControls) =>
            target.update({ showControls }, { label: t('clip.history.controls') })
          }
        />
      )}
    </ToolGroup>
  );
}

/* ---------------------------------------------------------------- trim and poster */

/**
 * The clip's own time line: dragging it shows that moment on the slide, without playing. It runs
 * left to right in every language, as the time of a player does.
 */
function Scrubber({ playback, duration }: { playback: Playback; duration: number | undefined }) {
  const { t } = useTranslation('media');
  return (
    <Field label={t('clip.position')}>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={t('clip.position')}
          dir="ltr"
          className="min-w-0 flex-1"
          value={Math.min(playback.time, duration ?? playback.time)}
          min={0}
          max={duration ?? Math.max(playback.time, 1)}
          step={0.05}
          disabled={!playback.ready || duration === undefined}
          onValueChange={playback.seek}
        />
        <span
          dir="ltr"
          data-testid="clip-position"
          className="w-12 shrink-0 text-end text-xs text-ui-fg-muted tabular-nums"
        >
          {formatMoment(playback.time)}
        </span>
      </div>
    </Field>
  );
}

function TrimTool({ target, playback }: ToolProps) {
  const { t } = useTranslation('media');
  const { element } = target;
  const duration = useDuration(target, playback);
  const durationMs = duration === undefined ? undefined : duration * 1000;
  const { startMs, endMs } = trimRange(element, durationMs);
  const label = t('clip.history.trim');
  const set = (edge: 'start' | 'end', ms: number) => {
    const patch = trimPatch(element, durationMs, edge, ms);
    if (patch) target.update(patch, { label });
  };
  // Without the length of the file there is no end to keep, and nothing to trim against.
  const known = endMs !== undefined;
  return (
    <PopoverTool label={t('clip.trim.title')} icon={Scissors} onClose={playback.rest}>
      <Scrubber playback={playback} duration={duration} />
      <div className="flex items-end gap-2">
        <Field label={t('clip.trim.start')} className="flex-1">
          <NumberField
            aria-label={t('clip.trim.start')}
            size="sm"
            value={startMs / 1000}
            min={0}
            max={known ? (endMs - MIN_CLIP_MS) / 1000 : 0}
            step={0.1}
            precision={2}
            disabled={!known}
            onValueChange={(seconds) => set('start', seconds * 1000)}
          />
        </Field>
        <Button
          size="sm"
          data-testid="clip-trim-start-here"
          disabled={!known}
          onClick={() => set('start', playback.time * 1000)}
        >
          {t('clip.trim.startHere')}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <Field label={t('clip.trim.end')} className="flex-1">
          <NumberField
            aria-label={t('clip.trim.end')}
            size="sm"
            value={known ? endMs / 1000 : null}
            min={(startMs + MIN_CLIP_MS) / 1000}
            max={duration ?? Infinity}
            step={0.1}
            precision={2}
            disabled={!known}
            onValueChange={(seconds) => set('end', seconds * 1000)}
          />
        </Field>
        <Button
          size="sm"
          data-testid="clip-trim-end-here"
          disabled={!known}
          onClick={() => set('end', playback.time * 1000)}
        >
          {t('clip.trim.endHere')}
        </Button>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={!element.trim}
        onClick={() => target.update({ trim: null }, { label })}
      >
        {t('clip.trim.reset')}
      </Button>
    </PopoverTool>
  );
}

function PosterTool({ target, playback }: { target: Target<VideoElement>; playback: Playback }) {
  const { t } = useTranslation('media');
  const { assets, bus } = useEditor();
  const { element } = target;
  const duration = useDuration(target, playback);
  const label = t('clip.history.poster');
  const kind = posterKind(element);
  const picture =
    element.poster && 'assetId' in element.poster
      ? bus.deck.assets[element.poster.assetId]
      : undefined;

  const write = (
    poster: VideoElement['poster'] | null,
    first?: Parameters<ClipTarget['update']>[2],
  ) => target.update({ poster }, { label }, first);

  /** A picture from a file as the poster: the asset and the poster are one change. */
  const choose = async () => {
    const [file] = await pickFiles(IMAGE_FILES);
    if (!file) return;
    try {
      const asset = await importPicture(assets, file);
      if (!isPicture(asset)) return;
      write({ assetId: asset.id }, [{ type: 'asset.add', asset }]);
    } catch (error) {
      await tell(t('clip.insertFailed'), error instanceof Error ? error.message : undefined);
    }
  };

  const now =
    kind === 'frame' && element.poster && 'timeMs' in element.poster
      ? t('clip.poster.nowFrame', { time: formatMoment(element.poster.timeMs / 1000) })
      : kind === 'image'
        ? t('clip.poster.nowImage', { name: picture?.name ?? picture?.file ?? '' })
        : t('clip.poster.nowStart');

  return (
    <PopoverTool label={t('clip.poster.title')} icon={ImagePlay} onClose={playback.rest}>
      <Scrubber playback={playback} duration={duration} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          data-testid="clip-poster-frame"
          disabled={!playback.ready}
          onClick={() => write({ timeMs: Math.round(playback.time * 1000) })}
        >
          {t('clip.poster.frame')}
        </Button>
        <Button size="sm" data-testid="clip-poster-image" onClick={() => void choose()}>
          {t('clip.poster.image')}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span data-testid="clip-poster-now" className="min-w-0 truncate text-xs text-ui-fg-muted">
          <bdi>{now}</bdi>
        </span>
        <Button size="sm" variant="ghost" disabled={kind === 'start'} onClick={() => write(null)}>
          {t('clip.poster.reset')}
        </Button>
      </div>
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- the row */

function ClipTools({ target }: { target: ClipTarget }) {
  const { t } = useTranslation('media');
  const playback = usePlayback(target.element);
  return (
    <ToolRow>
      <ToolGroup label={t('clip.groups.play')}>
        <PlayTool target={target} playback={playback} />
      </ToolGroup>
      <PlaybackTools target={target} />
      <ToolGroup label={t('clip.groups.trim')}>
        <TrimTool target={target} playback={playback} />
        {isTarget(target, 'video') && <PosterTool target={target} playback={playback} />}
      </ToolGroup>
    </ToolRow>
  );
}

/**
 * Row B for the `media` kind of selection: a video or a sound. The effects every element has
 * (opacity, corners, shadow) and the arrange menu follow it, from their own areas.
 */
export function ClipRow() {
  const target = useTarget();
  if (isTarget(target, 'video') || isTarget(target, 'audio')) {
    // A session of playback is of one clip: another clip gets tools of its own.
    return <ClipTools key={target.element.id} target={target} />;
  }
  return null;
}
