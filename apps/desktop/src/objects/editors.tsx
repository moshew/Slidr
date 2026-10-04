import type { Shadow, Stroke } from '@slidr/model';
import { Field, NumberField, SegmentedControl } from '@slidr/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RadiusControl } from './effects';
import { ColorRow, SliderField } from './parts';

/*
 * The contents of the row B popovers that are not the fill editor: outline, shadow, corners and
 * opacity. Each takes a value and reports every change (`onChange`) and the end of a drag or an
 * edit (`onGestureEnd`), so the host makes a drag one undo step (see `useGestureTx`).
 */

type Dash = NonNullable<Stroke['dash']>;
type Cap = NonNullable<Stroke['cap']>;
type Join = NonNullable<Stroke['join']>;

const caps: readonly Cap[] = ['butt', 'round', 'square'];
const capLabels = {
  butt: 'stroke.capButt',
  round: 'stroke.capRound',
  square: 'stroke.capSquare',
} as const;
const joins: readonly Join[] = ['miter', 'round', 'bevel'];
const joinLabels = {
  miter: 'stroke.joinMiter',
  round: 'stroke.joinRound',
  bevel: 'stroke.joinBevel',
} as const;

/** The widest stroke the controls offer, in slide pixels. */
const MAX_STROKE = 60;

export interface StrokeEditorProps {
  /** Undefined for no outline. */
  value: Stroke | undefined;
  /** Null removes the outline (never sent when `required`). */
  onChange: (stroke: Stroke | null) => void;
  onGestureEnd: () => void;
  /** A line always has a stroke: "none" is not offered. */
  required?: boolean;
  /** Offers line ends and joins: only where the renderer draws them (`strokeHasCapAndJoin`). */
  capAndJoin: boolean;
  /** The join the renderer uses when the stroke names none: round for lines, sharp for shapes. */
  defaultJoin: Join;
  /** What "on" starts from when there was no outline. */
  defaultStroke: Stroke;
}

/** Outline of a shape, stroke of a line, border of an image (SHP-03, SHP-05, IMG-08). */
export function StrokeEditor({
  value,
  onChange,
  onGestureEnd,
  required = false,
  capAndJoin,
  defaultJoin,
  defaultStroke,
}: StrokeEditorProps) {
  const { t } = useTranslation('objects');
  /** The outline that was switched off, so switching it back on restores it. */
  const last = useRef<Stroke | undefined>(undefined);
  const style: Dash | 'none' = value ? (value.dash ?? 'solid') : 'none';
  const styles: (Dash | 'none')[] = required
    ? ['solid', 'dashed', 'dotted']
    : ['none', 'solid', 'dashed', 'dotted'];

  const commit = (stroke: Stroke | null) => {
    onChange(stroke);
    onGestureEnd();
  };
  const setStyle = (next: Dash | 'none') => {
    if (next === 'none') {
      last.current = value;
      return commit(null);
    }
    const { dash: _dash, ...base } = value ?? last.current ?? defaultStroke;
    commit(next === 'solid' ? base : { ...base, dash: next });
  };

  return (
    <>
      <SegmentedControl
        aria-label={t('stroke.style')}
        fill
        options={styles.map((option) => ({ value: option, label: t(`stroke.${option}`) }))}
        value={style}
        onValueChange={setStyle}
      />
      {value && (
        <>
          <ColorRow
            label={t('stroke.color')}
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
            onGestureEnd={onGestureEnd}
          />
          <SliderField
            label={t('stroke.width')}
            value={value.width}
            min={1}
            max={MAX_STROKE}
            unit="px"
            onChange={(width) => onChange({ ...value, width })}
            onCommit={onGestureEnd}
          />
          {capAndJoin && (
            <>
              <Field label={t('stroke.cap')}>
                <SegmentedControl
                  aria-label={t('stroke.cap')}
                  fill
                  size="sm"
                  options={caps.map((cap) => ({ value: cap, label: t(capLabels[cap]) }))}
                  // As the renderer draws a stroke that names no cap: dots are round.
                  value={value.cap ?? (value.dash === 'dotted' ? 'round' : 'butt')}
                  onValueChange={(cap) => commit({ ...value, cap })}
                />
              </Field>
              <Field label={t('stroke.join')}>
                <SegmentedControl
                  aria-label={t('stroke.join')}
                  fill
                  size="sm"
                  options={joins.map((join) => ({ value: join, label: t(joinLabels[join]) }))}
                  value={value.join ?? defaultJoin}
                  onValueChange={(join) => commit({ ...value, join })}
                />
              </Field>
            </>
          )}
        </>
      )}
    </>
  );
}

