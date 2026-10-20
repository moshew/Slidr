import type { Shadow, Stroke } from '@slidr/model';
import { Field, NumberField, SegmentedControl } from '@slidr/ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RadiusControl } from './effects';
import { ColorRow, SliderField } from './parts';
import type { MixedFields } from './several';

/*
 * The contents of the row B popovers that are not the fill editor: outline, shadow, corners and
 * opacity. Each takes a value and reports every change (`onChange`) and the end of a drag or an
 * edit (`onGestureEnd`), so the host makes a drag one undo step (see `useGestureTx`).
 *
 * With several elements selected an editor shows what they share (`several.ts`): a field they
 * do not share is shown as mixed. A change is also reported as a function of the value it is made
 * to, so that each element keeps the fields the change does not touch: outlines of three colours
 * that are made thicker stay of three colours.
 */

/** Nothing selected in a segmented control: the elements do not share a choice. */
const NO_CHOICE = '';

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

/** A change to a stroke, as a function of the stroke it is made to. Null takes the stroke away. */
export type StrokeChange = (stroke: Stroke | undefined) => Stroke | null;

export interface StrokeEditorProps {
  /** Undefined for no outline. */
  value: Stroke | undefined;
  /** With several elements: the fields of the outline they do not share. */
  mixed?: MixedFields<Stroke>;
  /**
   * The outline after the change, and the change itself. Null removes the outline (never sent
   * when `required`).
   */
  onChange: (stroke: Stroke | null, change: StrokeChange) => void;
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
  mixed,
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
  const isMixed = (field: keyof Stroke | 'state') => mixed?.has(field) ?? false;
  const style: Dash | 'none' = value ? (value.dash ?? 'solid') : 'none';
  const styles: (Dash | 'none')[] = required
    ? ['solid', 'dashed', 'dotted']
    : ['none', 'solid', 'dashed', 'dotted'];

  /** A step of a drag: the change, and what it makes of the outline on show. */
  const change = (next: StrokeChange) => onChange(next(value), next);
  /** A change that is a whole undo step by itself. */
  const commit = (next: StrokeChange) => {
    change(next);
    onGestureEnd();
  };
  /** Sets fields of the outline an element has; one without an outline starts from the one on show. */
  const set =
    (fields: Partial<Stroke>): StrokeChange =>
    (own) => ({ ...(own ?? value ?? defaultStroke), ...fields });
  const setStyle = (next: Dash | 'none') => {
    if (next === 'none') {
      last.current = value;
      return commit(() => null);
    }
    commit((own) => {
      const { dash: _dash, ...base } = own ?? last.current ?? defaultStroke;
      return next === 'solid' ? base : { ...base, dash: next };
    });
  };

  return (
    <>
      <SegmentedControl
        aria-label={t('stroke.style')}
        fill
        options={styles.map((option) => ({ value: option, label: t(`stroke.${option}`) }))}
        value={isMixed('state') || isMixed('dash') ? (NO_CHOICE as Dash) : style}
        onValueChange={setStyle}
      />
      {isMixed('state') && <p className="text-xs text-ui-fg-muted">{t('several.stroke')}</p>}
      {value && (
        <>
          <ColorRow
            label={t('stroke.color')}
            value={value.color}
            mixed={isMixed('color')}
            onChange={(color) => change(set({ color }))}
            onGestureEnd={onGestureEnd}
          />
          <SliderField
            label={t('stroke.width')}
            value={isMixed('width') ? null : value.width}
            min={1}
            max={MAX_STROKE}
            unit="px"
            onChange={(width) => change(set({ width }))}
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
                  value={
                    isMixed('cap') || isMixed('dash')
                      ? (NO_CHOICE as Cap)
                      : (value.cap ?? (value.dash === 'dotted' ? 'round' : 'butt'))
                  }
                  onValueChange={(cap) => commit(set({ cap }))}
                />
              </Field>
              <Field label={t('stroke.join')}>
                <SegmentedControl
                  aria-label={t('stroke.join')}
                  fill
                  size="sm"
                  options={joins.map((join) => ({ value: join, label: t(joinLabels[join]) }))}
                  value={isMixed('join') ? (NO_CHOICE as Join) : (value.join ?? defaultJoin)}
                  onValueChange={(join) => commit(set({ join }))}
                />
              </Field>
            </>
          )}
        </>
      )}
    </>
  );
}

