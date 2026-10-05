import type { AssetMeta, Color, Fill } from '@slidr/model';
import { colorCss } from '@slidr/renderer';
import {
  parseHex,
  Button,
  cx,
  Field,
  Icon,
  IconButton,
  NumberField,
  SegmentedControl,
  Select,
} from '@slidr/ui';
import { ImageOff, ImageUp, Trash2 } from '@slidr/ui/icons';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, colorToHex } from '../controls';
import { tell, useDeck, useEditor } from '../shell';
import {
  addStop,
  convertFill,
  fillKind,
  isGradient,
  moveStop,
  normalizeAngle,
  rememberFill,
  removeStop,
  setGradientType,
  setStopColor,
  type FillKind,
  type FillMemory,
  type GradientFill,
  type GradientStop,
  type GradientType,
  type ImageFill,
  type ResolveColor,
} from './fill';
import { IMAGE_FILES, isPicture, pickFiles } from './insert';
import { importPicture } from './takeIn';
import { ColorRow, FillSwatch, SliderField, useThemeColors } from './parts';

export interface FillEditorProps {
  value: Fill;
  /**
   * Several elements are selected and do not share one fill: no kind is selected, and `value`
   * (which the host gives as no fill) is only what a chosen kind starts from.
   */
  mixed?: boolean;
  /**
   * Every change, also each step of a drag. `asset` is a picture that was just imported for an
   * image fill: the host registers it (`asset.add`) in the same change as the fill.
   */
  onChange: (fill: Fill, asset?: AssetMeta) => void;
  /** A drag or an edit ended: the host closes its undo step (see `useGestureTx`). */
  onGestureEnd: () => void;
  /** The colour a solid fill or a gradient starts from when there is none to carry over. */
  defaultColor: Color;
  /** Offers "none". A slide background always has a fill. */
  allowNone?: boolean;
}

/**
 * The fill editor (SHP-02), the content of a popover: none, a colour, a gradient (linear, radial
 * or conic, with a strip of colour stops) or a picture. One component for a shape's fill and for
 * the slide background. Changing the kind carries over what makes sense (see `convertFill`).
 */
