import type { ElementPatch, ImageElement } from '@slidr/model';
import { duotoneTokens, imageFilterNames, imageLook } from '@slidr/renderer';
import type { ImageOperation } from '@slidr/agent-tools';
import {
  Button,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  IconButton,
} from '@slidr/ui';
import {
  Aperture,
  CircleDashed,
  ImageMinus,
  RotateCcw,
  SunMedium,
  Wallpaper,
} from '@slidr/ui/icons';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../controls';
import { removeBackground, useCutoutStatus, useCutoutWorking } from '../images/cutout';
import { focusStage, tell, useAssetResolver, useDeck, useEditor } from '../shell';
import {
  ADJUSTMENTS,
  adjustPatch,
  adjustValue,
  asBackgroundCommands,
  duotoneNames,
  filterPatch,
  isAdjusted,
  maskChoice,
  maskPatch,
  maskShapes,
  maxMaskRadius,
  type MaskChoice,
} from './imageLook';
import { ShapeGlyph } from './library';
import { Hint, PopoverTool, SliderField } from './parts';
import type { Target } from './target';

/*
 * The look of a picture in row B (SPEC 4.4): its mask, its adjustments, a ready-made filter, and
 * making it the slide's background (IMG-05, IMG-06, IMG-07, IMG-10). The AI tool of the object
 * shows the same controls (AIO-05), so each is a component of its own.
 */

type ImageTarget = Target<ImageElement>;

/** One undo step per gesture, under the name the history shows for it. */
function useLookUpdate(target: ImageTarget, label: string) {
  const tx = useGestureTx();
  return {
    /** A step of a drag; `end` closes the undo step. */
    change: (patch: ElementPatch) => target.update(patch, { txId: tx.id(), label }),
    /** A whole step by itself: a choice. */
    set: (patch: ElementPatch) => {
      tx.end();
      target.update(patch, { label });
    },
    end: tx.end,
  };
}

const choice = cx(
  'inline-flex size-control cursor-default items-center justify-center rounded-control text-ui-fg-muted transition-colors',
  'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed',
  'aria-pressed:bg-ui-accent-soft aria-pressed:text-ui-accent-fg',
);

/* ---------------------------------------------------------------- mask */

function MaskChoiceButton({
  value,
  selected,
  label,
  onPick,
  children,
}: {
  value: MaskChoice;
  selected: boolean;
  label: string;
  onPick: (value: MaskChoice) => void;
  children: ReactNode;
}) {
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        data-mask={value}
        className={choice}
        onClick={() => onPick(value)}
      >
        {children}
      </button>
    </Hint>
  );
}

/** The mask of a picture (IMG-05): none, rounded corners, a circle, or a shape of the library. */
export function MaskEditor({ target }: { target: ImageTarget }) {
  const { t, i18n } = useTranslation('objects');
  const { change, set, end } = useLookUpdate(target, t('history.mask'));
  const { element } = target;
  const current = maskChoice(element);
  const pick = (value: MaskChoice) => set(maskPatch(element, value));
  const nameOf = (preset: string) =>
    i18n.exists(`objects:shape.${preset}`) ? t(`shape.${preset}`) : preset;
  return (
    <div data-testid="mask-editor" className="flex flex-col gap-3">
      <div className="flex gap-1">
        <MaskChoiceButton
          value="none"
          selected={current === 'none'}
          label={t('image.maskNone')}
          onPick={pick}
        >
          <ShapeGlyph preset="rect" />
        </MaskChoiceButton>
        <MaskChoiceButton
          value="rounded"
          selected={current === 'rounded'}
          label={t('image.maskRounded')}
          onPick={pick}
        >
          <ShapeGlyph preset="roundRect" />
        </MaskChoiceButton>
        <MaskChoiceButton
          value="ellipse"
          selected={current === 'ellipse'}
          label={t('image.maskEllipse')}
          onPick={pick}
        >
          <ShapeGlyph preset="ellipse" />
        </MaskChoiceButton>
      </div>
      {element.mask?.kind === 'rounded' && (
        <SliderField
          label={t('image.maskRadius')}
          value={Math.round(element.mask.radius)}
          max={maxMaskRadius(element)}
          unit="px"
          onChange={(radius) => change({ mask: { kind: 'rounded', radius } })}
          onCommit={end}
        />
      )}
      <Field label={t('image.maskShapes')}>
        <div className="grid grid-cols-8">
          {maskShapes().map((preset) => (
            <MaskChoiceButton
              key={preset}
              value={`shape:${preset}`}
              selected={current === `shape:${preset}`}
              label={nameOf(preset)}
              onPick={pick}
            >
              <ShapeGlyph preset={preset} />
            </MaskChoiceButton>
          ))}
        </div>
      </Field>
    </div>
  );
}