/** A change to a shadow, as a function of the shadow it is made to. Null takes the shadow away. */
export type ShadowChange = (shadow: Shadow | undefined) => Shadow | null;

export interface ShadowEditorProps {
  /** Undefined for no shadow. */
  value: Shadow | undefined;
  /** With several elements: the fields of the shadow they do not share. */
  mixed?: MixedFields<Shadow>;
  /** The shadow after the change, and the change itself. Null removes the shadow. */
  onChange: (shadow: Shadow | null, change: ShadowChange) => void;
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
  mixed,
  onChange,
  onGestureEnd,
  themeShadow,
  spread,
}: ShadowEditorProps) {
  const { t } = useTranslation('objects');
  /** The shadow that was switched off, so switching it back on restores it. */
  const last = useRef<Shadow | undefined>(undefined);

  const isMixed = (field: keyof Shadow | 'state') => mixed?.has(field) ?? false;

  /** A step of a drag: the change, and what it makes of the shadow on show. */
  const change = (next: ShadowChange) => onChange(next(value), next);
  /** A change that is a whole undo step by itself. */
  const commit = (next: ShadowChange) => {
    change(next);
    onGestureEnd();
  };
  /** Sets fields of the shadow an element has; one without a shadow starts from the one on show. */
  const set =
    (fields: Partial<Shadow>): ShadowChange =>
    (own) => ({ ...(own ?? value ?? themeShadow), ...fields });

  return (
    <>
      <SegmentedControl<'off' | 'on'>
        aria-label={t('shadow.state')}
        fill
        options={[
          { value: 'off', label: t('shadow.off') },
          { value: 'on', label: t('shadow.on') },
        ]}
        value={isMixed('state') ? (NO_CHOICE as 'off') : value ? 'on' : 'off'}
        onValueChange={(state) => {
          // An element that has a shadow keeps its own.
          if (state === 'on') return commit((own) => own ?? last.current ?? themeShadow);
          last.current = value;
          commit(() => null);
        }}
      />
      {isMixed('state') && <p className="text-xs text-ui-fg-muted">{t('several.shadow')}</p>}
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
                value={isMixed('x') ? null : value.x}
                placeholder="–"
                onValueChange={(x) => commit(set({ x }))}
              />
            </Field>
            <Field label={t('shadow.y')} className="flex-1">
              <NumberField
                aria-label={t('shadow.y')}
                size="sm"
                unit="px"
                min={-MAX_OFFSET}
                max={MAX_OFFSET}
                value={isMixed('y') ? null : value.y}
                placeholder="–"
                onValueChange={(y) => commit(set({ y }))}
              />
            </Field>
          </div>
          <SliderField
            label={t('shadow.blur')}
            value={isMixed('blur') ? null : value.blur}
            max={MAX_BLUR}
            unit="px"
            onChange={(blur) => change(set({ blur }))}
            onCommit={onGestureEnd}
          />
          {spread && (
            <SliderField
              label={t('shadow.spread')}
              value={isMixed('spread') ? null : (value.spread ?? 0)}
              max={MAX_SPREAD}
              unit="px"
              onChange={(next) => change((own) => withSpread(own ?? value, next))}
              onCommit={onGestureEnd}
            />
          )}
          <ColorRow
            label={t('shadow.color')}
            value={value.color}
            mixed={isMixed('color')}
            onChange={(color) => change(set({ color }))}
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
  /** 0..1, as the model has it; null when the selected elements do not share one. */
  value: number | null;
  label: string;
  onChange: (opacity: number) => void;
  onGestureEnd: () => void;
}) {
  return (
    <SliderField
      label={label}
      value={value === null ? null : Math.round(value * 100)}
      unit="%"
      onChange={(percent) => onChange(percent / 100)}
      onCommit={onGestureEnd}
    />
  );
}
