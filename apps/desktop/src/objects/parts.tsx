import { assetsUsedBy, createSlide, type Background, type Color, type Fill } from '@slidr/model';
import { fillStyle, ScaledSlide, themeVariables } from '@slidr/renderer';
import {
  ColorSwatch,
  cx,
  Field,
  Icon,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Tooltip,
  type LucideIcon,
} from '@slidr/ui';
import { useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, colorToHex } from '../controls';
import { useAssetResolver, useDeck } from '../shell';

/* The pieces the row B tools of this area are built from. */

/** The tools of one selection kind: groups with space between them, as the shell lays row B out. */
export function ToolRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4">{children}</div>;
}

export function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      {children}
    </div>
  );
}

const trigger = cx(
  'inline-flex size-control-sm shrink-0 cursor-default flex-col items-center justify-center gap-0.5 rounded-control text-ui-fg-muted transition-colors select-none',
  'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed data-[state=open]:bg-ui-hover data-[state=open]:text-ui-fg',
);

export interface PopoverToolProps {
  /** The accessible name of the button, and its tooltip. */
  label: string;
  icon: LucideIcon;
  /** Drawn under the icon: what the tool is set to now, e.g. the fill. */
  bar?: ReactNode;
  /** The popover closed: the place to close an undo step that a field left open. */
  onClose?: () => void;
  children: ReactNode;
}

