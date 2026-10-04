import type { AssetMeta, Background, Command, Shadow } from '@slidr/model';
import {
  Button,
  ColorPicker,
  ColorSwatch,
  Field,
  IconButton,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type ColorPickerProps,
} from '@slidr/ui';
import { Plus, Trash2 } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../controls';
import { withAdjust, withFill } from '../objects/background';
import { FillEditor } from '../objects/FillEditor';
import { ColorRow, FillSwatch, SliderField } from '../objects/parts';
import { useDeck, useEditor } from '../shell';
import { MAX_CHART_COLORS, paletteCommands, variantCommands } from './themeLook';

/*
 * The theme's look beyond colours, fonts and sizes (ADR-040, "what the panel lacks"): the
 * corners and the shadow it gives, its background and the variants a slide can pick, and the
 * palette of its charts. Every edit is `theme.update` on the open deck, one undo step; a drag
 * in a picker or on a slider is one step too.
 */

/** The largest corner radius and shadow the fields offer, in slide pixels. */
const MAX_RADIUS = 64;
const MAX_OFFSET = 200;
const MAX_BLUR = 100;
const MAX_SPREAD = 60;
const MAX_BACKGROUND_BLUR = 80;

/** The strings of the free colour picker, from the colours of the panel. */
function usePickerLabels(): ColorPickerProps['labels'] {
  const { t } = useTranslation('templates');
  return {
    area: t('colors.area'),
    hue: t('colors.hue'),
    alpha: t('colors.alpha'),
    hex: t('colors.hex'),
    eyedropper: t('colors.eyedropper'),
    none: t('colors.none'),
    recent: t('colors.recent'),
  };
}

/** The corners and the shadow of the theme. */
export function ShapeFields() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const radius = useDeck((s) => s.deck.theme.radius);
  const shadow = useDeck((s) => s.deck.theme.shadow);
  const tx = useGestureTx();
  const label = t('undo.shape');
  const setRadius = (next: number) =>
    editor.bus.dispatch(
      { type: 'theme.update', patch: { radius: next } },
      { txId: tx.id(), label },
    );
  // From the deck as it is at the moment of the change: a drag sends many before a render.
  const setShadow = (patch: Partial<Shadow>) => {
    const next: Shadow = { ...editor.bus.deck.theme.shadow, ...patch };
    if (!next.spread) delete next.spread;
    editor.bus.dispatch(
      { type: 'theme.update', patch: { shadow: next } },
      { txId: tx.id(), label },
    );
  };
  /** A typed number: a whole step by itself. */
  const typed = (patch: Partial<Shadow>) => {
    setShadow(patch);
    tx.end();
  };
  return (
    <div className="flex flex-col gap-3" data-testid="theme-shape">
      <SliderField
        label={t('shape.radius')}
        value={radius}
        max={MAX_RADIUS}
        unit="px"
        onChange={setRadius}
        onCommit={tx.end}
      />
      <div className="flex gap-3">
        <Field label={t('shape.x')} className="flex-1">
          <NumberField
            aria-label={t('shape.x')}
            size="sm"
            unit="px"
            min={-MAX_OFFSET}
            max={MAX_OFFSET}
            value={shadow.x}
            onValueChange={(x) => typed({ x })}
          />
        </Field>
        <Field label={t('shape.y')} className="flex-1">
          <NumberField
            aria-label={t('shape.y')}
            size="sm"
            unit="px"
            min={-MAX_OFFSET}
            max={MAX_OFFSET}
            value={shadow.y}
            onValueChange={(y) => typed({ y })}
          />
        </Field>
      </div>
      <SliderField
        label={t('shape.blur')}
        value={shadow.blur}
        max={MAX_BLUR}
        unit="px"
        onChange={(blur) => setShadow({ blur })}
        onCommit={tx.end}
      />
      <SliderField
        label={t('shape.spread')}
        value={shadow.spread ?? 0}
        max={MAX_SPREAD}
        unit="px"
        onChange={(spread) => setShadow({ spread })}
        onCommit={tx.end}
      />
      <ColorRow
        label={t('shape.color')}
        value={shadow.color}
        onChange={(color) => setShadow({ color })}
        onGestureEnd={tx.end}
      />
    </div>
  );
}

