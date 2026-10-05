import type { ElementPatch, ImageElement, LineElement, ShapeElement, Stroke } from '@slidr/model';
import {
  ColorSwatch,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Field,
  IconButton,
  type LucideIcon,
  Toggle,
  SegmentedControl,
  Select,
} from '@slidr/ui';
import {
  Droplet,
  ImageUp,
  Layers2,
  MoveRight,
  PaintBucket,
  PenLine,
  Scaling,
  SlidersHorizontal,
  Spline,
  Square,
  SquareRoundCorner,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
} from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { colorToHex, useGestureTx } from '../controls';
import { UpscaleTool } from '../images/UpscaleTool';
import { useDeck, useEditor, useSelection } from '../shell';
import { OpacityEditor, RadiusEditor, ShadowEditor, StrokeEditor } from './editors';
import {
  radiusControl,
  shadowPatch,
  shapeHasFill,
  strokeHasCapAndJoin,
  supportsSpread,
} from './effects';
import { FillEditor } from './FillEditor';
import { AdjustTool, AsBackgroundTool, CutoutTool, FilterTool, MaskTool } from './imageTools';
import { FillSwatch, PopoverTool, ToolGroup, ToolRow } from './parts';
import { replaceImage } from './replace';
import { SvgColorsTool } from './svgTools';
import { isTarget, useTarget, type Target } from './target';

/*
 * Row B for shapes, lines and images (SPEC 4.4), and the effects every element has. Each kind of
 * selection gets one registered tool that draws its groups itself: which buttons show depends on
 * the element (a line has no fill, an ellipse has no corners), and a group must never be empty.
 */

/** One undo step per gesture, and the label the history shows. */
function useStyleUpdate(target: Target) {
  const { t } = useTranslation('objects');
  const tx = useGestureTx();
  const label = t('history.style');
  return {
    /** A step of a drag or of an edit; `end` closes the undo step. */
    change: (patch: ElementPatch, first?: Parameters<Target['update']>[2]) =>
      target.update(patch, { txId: tx.id(), label }, first),
    end: tx.end,
  };
}

/* ---------------------------------------------------------------- the tools */