export function FillEditor({
  value,
  mixed = false,
  onChange,
  onGestureEnd,
  defaultColor,
  allowNone = true,
}: FillEditorProps) {
  const { t } = useTranslation('objects');
  const { assets } = useEditor();
  const memory = useRef<FillMemory>({});
  // "Image" was chosen and no picture yet: the fill itself cannot say so, it needs an asset.
  const [awaitingImage, setAwaitingImage] = useState(false);
  const kind = awaitingImage ? 'image' : mixed ? 'mixed' : fillKind(value);

  /** A change that is a whole undo step by itself. */
  const commit = (fill: Fill, asset?: AssetMeta) => {
    onChange(fill, asset);
    onGestureEnd();
  };

  const pickImage = async () => {
    const [file] = await pickFiles(IMAGE_FILES);
    if (!file) return;
    try {
      const asset = await importPicture(assets, file);
      if (!isPicture(asset)) return;
      setAwaitingImage(false);
      commit(
        value.kind === 'image'
          ? { ...value, assetId: asset.id }
          : { kind: 'image', assetId: asset.id, fit: 'cover' },
        asset,
      );
    } catch (error) {
      await tell(t('insert.failed'), error instanceof Error ? error.message : undefined);
    }
  };

  const setKind = (to: FillKind) => {
    memory.current = rememberFill(memory.current, value);
    const next = convertFill(value, to, memory.current, defaultColor);
    if (!next) {
      setAwaitingImage(true);
      void pickImage();
      return;
    }
    setAwaitingImage(false);
    // With mixed fills "none" is a change too, though it is what `value` already says.
    if (mixed || next !== value) commit(next);
  };

  const kinds: FillKind[] = allowNone
    ? ['none', 'solid', 'gradient', 'image']
    : ['solid', 'gradient', 'image'];

  return (
    <div className="flex flex-col gap-3" data-testid="fill-editor">
      <SegmentedControl
        aria-label={t('fill.kind')}
        fill
        options={kinds.map((option) => ({ value: option, label: t(`fill.${option}`) }))}
        // A `css` fill is none of the kinds, and neither are the fills of several elements that
        // differ: no segment is selected until one is chosen.
        value={kind as FillKind}
        onValueChange={setKind}
      />
      {kind === 'css' && <p className="text-xs text-ui-fg-muted">{t('fill.imported')}</p>}
      {kind === 'mixed' && <p className="text-xs text-ui-fg-muted">{t('several.fill')}</p>}
      {kind === 'solid' && value.kind === 'solid' && (
        <ColorRow
          label={t('fill.color')}
          value={value.color}
          onChange={(color) => onChange({ kind: 'solid', color })}
          onGestureEnd={onGestureEnd}
        />
      )}
      {kind === 'gradient' && isGradient(value) && (
        <GradientEditor fill={value} onChange={onChange} onGestureEnd={onGestureEnd} />
      )}
      {kind === 'image' && (
        <ImageFillEditor
          fill={value.kind === 'image' ? value : undefined}
          onPick={() => void pickImage()}
          onChange={onChange}
          onGestureEnd={onGestureEnd}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- gradient */

const gradientTypes: readonly GradientType[] = ['linear', 'radial', 'conic'];

function GradientEditor({
  fill,
  onChange,
  onGestureEnd,
}: {
  fill: GradientFill;
  onChange: (fill: Fill) => void;
  onGestureEnd: () => void;
}) {
  const { t } = useTranslation('objects');
  const theme = useDeck((s) => s.deck.theme);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, fill.stops.length - 1);
  const stop = fill.stops[index];
  const resolve: ResolveColor = (color) => parseHex(colorToHex(color, theme));

  /** Writes an edit of the stops and follows the edited stop to where it is now. */
  const apply = (edit: { stops: GradientStop[]; index: number }): number => {
    setSelected(edit.index);
    onChange({ ...fill, stops: edit.stops });
    return edit.index;
  };
  const remove = (at: number) => {
    const edit = removeStop(fill.stops, at);
    if (!edit) return;
    apply(edit);
    onGestureEnd();
  };

  return (
    <>
      <SegmentedControl
        aria-label={t('fill.type')}
        fill
        size="sm"
        options={gradientTypes.map((type) => ({ value: type, label: t(`fill.${type}`) }))}
        value={fill.kind}
        onValueChange={(type) => {
          onChange(setGradientType(fill, type));
          onGestureEnd();
        }}
      />
      <Field label={t('fill.strip')}>
        <GradientStrip
          stops={fill.stops}
          selected={index}
          label={t('fill.stripHint')}
          stopLabel={(n) => t('fill.stop', { n })}
          onSelect={setSelected}
          onMove={(at, position) => apply(moveStop(fill.stops, at, position))}
          onAdd={(position) => apply(addStop(fill.stops, position, resolve))}
          onRemove={remove}
          onGestureEnd={onGestureEnd}
        />
      </Field>
      {stop && (
        <div className="flex items-center gap-2">
          <ColorField
            value={stop.color}
            label={t('fill.stopColor')}
            alpha
            size="sm"
            onChange={(color) =>
              color && onChange({ ...fill, stops: setStopColor(fill.stops, index, color) })
            }
            onGestureEnd={onGestureEnd}
            onCloseAutoFocus={onGestureEnd}
          />
          <NumberField
            aria-label={t('fill.stopPosition')}
            size="sm"
            className="w-18"
            unit="%"
            min={0}
            max={100}
            value={Math.round(stop.at * 100)}
            onValueChange={(percent) => {
              apply(moveStop(fill.stops, index, percent / 100));
              onGestureEnd();
            }}
          />
          <span className="flex-1" />
          <IconButton
            icon={Trash2}
            label={t('fill.removeStop')}
            size="sm"
            disabled={fill.stops.length <= 2}
            onClick={() => remove(index)}
          />
        </div>
      )}
      {'angle' in fill && (
        <SliderField
          label={t('fill.angle')}
          value={normalizeAngle(fill.angle)}
          max={360}
          unit="°"
          onChange={(angle) => onChange({ ...fill, angle })}
          onCommit={onGestureEnd}
        />
      )}
    </>
  );
}

/** Half the width of a stop handle (`size-4`): the strip reaches that far past its two ends. */
const HANDLE_REACH = 8;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface GradientStripProps {
  stops: readonly GradientStop[];
  selected: number;
  /** Names the strip, and says what a click on it does. */
  label: string;
  stopLabel: (n: number) => string;
  onSelect: (index: number) => void;
  /** Moves a stop and returns its index afterwards: stops stay in order of position. */
  onMove: (index: number, at: number) => number;
  /** Adds a stop and returns its index. */
  onAdd: (at: number) => number;
  onRemove: (index: number) => void;
  onGestureEnd: () => void;
}

/**
 * The strip of colour stops. A click on the strip adds a stop, and the same press drags it; a
 * handle is dragged along, and may pass its neighbours; arrows move the focused handle by 1%
 * (Shift: 10%) and Delete removes it. Like the colour picker's strips it is physical, so it does
 * not mirror with the UI: position 0 is on the left.
 */
function GradientStrip({
  stops,
  selected,
  label,
  stopLabel,
  onSelect,
  onMove,
  onAdd,
  onRemove,
  onGestureEnd,
}: GradientStripProps) {
  const colors = useThemeColors();
  const track = useRef<HTMLDivElement>(null);
  /** The stop under the pointer while it is down. Its index changes as it passes others. */
  const dragging = useRef<number | null>(null);
  /** A stop moved by the keyboard keeps the focus, whichever handle draws it afterwards. */
  const focusAfter = useRef<number | null>(null);
  useEffect(() => {
    if (focusAfter.current === null) return;
    track.current?.querySelector<HTMLElement>(`[data-stop="${focusAfter.current}"]`)?.focus();
    focusAfter.current = null;
  });

  const positionOf = (event: ReactPointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-stop]');
    if (handle) {
      dragging.current = Number(handle.dataset.stop);
      onSelect(dragging.current);
      handle.focus();
    } else {
      dragging.current = onAdd(positionOf(event));
      focusAfter.current = dragging.current;
    }
    // The handle takes the focus here; the press itself must not hand it to the strip.
    event.preventDefault();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const at = positionOf(event);
    if (Math.round(at * 1000) === Math.round((stops[dragging.current]?.at ?? -1) * 1000)) return;
    dragging.current = onMove(dragging.current, at);
    focusAfter.current = dragging.current;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging.current = null;
    onGestureEnd();
  };

  const onKeyDown = (event: KeyboardEvent, index: number, stop: GradientStop) => {
    const by = event.shiftKey ? 0.1 : 0.01;
    const steps: Record<string, number> = {
      ArrowLeft: -by,
      ArrowDown: -by,
      ArrowRight: by,
      ArrowUp: by,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      focusAfter.current = onMove(index, stop.at + step);
      onGestureEnd();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (stops.length <= 2) return;
      focusAfter.current = Math.max(0, index - 1);
      onRemove(index);
    }
  };

  // The strip is drawn past the track by half a handle, so the gradient is placed in the track's
  // own terms: a stop's colour sits exactly under the middle of its handle.
  const gradient = stops
    .map(
      (stop) =>
        `${colorCss(stop.color)} calc(${HANDLE_REACH}px + (100% - ${2 * HANDLE_REACH}px) * ${stop.at})`,
    )
    .join(', ');

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={label}
      data-testid="gradient-strip"
      className="relative h-6 cursor-copy touch-none px-2"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span
        aria-hidden
        style={{ ...colors, backgroundImage: `linear-gradient(90deg, ${gradient})` }}
        className="absolute inset-0 rounded-control border border-ui-line bg-ui-field"
      />
      <div ref={track} style={colors} className="relative h-full">
        {stops.map((stop, i) => (
          <button
            key={i}
            type="button"
            role="slider"
            data-stop={i}
            aria-label={stopLabel(i + 1)}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(stop.at * 100)}
            aria-current={i === selected}
            tabIndex={i === selected ? 0 : -1}
            style={{ insetInlineStart: `${stop.at * 100}%`, backgroundColor: colorCss(stop.color) }}
            className={cx(
              'absolute top-1/2 size-4 -translate-1/2 cursor-default rounded-full border-2 border-ui-on-accent shadow-raised',
              i === selected && 'outline-2 outline-offset-1 outline-ui-accent',
            )}
            onFocus={() => onSelect(i)}
            onKeyDown={(event) => onKeyDown(event, i, stop)}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- image */

type Fit = ImageFill['fit'];
const fits: readonly Fit[] = ['cover', 'contain', 'fill', 'tile'];
const fitLabels = {
  cover: 'fill.fitCover',
  contain: 'fill.fitContain',
  fill: 'fill.fitFill',
  tile: 'fill.fitTile',
} as const;

/** The fill at an opacity; fully opaque is stored as no opacity at all. */
function withOpacity(fill: ImageFill, opacity: number): ImageFill {
  const { opacity: _opacity, ...rest } = fill;
  return opacity < 1 ? { ...rest, opacity } : rest;
}

function ImageFillEditor({
  fill,
  onPick,
  onChange,
  onGestureEnd,
}: {
  /** Undefined while "image" is chosen and no picture has been picked yet. */
  fill: ImageFill | undefined;
  onPick: () => void;
  onChange: (fill: Fill) => void;
  onGestureEnd: () => void;
}) {
  const { t } = useTranslation('objects');
  return (
    <>
      <div className="flex items-center gap-3">
        {fill ? (
          <FillSwatch fill={withOpacity(fill, 1)} className="h-12 w-20" />
        ) : (
          <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-small bg-ui-field text-ui-fg-subtle">
            <Icon icon={ImageOff} size="md" />
          </span>
        )}
        <div className="flex min-w-0 flex-col items-start gap-1">
          {!fill && <span className="text-xs text-ui-fg-muted">{t('fill.noImage')}</span>}
          <Button size="sm" icon={ImageUp} onClick={onPick}>
            {fill ? t('fill.replaceImage') : t('fill.chooseImage')}
          </Button>
        </div>
      </div>
      {fill && (
        <>
          <Field label={t('fill.fit')}>
            <Select
              aria-label={t('fill.fit')}
              size="sm"
              options={fits.map((fit) => ({ value: fit, label: t(fitLabels[fit]) }))}
              value={fill.fit}
              onValueChange={(fit) => {
                onChange({ ...fill, fit });
                onGestureEnd();
              }}
            />
          </Field>
          <SliderField
            label={t('fill.opacity')}
            value={Math.round((fill.opacity ?? 1) * 100)}
            unit="%"
            onChange={(percent) => onChange(withOpacity(fill, percent / 100))}
            onCommit={onGestureEnd}
          />
        </>
      )}
    </>
  );
}