/** A background as a small slide, which opens its editor. */
function BackgroundButton({
  background,
  label,
  onChange,
  onGestureEnd,
  onRemove,
  ...data
}: {
  background: Background;
  label: string;
  /** Every step of a drag, and a whole change; `asset` is a picture the change brings in. */
  onChange: (next: Background, asset?: AssetMeta) => void;
  onGestureEnd: () => void;
  /** Offers "remove": a variant can go, the theme's own background cannot. */
  onRemove?: () => void;
  'data-testid': string;
  'data-index'?: number;
}) {
  const { t } = useTranslation('templates');
  return (
    <Popover onOpenChange={(open) => !open && onGestureEnd()}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            {...data}
            className="h-9 w-16 shrink-0 cursor-default rounded-small transition-colors data-[state=open]:outline-2 data-[state=open]:outline-offset-2 data-[state=open]:outline-ui-accent"
          >
            <FillSwatch fill={background.fill} className="size-full" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent>
        <div className="flex flex-col gap-3" data-testid="theme-background-editor">
          <FillEditor
            value={background.fill}
            allowNone={false}
            defaultColor={{ token: 'bg' }}
            onChange={(fill, asset) => onChange(withFill(background, fill), asset)}
            onGestureEnd={onGestureEnd}
          />
          {background.fill.kind === 'image' && (
            <>
              <SliderField
                label={t('backgrounds.blur')}
                value={background.blur ?? 0}
                max={MAX_BACKGROUND_BLUR}
                unit="px"
                onChange={(blur) => onChange(withAdjust(background, { blur }))}
                onCommit={onGestureEnd}
              />
              <SliderField
                label={t('backgrounds.dim')}
                value={Math.round((background.dim ?? 0) * 100)}
                unit="%"
                onChange={(percent) => onChange(withAdjust(background, { dim: percent / 100 }))}
                onCommit={onGestureEnd}
              />
            </>
          )}
          {onRemove && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                data-testid="variant-remove"
                onClick={onRemove}
              >
                {t('backgrounds.remove')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The theme's background, which every slide without one of its own shows, and the variants a
 * slide can pick in its background tool (SLD-03). A slide that picked a variant changes with it.
 */
export function BackgroundFields() {
  const { t } = useTranslation('templates');
  const { bus } = useEditor();
  const background = useDeck((s) => s.deck.theme.background);
  const variants = useDeck((s) => s.deck.theme.backgroundVariants);
  const tx = useGestureTx();
  const label = t('undo.background');
  /** The picture a change brings in goes into the deck in the same step, once. */
  const withAsset = (asset: AssetMeta | undefined, commands: Command[]): Command[] =>
    asset && !bus.deck.assets[asset.id] ? [{ type: 'asset.add', asset }, ...commands] : commands;
  const setTheme = (next: Background, asset?: AssetMeta) =>
    bus.batch(withAsset(asset, [{ type: 'theme.update', patch: { background: next } }]), {
      txId: tx.id(),
      label,
    });
  const setVariant = (index: number, next: Background | null, asset?: AssetMeta) => {
    const commands = variantCommands(bus.deck, index, next);
    if (commands.length > 0) bus.batch(withAsset(asset, commands), { txId: tx.id(), label });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ui-fg">{t('backgrounds.theme')}</span>
        <BackgroundButton
          background={background}
          label={t('backgrounds.theme')}
          data-testid="theme-background"
          onChange={setTheme}
          onGestureEnd={tx.end}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-ui-fg">{t('backgrounds.variants')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {variants.map((variant, index) => (
            <BackgroundButton
              key={index}
              background={variant}
              label={t('backgrounds.variant', { n: index + 1 })}
              data-testid="theme-variant"
              data-index={index}
              onChange={(next, asset) => setVariant(index, next, asset)}
              onGestureEnd={tx.end}
              onRemove={() => {
                tx.end();
                setVariant(index, null);
                tx.end();
              }}
            />
          ))}
          <IconButton
            icon={Plus}
            size="sm"
            label={t('backgrounds.add')}
            data-testid="variant-add"
            onClick={() => {
              tx.end();
              setVariant(variants.length, background);
              tx.end();
            }}
          />
        </div>
        <p className="text-xs text-ui-fg-muted">{t('backgrounds.hint')}</p>
      </div>
    </div>
  );
}

/** One colour of the chart palette: a swatch that opens the picker, and a way to remove it. */
function ChartColor({ index, value, last }: { index: number; value: string; last: boolean }) {
  const { t } = useTranslation('templates');
  const { bus } = useEditor();
  const labels = usePickerLabels();
  const tx = useGestureTx();
  const label = t('colors.chartColor', { n: index + 1 });
  const set = (color: string | null) => {
    const commands = paletteCommands(bus.deck, index, color);
    if (commands.length > 0) bus.batch(commands, { txId: tx.id(), label: t('undo.palette') });
  };
  return (
    <Popover onOpenChange={(open) => !open && tx.end()}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-testid="chart-color"
            data-index={index}
            className="flex cursor-default rounded-small p-0.5 transition-colors hover:bg-ui-hover data-[state=open]:bg-ui-hover"
          >
            <ColorSwatch color={value} className="size-6" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <div className="flex flex-col gap-3">
          <ColorPicker value={value} labels={labels} onChange={set} onGestureEnd={tx.end} />
          {!last && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                data-testid="chart-remove"
                onClick={() => {
                  tx.end();
                  set(null);
                  tx.end();
                }}
              >
                {t('colors.chartRemove')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The colours a chart gives its series, in order (CHR-04): the theme's `colors.chart`. */
export function ChartPalette() {
  const { t } = useTranslation('templates');
  const { bus } = useEditor();
  const palette = useDeck((s) => s.deck.theme.colors.chart);
  return (
    <div className="flex flex-col gap-1.5" data-testid="chart-palette">
      <span className="text-sm text-ui-fg">{t('colors.chart')}</span>
      <div className="flex flex-wrap items-center gap-1">
        {palette.map((color, index) => (
          <ChartColor key={index} index={index} value={color} last={palette.length === 1} />
        ))}
        {palette.length < MAX_CHART_COLORS && (
          <IconButton
            icon={Plus}
            size="sm"
            label={t('colors.chartAdd')}
            data-testid="chart-add"
            onClick={() => {
              // A new colour starts as the last one, to be changed from there.
              const commands = paletteCommands(
                bus.deck,
                palette.length,
                palette.at(-1) ?? bus.deck.theme.colors.accent,
              );
              bus.batch(commands, { label: t('undo.palette') });
            }}
          />
        )}
      </div>
    </div>
  );
}