function FillTool({ target }: { target: Target<ShapeElement> }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  const { fill } = target.element;
  return (
    <PopoverTool
      label={t('fill.title')}
      icon={PaintBucket}
      bar={<FillSwatch fill={fill} className="h-1.5 w-4" />}
      onClose={end}
    >
      <FillEditor
        value={fill}
        defaultColor={{ token: 'primary' }}
        onChange={(next, asset) =>
          change({ fill: next }, asset ? [{ type: 'asset.add', asset }] : undefined)
        }
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

/** The colour bar under a stroke button: the stroke's colour, or the "none" mark. */
function StrokeBar({ stroke }: { stroke: Stroke | undefined }) {
  const theme = useDeck((s) => s.deck.theme);
  return (
    <ColorSwatch color={stroke ? colorToHex(stroke.color, theme) : null} className="h-1.5 w-4" />
  );
}

const NEW_STROKE: Stroke = { color: { token: 'text' }, width: 4 };

function StrokeTool({
  target,
  label,
  icon,
}: {
  target: Target<ShapeElement | LineElement | ImageElement>;
  label: string;
  icon: LucideIcon;
}) {
  const { change, end } = useStyleUpdate(target);
  const { element } = target;
  const stroke = element.type === 'image' ? element.border : element.stroke;
  const write = (next: Stroke | null): ElementPatch => {
    if (element.type === 'image') return { border: next };
    // A line always has a stroke; the editor does not offer "none" for it.
    if (element.type === 'line') return next ? { stroke: next } : {};
    return { stroke: next };
  };
  return (
    <PopoverTool label={label} icon={icon} bar={<StrokeBar stroke={stroke} />} onClose={end}>
      <StrokeEditor
        value={stroke}
        required={element.type === 'line'}
        capAndJoin={strokeHasCapAndJoin(element)}
        defaultJoin={element.type === 'line' ? 'round' : 'miter'}
        defaultStroke={NEW_STROKE}
        onChange={(next) => change(write(next))}
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

function RadiusTool({ target }: { target: Target }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  const control = radiusControl(target.element);
  if (!control) return null;
  return (
    <PopoverTool label={t('radius.title')} icon={SquareRoundCorner} onClose={end}>
      <RadiusEditor
        control={control}
        onChange={(value) => change(control.patch(value))}
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

function ShadowTool({ target }: { target: Target }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  const themeShadow = useDeck((s) => s.deck.theme.shadow);
  const { element } = target;
  return (
    <PopoverTool label={t('shadow.title')} icon={Layers2} onClose={end}>
      <ShadowEditor
        value={element.effects?.shadow}
        themeShadow={themeShadow}
        spread={supportsSpread(element)}
        onChange={(shadow) => change(shadowPatch(element, shadow))}
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

function OpacityTool({ target }: { target: Target }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  return (
    <PopoverTool label={t('opacity.title')} icon={Droplet} onClose={end}>
      <OpacityEditor
        label={t('opacity.title')}
        value={target.element.opacity}
        onChange={(opacity) => change({ opacity })}
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

/** Corners (where they can be rounded), shadow and opacity, as three buttons. */
function EffectTools({ target }: { target: Target }) {
  const { t } = useTranslation('objects');
  return (
    <ToolGroup label={t('groups.effects')}>
      <RadiusTool target={target} />
      <ShadowTool target={target} />
      <OpacityTool target={target} />
    </ToolGroup>
  );
}

/* ---------------------------------------------------------------- lines */

type Head = LineElement['startHead'];
const heads: readonly Head[] = ['none', 'arrow', 'triangle', 'circle', 'diamond', 'bar'];

function HeadsTool({ target }: { target: Target<LineElement> }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  const options = heads.map((head) => ({ value: head, label: t(`heads.${head}`) }));
  const set = (patch: ElementPatch) => {
    change(patch);
    end();
  };
  return (
    <PopoverTool label={t('heads.title')} icon={MoveRight} onClose={end}>
      <div className="flex gap-3">
        <Field label={t('heads.start')} className="flex-1">
          <Select
            aria-label={t('heads.start')}
            size="sm"
            options={options}
            value={target.element.startHead}
            onValueChange={(startHead) => set({ startHead })}
          />
        </Field>
        <Field label={t('heads.end')} className="flex-1">
          <Select
            aria-label={t('heads.end')}
            size="sm"
            options={options}
            value={target.element.endHead}
            onValueChange={(endHead) => set({ endHead })}
          />
        </Field>
      </div>
    </PopoverTool>
  );
}

type Curve = LineElement['curve'];
const curves: readonly Curve[] = ['straight', 'elbow', 'curved'];

function CurveTool({ target }: { target: Target<LineElement> }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  return (
    <PopoverTool label={t('curve.title')} icon={Spline} onClose={end}>
      <SegmentedControl
        aria-label={t('curve.title')}
        fill
        options={curves.map((curve) => ({ value: curve, label: t(`curve.${curve}`) }))}
        value={target.element.curve}
        onValueChange={(curve) => {
          change({ curve });
          end();
        }}
      />
    </PopoverTool>
  );
}

/**
 * Row B for the `shape` kind of selection, which covers three element types: a shape (fill,
 * outline, effects), a line (stroke, heads, curve, effects) and an SVG (its colours, effects).
 */
export function ShapeRow() {
  const { t } = useTranslation('objects');
  const target = useTarget();
  if (isTarget(target, 'shape')) {
    return (
      <ToolRow>
        <ToolGroup label={t('groups.paint')}>
          {shapeHasFill(target.element) && <FillTool target={target} />}
          <StrokeTool target={target} label={t('stroke.outline')} icon={PenLine} />
        </ToolGroup>
        <EffectTools target={target} />
      </ToolRow>
    );
  }
  if (isTarget(target, 'line')) {
    return (
      <ToolRow>
        <ToolGroup label={t('groups.line')}>
          <StrokeTool target={target} label={t('stroke.line')} icon={PenLine} />
          <HeadsTool target={target} />
          <CurveTool target={target} />
        </ToolGroup>
        <EffectTools target={target} />
      </ToolRow>
    );
  }
  if (isTarget(target, 'svg')) {
    return (
      <ToolRow>
        <SvgColorsTool target={target} />
        <EffectTools target={target} />
      </ToolRow>
    );
  }
  return null;
}

/* ---------------------------------------------------------------- images */

type ImageFit = ImageElement['fit'];
const imageFits: readonly ImageFit[] = ['cover', 'contain', 'fill'];

function FitTool({ target }: { target: Target<ImageElement> }) {
  const { t } = useTranslation('objects');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Scaling} size="sm" label={t('image.fit')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={target.element.fit}
          onValueChange={(fit) =>
            target.update({ fit: fit as ImageFit }, { label: t('history.style') })
          }
        >
          {imageFits.map((fit) => (
            <DropdownMenuRadioItem key={fit} value={fit}>
              {t(`image.${fit}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReplaceTool({ target }: { target: Target<ImageElement> }) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const replace = () =>
    replaceImage(editor, target, { history: t('history.replace'), failed: t('insert.failed') });

  return (
    <IconButton
      icon={ImageUp}
      size="sm"
      label={t('image.replace')}
      onClick={() => void replace()}
    />
  );
}

function FlipTools({ target }: { target: Target<ImageElement> }) {
  const { t } = useTranslation('objects');
  const { element } = target;
  const label = t('history.style');
  // The icons are named after their dashed axis: mirroring left to right is across a vertical one.
  return (
    <>
      <Toggle
        icon={TrianglesCenterlineDashedVertical}
        size="sm"
        label={t('image.flipH')}
        pressed={Boolean(element.flipH)}
        onPressedChange={(on) => target.update({ flipH: on ? true : null }, { label })}
      />
      <Toggle
        icon={TrianglesCenterlineDashedHorizontal}
        size="sm"
        label={t('image.flipV')}
        pressed={Boolean(element.flipV)}
        onPressedChange={(on) => target.update({ flipV: on ? true : null }, { label })}
      />
    </>
  );
}

/**
 * Row B for an image (IMG-02, 04 to 10). Nothing here touches the asset: every control writes a
 * field of the element, so the original is always there to go back to (IMG-12). While the image
 * is being cropped the row belongs to the crop tools, and this draws nothing.
 */
export function ImageRow() {
  const { t } = useTranslation('objects');
  const target = useTarget();
  const editingId = useSelection((s) => s.editingElementId);
  if (!isTarget(target, 'image') || editingId === target.element.id) return null;
  return (
    <ToolRow>
      <ToolGroup label={t('groups.image')}>
        <FitTool target={target} />
        <FlipTools target={target} />
        <ReplaceTool target={target} />
      </ToolGroup>
      <ToolGroup label={t('groups.look')}>
        <MaskTool target={target} />
        <AdjustTool target={target} />
        <FilterTool target={target} />
        <CutoutTool target={target} />
        <UpscaleTool elementId={target.element.id} assetId={target.element.assetId} />
        <AsBackgroundTool target={target} />
      </ToolGroup>
      <ToolGroup label={t('groups.effects')}>
        <StrokeTool target={target} label={t('image.border')} icon={Square} />
        <RadiusTool target={target} />
        <ShadowTool target={target} />
        <OpacityTool target={target} />
      </ToolGroup>
    </ToolRow>
  );
}

/* ---------------------------------------------------------------- every other kind */

/** The effects of an element as one button: for the rows that belong to other areas. */
function CompactEffects({ target }: { target: Target }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  const themeShadow = useDeck((s) => s.deck.theme.shadow);
  const { element } = target;
  const control = radiusControl(element);
  return (
    <PopoverTool label={t('effects.title')} icon={SlidersHorizontal} onClose={end}>
      <OpacityEditor
        label={t('effects.opacity')}
        value={element.opacity}
        onChange={(opacity) => change({ opacity })}
        onGestureEnd={end}
      />
      {control && (
        <RadiusEditor
          control={control}
          onChange={(value) => change(control.patch(value))}
          onGestureEnd={end}
        />
      )}
      <Field label={t('effects.shadow')}>
        <div className="flex flex-col gap-3">
          <ShadowEditor
            value={element.effects?.shadow}
            themeShadow={themeShadow}
            spread={supportsSpread(element)}
            onChange={(shadow) => change(shadowPatch(element, shadow))}
            onGestureEnd={end}
          />
        </div>
      </Field>
    </PopoverTool>
  );
}

/**
 * Opacity and shadow, and corners where the renderer rounds them, for text, HTML, tables, charts,
 * media and groups. Shapes and images have these as buttons of their own rows.
 */
export function EffectsRow() {
  const target = useTarget();
  return target ? <CompactEffects target={target} /> : null;
}