/** A row B button that opens a popover with the controls of one property. */
export function PopoverTool({ label, icon, bar, onClose, children }: PopoverToolProps) {
  return (
    <Popover onOpenChange={(open) => !open && onClose?.()}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={label} className={trigger}>
            <Icon icon={icon} />
            {bar}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent>
        <div className="flex flex-col gap-3">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A tooltip for a control inside a popover. It shows on hover and on keyboard focus, but not for
 * the focus a popover hands to its first control when it opens: that tooltip would sit over the
 * neighbouring controls until the pointer moved.
 */
export function Hint({ content, children }: { content: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip content={content} open={open}>
      <span
        className="inline-flex"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onPointerDown={() => setOpen(false)}
        onFocus={(event) => setOpen(event.target.matches(':focus-visible'))}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
    </Tooltip>
  );
}

/** A control beside its label, for the small ones: a colour swatch, a short number. */
export function InlineField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * In place of the bar under a tool's icon, when the selected elements do not share the value the
 * bar would show: an empty, dashed bar, which is neither a colour nor "none".
 */
export function MixedBar() {
  return (
    <span
      aria-hidden
      data-mixed
      className="block h-1.5 w-4 shrink-0 rounded-small border border-dashed border-ui-fg-subtle"
    />
  );
}

export interface SliderFieldProps {
  label: string;
  /** Null when the selected elements do not share one: the number is empty, the slider at rest. */
  value: number | null;
  /** Every step of a drag, and a committed number. */
  onChange: (value: number) => void;
  /** The drag or the edit ended: close the undo step. */
  onCommit: () => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** A quantity as a slider with its number beside it: drag for feel, type for precision. */
export function SliderField({
  label,
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  unit,
}: SliderFieldProps) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={label}
          className="min-w-0 flex-1"
          value={Math.min(max, Math.max(min, value ?? min))}
          min={min}
          max={max}
          step={step}
          onValueChange={onChange}
          onValueCommit={onCommit}
        />
        <NumberField
          aria-label={label}
          size="sm"
          className="w-18 shrink-0"
          value={value}
          placeholder="–"
          min={min}
          max={max}
          step={step}
          unit={unit}
          onValueChange={(next) => {
            onChange(next);
            onCommit();
          }}
        />
      </div>
    </Field>
  );
}

export interface ColorRowProps {
  label: string;
  value: Color;
  /** The selected elements do not share one colour: `value` is then not shown. */
  mixed?: boolean;
  /** Every change, also each step of a drag in the picker. */
  onChange: (color: Color) => void;
  /** A drag or an edit in the picker ended, or the picker closed. */
  onGestureEnd: () => void;
}

/** A colour in a popover: its label, what it is (the theme token it follows, or its hex), and the swatch that opens the picker. */
export function ColorRow({ label, value, mixed = false, onChange, onGestureEnd }: ColorRowProps) {
  const { t } = useTranslation('controls');
  const theme = useDeck((s) => s.deck.theme);
  const name = mixed
    ? t('mixed')
    : 'token' in value
      ? t(`token.${value.token}`)
      : colorToHex({ value: value.value }, theme).toUpperCase();
  const translucent = !mixed && value.alpha !== undefined && value.alpha < 1;
  return (
    <InlineField label={label}>
      <span className="flex items-center gap-1.5 text-xs text-ui-fg-muted tabular-nums">
        <span dir="auto">{name}</span>
        {translucent && <span dir="ltr">{Math.round((value.alpha ?? 1) * 100)}%</span>}
        <ColorField
          value={value}
          mixed={mixed}
          label={label}
          alpha
          size="sm"
          onChange={(color) => color && onChange(color)}
          onGestureEnd={onGestureEnd}
          onCloseAutoFocus={onGestureEnd}
        />
      </span>
    </InlineField>
  );
}

type FillContext = Parameters<typeof fillStyle>[1];

/**
 * The theme's colours as the CSS variables the renderer's colours refer to (`var(--color-primary)`),
 * to set on an element of the app's chrome that shows a colour of the deck.
 */
export function useThemeColors(): CSSProperties {
  const theme = useDeck((s) => s.deck.theme);
  return useMemo(() => {
    const variables: Record<string, string> = {};
    for (const [name, value] of Object.entries(themeVariables(theme))) {
      if (name.startsWith('--color-')) variables[name] = value;
    }
    return variables;
  }, [theme]);
}

/**
 * Paints fills in the app's chrome exactly as the renderer paints them on the slide: the same
 * `fillStyle`, with the theme's colour variables set on the painted element itself.
 */
export function useFillPaint(): (fill: Fill) => CSSProperties {
  const theme = useDeck((s) => s.deck.theme);
  const assets = useDeck((s) => s.deck.assets);
  const meta = useDeck((s) => s.deck.meta);
  const resolve = useAssetResolver();
  const variables = useThemeColors();
  return useMemo(() => {
    const context: FillContext = {
      theme,
      mode: 'thumbnail',
      dir: meta.dir,
      lang: meta.lang,
      asset: (id) => assets[id],
      assetUrl: (id) => {
        const asset = assets[id];
        return asset ? resolve(asset) : undefined;
      },
    };
    return (fill) => ({ ...variables, ...fillStyle(fill, context) });
  }, [theme, assets, meta, resolve, variables]);
}

/**
 * A background as a small slide, `width` pixels wide: the fill, a photo's blur and dim, and the
 * overlay, over the checkerboard that shows through what is translucent. It is drawn by the
 * renderer itself, as an empty slide that has this background, so it is what a slide will get:
 * a swatch of the fill alone showed a dimmed photo bright and a veiled ground bare.
 */
export function BackgroundSwatch({ background, width }: { background: Background; width: number }) {
  const deck = useDeck((s) => s.deck);
  const resolve = useAssetResolver();
  const small = useMemo(() => {
    const slide = createSlide({ id: 's_swatch', background });
    // Only what the background draws: no layout under it, and none of the deck's fonts.
    const assets = Object.fromEntries(
      assetsUsedBy(deck, background).map((asset) => [asset.id, asset]),
    );
    return { deck: { ...deck, layouts: [], slides: [slide], assets }, slide };
  }, [deck, background]);
  return (
    <div aria-hidden className="relative shrink-0 overflow-hidden rounded-small">
      <ColorSwatch color="transparent" className="absolute inset-0" />
      <ScaledSlide
        deck={small.deck}
        slide={small.slide}
        mode="thumbnail"
        width={width}
        resolveAsset={resolve}
      />
      <div className="absolute inset-0 rounded-small border border-ui-line-strong" />
    </div>
  );
}

/**
 * A swatch of any fill: a colour, a gradient or a picture over the checkerboard that shows
 * through what is translucent, and the "none" stroke for no fill.
 */
export function FillSwatch({ fill, className }: { fill: Fill; className?: string }) {
  const paint = useFillPaint();
  if (fill.kind === 'none') return <ColorSwatch color={null} className={className} />;
  return (
    <span aria-hidden className={cx('relative block shrink-0', className)}>
      <ColorSwatch color="transparent" className="absolute inset-0" />
      <span
        style={{ ...paint(fill), ...(fill.kind === 'image' ? { opacity: fill.opacity } : {}) }}
        className="absolute inset-0 rounded-small border border-ui-line-strong"
      />
    </span>
  );
}