export function MaskTool({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  return (
    <PopoverTool label={t('image.mask')} icon={CircleDashed}>
      <MaskEditor target={target} />
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- adjustments */

/** The adjustments of a picture (IMG-06): seven sliders, and back to the picture as it is. */
export function AdjustEditor({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  const { change, set, end } = useLookUpdate(target, t('history.adjust'));
  const { element } = target;
  return (
    <div data-testid="adjust-editor" className="flex flex-col gap-3">
      {ADJUSTMENTS.map((control) => (
        <SliderField
          key={control.key}
          label={t(`image.adjustments.${control.key}`)}
          value={adjustValue(element, control)}
          min={control.min}
          max={control.max}
          unit={control.unit || undefined}
          onChange={(value) => change(adjustPatch(element, control, value))}
          onCommit={end}
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        icon={RotateCcw}
        className="self-start"
        disabled={!isAdjusted(element)}
        onClick={() => set({ adjust: null })}
      >
        {t('image.adjustReset')}
      </Button>
    </div>
  );
}

export function AdjustTool({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  return (
    <PopoverTool label={t('image.adjust')} icon={SunMedium}>
      <AdjustEditor target={target} />
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- filters */

/** The picture with one look on it, small: what a filter choice shows. */
function LookSwatch({
  preset,
  url,
  label,
  selected,
  onPick,
}: {
  preset: string | undefined;
  url: string | undefined;
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  const theme = useDeck((s) => s.deck.theme);
  const reactId = useId();
  // The renderer's own filter, so the swatch is the look the slide will show.
  const { filter, defs } = imageLook(
    preset ? { filterPreset: preset } : {},
    theme,
    (suffix) => `look${reactId.replace(/[^\w-]/g, '')}-${suffix}`,
  );
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        data-filter={preset ?? 'none'}
        onClick={onPick}
        className={cx(
          'relative aspect-square w-full cursor-default overflow-hidden rounded-small bg-ui-field transition-colors',
          selected && 'outline-2 outline-offset-2 outline-ui-accent',
        )}
      >
        {defs}
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="size-full object-cover"
            style={{ filter }}
          />
        )}
      </button>
    </Hint>
  );
}

/** A ready-made look for a picture, or a duotone in two of the theme's colours (IMG-07). */
export function FilterEditor({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  const { t: tc } = useTranslation('controls');
  const { set } = useLookUpdate(target, t('history.filter'));
  const resolve = useAssetResolver();
  const asset = useDeck((s) =>
    target.element.assetId ? s.deck.assets[target.element.assetId] : undefined,
  );
  const url = asset ? resolve(asset) : undefined;
  const current = target.element.filterPreset;
  const pick = (preset: string | null) => set(filterPatch(preset));
  const duotoneLabel = (preset: string) => {
    const [a, b] = duotoneTokens(preset) ?? [];
    return a && b ? t('image.duotoneOf', { a: tc(`token.${a}`), b: tc(`token.${b}`) }) : preset;
  };
  return (
    <div data-testid="filter-editor" className="flex flex-col gap-3">
      <Field label={t('image.filterReady')}>
        <div className="grid grid-cols-5 gap-2">
          <LookSwatch
            preset={undefined}
            url={url}
            label={t('image.filterNone')}
            selected={!current}
            onPick={() => pick(null)}
          />
          {imageFilterNames.map((name) => (
            <LookSwatch
              key={name}
              preset={name}
              url={url}
              label={t(`image.filters.${name}`)}
              selected={current === name}
              onPick={() => pick(name)}
            />
          ))}
        </div>
      </Field>
      <Field label={t('image.duotone')}>
        <div className="grid grid-cols-5 gap-2">
          {duotoneNames.map((name) => (
            <LookSwatch
              key={name}
              preset={name}
              url={url}
              label={duotoneLabel(name)}
              selected={current === name}
              onPick={() => pick(name)}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

export function FilterTool({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  return (
    <PopoverTool label={t('image.filter')} icon={Aperture}>
      <FilterEditor target={target} />
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- as the slide background */

/** Makes the picture the background of its slide (IMG-10): one undo step brings it back. */
export function useAsBackground(target: ImageTarget): (() => void) | undefined {
  const { t } = useTranslation('objects');
  const { bus } = useEditor();
  const commands = asBackgroundCommands(target.slideId, target.element);
  if (commands.length === 0) return undefined;
  return () => {
    bus.batch(commands, { label: t('history.asBackground') });
    focusStage();
  };
}

export function AsBackgroundTool({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  const run = useAsBackground(target);
  return (
    <IconButton
      icon={Wallpaper}
      size="sm"
      label={t('image.asBackground')}
      disabled={!run}
      data-testid="image-as-background"
      onClick={run}
    />
  );
}

/* ---------------------------------------------------------------- background removal */

/**
 * Removes the background of the picture, on this machine (GEN-06, GEN-07): by its subject, with
 * the local model, or a flat colour read off its border. The cut-out takes the picture's place
 * as one undo step. Without the model the first way is shown, disabled, with the reason.
 */
export function useCutout(target: ImageTarget) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const status = useCutoutStatus(editor);
  const working = useCutoutWorking(target.element.id);
  const run = (operation: ImageOperation) => {
    removeBackground(editor, target.element.id, operation, t('history.cutout')).catch(
      (error: unknown) =>
        void tell(t('image.cutoutFailed'), error instanceof Error ? error.message : undefined),
    );
  };
  return { working, run, ready: status?.state === 'ready', known: status !== undefined };
}

export function CutoutTool({ target }: { target: ImageTarget }) {
  const { t } = useTranslation('objects');
  const { working, run, ready, known } = useCutout(target);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={ImageMinus}
          size="sm"
          label={t('image.cutout')}
          loading={working}
          disabled={working || !target.element.assetId}
          data-testid="image-cutout"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          disabled={!ready}
          hint={known && !ready ? t('image.cutoutMissing') : undefined}
          data-cutout="removeBackground"
          onSelect={() => run('removeBackground')}
        >
          {t('image.cutoutSubject')}
        </DropdownMenuItem>
        <DropdownMenuItem data-cutout="keyOutBackground" onSelect={() => run('keyOutBackground')}>
          {t('image.cutoutFlat')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