export interface ShadowEditorProps {
  /** Undefined for no shadow. */
  value: Shadow | undefined;
  /** Null removes the shadow. */
  onChange: (shadow: Shadow | null) => void;
  onGestureEnd: () => void;
  /** What "on" gives: the shadow of the deck's theme. */
  themeShadow: Shadow;
  /** Offers spread: only where the renderer can draw it (`supportsSpread`). */
  spread: boolean;
}

const MAX_OFFSET = 200;
const MAX_BLUR = 100;
const MAX_SPREAD = 60;

/** A shadow with a spread; none is stored as no spread at all. */
function withSpread(shadow: Shadow, spread: number): Shadow {
  const { spread: _spread, ...rest } = shadow;
  return spread ? { ...rest, spread } : rest;
}

/** The shadow of an element (SHP-03, IMG-08): on or off, offset, blur, spread and colour. */
export function ShadowEditor({
  value,
  onChange,
  onGestureEnd,
  themeShadow,
  spread,
}: ShadowEditorProps) {
  const { t } = useTranslation('objects');
  /** The shadow that was switched off, so switching it back on restores it. */
  const last = useRef<Shadow | undefined>(undefined);

  const commit = (shadow: Shadow | null) => {
    onChange(shadow);
    onGestureEnd();
  };

  return (
    <>
      <SegmentedControl
        aria-label={t('shadow.state')}
        fill
        options={[
          { value: 'off', label: t('shadow.off') },
          { value: 'on', label: t('shadow.on') },
        ]}
        value={value ? 'on' : 'off'}
        onValueChange={(state) => {
          if (state === 'on') return commit(last.current ?? themeShadow);
          last.current = value;
          commit(null);
        }}
      />
      {value && (
        <>
          <div className="flex gap-3">
            <Field label={t('shadow.x')} className="flex-1">
              <NumberField
                aria-label={t('shadow.x')}
                size="sm"
                unit="px"
                min={-MAX_OFFSET}
                max={MAX_OFFSET}
                value={value.x}
                onValueChange={(x) => commit({ ...value, x })}
              />
            </Field>
            <Field label={t('shadow.y')} className="flex-1">
              <NumberField
                aria-label={t('shadow.y')}
                size="sm"
                unit="px"
                min={-MAX_OFFSET}
                max={MAX_OFFSET}
                value={value.y}
                onValueChange={(y) => commit({ ...value, y })}
              />
            </Field>
          </div>
          <SliderField
            label={t('shadow.blur')}
            value={value.blur}
            max={MAX_BLUR}
            unit="px"
            onChange={(blur) => onChange({ ...value, blur })}
            onCommit={onGestureEnd}
          />
          {spread && (
            <SliderField
              label={t('shadow.spread')}
              value={value.spread ?? 0}
              max={MAX_SPREAD}
              unit="px"
              onChange={(next) => onChange(withSpread(value, next))}
              onCommit={onGestureEnd}
            />
          )}
          <ColorRow
            label={t('shadow.color')}
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
            onGestureEnd={onGestureEnd}
          />
        </>
      )}
    </>
  );
}

/** Corner rounding: pixels of `effects.radius`, or the roundness of a rounded rectangle. */
export function RadiusEditor({
  control,
  onChange,
  onGestureEnd,
}: {
  control: RadiusControl;
  onChange: (value: number) => void;
  onGestureEnd: () => void;
}) {
  const { t } = useTranslation('objects');
  return (
    <SliderField
      label={control.unit === 'px' ? t('radius.radius') : t('radius.roundness')}
      value={control.value}
      max={control.max}
      unit={control.unit}
      onChange={onChange}
      onCommit={onGestureEnd}
    />
  );
}

/** Opacity of the whole element, 0 to 100%. */
export function OpacityEditor({
  value,
  label,
  onChange,
  onGestureEnd,
}: {
  /** 0..1, as the model has it. */
  value: number;
  label: string;
  onChange: (opacity: number) => void;
  onGestureEnd: () => void;
}) {
  return (
    <SliderField
      label={label}
      value={Math.round(value * 100)}
      unit="%"
      onChange={(percent) => onChange(percent / 100)}
      onCommit={onGestureEnd}
    />
  );
}
