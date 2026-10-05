import type {
  Command,
  Element,
  ElementPatch,
  Fill,
  ImageElement,
  LineElement,
  ShapeElement,
  Stroke,
} from '@slidr/model';
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
  PanelTop,
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
import { takesAccent } from './accent';
import { AccentEditor } from './AccentEditor';
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
import { FillSwatch, MixedBar, PopoverTool, ToolGroup, ToolRow } from './parts';
import { replaceImage } from './replace';
import { isMixed, sharedFields, sharedValue } from './several';
import { SvgColorsTool } from './svgTools';
import { areTargets, isTarget, useTarget, useTargets, type Target, type Targets } from './target';

/*
 * Row B for shapes, lines and images (SPEC 4.4), and the effects every element has. Each kind of
 * selection gets one registered tool that draws its groups itself: which buttons show depends on
 * the element (a line has no fill, an ellipse has no corners), and a group must never be empty.
 *
 * Fill, outline, shadow and opacity work on one element and on several selected together
 * (`Targets`): a row of several elements holds the ones that apply to every member, a value the
 * members do not share is shown as mixed, and a change is one undo step for all of them.
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

/** The same for one element or several: each element takes a patch of its own. */
function useLookUpdate<T extends Element>(targets: Targets<T>) {
  const { t } = useTranslation('objects');
  const tx = useGestureTx();
  const label = t('history.style');
  return {
    /** A step of a drag or of an edit; `end` closes the undo step. */
    change: (patchOf: (element: T) => ElementPatch | undefined, first?: readonly Command[]) =>
      targets.update(patchOf, { txId: tx.id(), label }, first),
    end: tx.end,
  };
}

/** The one element of a row for a single selection, for the tools that take one or several. */
function only<T extends Element>(target: Target<T>): Targets<T> {
  return {
    slideId: target.slideId,
    elements: [target.element],
    update: (patchOf, options, first) =>
      target.update(patchOf(target.element) ?? {}, options, first),
  };
}

/* ---------------------------------------------------------------- the tools */

const NO_FILL: Fill = { kind: 'none' };

function FillTool({ targets }: { targets: Targets<ShapeElement> }) {
  const { t } = useTranslation('objects');
  const { change, end } = useLookUpdate(targets);
  const fill = sharedValue(targets.elements.map((element) => element.fill));
  const mixed = isMixed(fill);
  return (
    <PopoverTool
      label={t('fill.title')}
      icon={PaintBucket}
      bar={mixed ? <MixedBar /> : <FillSwatch fill={fill} className="h-1.5 w-4" />}
      onClose={end}
    >
      <FillEditor
        value={mixed ? NO_FILL : fill}
        mixed={mixed}
        defaultColor={{ token: 'primary' }}
        onChange={(next, asset) =>
          change(() => ({ fill: next }), asset ? [{ type: 'asset.add', asset }] : undefined)
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

/** The elements that have an outline of some kind: a shape's, a line's stroke, an image's border. */
type Outlined = ShapeElement | LineElement | ImageElement;

const strokeOf = (element: Outlined) =>
  element.type === 'image' ? element.border : element.stroke;

function strokePatch(element: Outlined, next: Stroke | null): ElementPatch | undefined {
  if (element.type === 'image') return { border: next };
  // A line always has a stroke; the editor does not offer "none" for it.
  if (element.type === 'line') return next ? { stroke: next } : undefined;
  return { stroke: next };
}

function StrokeTool({
  targets,
  label,
  icon,
}: {
  targets: Targets<Outlined>;
  label: string;
  icon: LucideIcon;
}) {
  const { change, end } = useLookUpdate(targets);
  const { elements } = targets;
  const { value, mixed } = sharedFields(elements.map(strokeOf));
  const lines = elements.filter((element) => element.type === 'line').length;
  return (
    <PopoverTool
      label={label}
      icon={icon}
      bar={mixed.has('state') || mixed.has('color') ? <MixedBar /> : <StrokeBar stroke={value} />}
      onClose={end}
    >
      <StrokeEditor
        value={value}
        mixed={mixed}
        required={lines > 0}
        capAndJoin={elements.every(strokeHasCapAndJoin)}
        defaultJoin={lines === elements.length ? 'round' : 'miter'}
        defaultStroke={NEW_STROKE}
        onChange={(_, next) => change((element) => strokePatch(element, next(strokeOf(element))))}
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

function ShadowTool({ targets }: { targets: Targets }) {
  const { t } = useTranslation('objects');
  const { change, end } = useLookUpdate(targets);
  const themeShadow = useDeck((s) => s.deck.theme.shadow);
  const { elements } = targets;
  const { value, mixed } = sharedFields(elements.map((element) => element.effects?.shadow));
  return (
    <PopoverTool label={t('shadow.title')} icon={Layers2} onClose={end}>
      <ShadowEditor
        value={value}
        mixed={mixed}
        themeShadow={themeShadow}
        spread={elements.every(supportsSpread)}
        onChange={(_, next) =>
          change((element) => shadowPatch(element, next(element.effects?.shadow)))
        }
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

function OpacityTool({ targets }: { targets: Targets }) {
  const { t } = useTranslation('objects');
  const { change, end } = useLookUpdate(targets);
  const opacity = sharedValue(targets.elements.map((element) => element.opacity));
  return (
    <PopoverTool label={t('opacity.title')} icon={Droplet} onClose={end}>
      <OpacityEditor
        label={t('opacity.title')}
        value={isMixed(opacity) ? null : opacity}
        onChange={(next) => change(() => ({ opacity: next }))}
        onGestureEnd={end}
      />
    </PopoverTool>
  );
}

/** The coloured side of a box (ADR-073). The bar under the icon is its colour, or the "none" mark. */
function AccentTool({ target }: { target: Target<ShapeElement> }) {
  const { t } = useTranslation('objects');
  const { change, end } = useStyleUpdate(target);
  return (
    <PopoverTool
      label={t('accent.title')}
      icon={PanelTop}
      bar={<FillSwatch fill={target.element.accent?.fill ?? NO_FILL} className="h-1.5 w-4" />}
      onClose={end}
      startsWithIcons
    >
      <AccentEditor
        shape={target.element}
        onChange={(patch, asset) =>
          change(patch, asset ? [{ type: 'asset.add', asset }] : undefined)
        }
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
      <ShadowTool targets={only(target)} />
      <OpacityTool targets={only(target)} />
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
 * outline, accent, effects), a line (stroke, heads, curve, effects) and an SVG (its colours,
 * effects).
 */
export function ShapeRow() {
  const { t } = useTranslation('objects');
  const target = useTarget();
  if (isTarget(target, 'shape')) {
    return (
      <ToolRow>
        <ToolGroup label={t('groups.paint')}>
          {shapeHasFill(target.element) && <FillTool targets={only(target)} />}
          <StrokeTool targets={only(target)} label={t('stroke.outline')} icon={PenLine} />
          {takesAccent(target.element) && <AccentTool target={target} />}
        </ToolGroup>
        <EffectTools target={target} />
      </ToolRow>
    );
  }
  if (isTarget(target, 'line')) {
    return (
      <ToolRow>
        <ToolGroup label={t('groups.line')}>
          <StrokeTool targets={only(target)} label={t('stroke.line')} icon={PenLine} />
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
        <StrokeTool targets={only(target)} label={t('image.border')} icon={Square} />
        <RadiusTool target={target} />
        <ShadowTool targets={only(target)} />
        <OpacityTool targets={only(target)} />
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

/* ---------------------------------------------------------------- several elements */

/**
 * Row B for several selected elements, after the arrange tools the row already has (SPEC 4.4):
 * the look that applies to every member. Fill when all are shapes with an inside; the outline
 * when all are shapes, lines or images (for lines it is their stroke, for images their border);
 * shadow and opacity always, since every element has them.
 */
export function SeveralRow() {
  const { t } = useTranslation('objects');
  const targets = useTargets();
  if (!targets || targets.elements.length < 2) return null;
  const outlined = areTargets(targets, 'shape', 'line', 'image') ? targets : undefined;
  const filled =
    areTargets(targets, 'shape') && targets.elements.every(shapeHasFill) ? targets : undefined;
  const outline =
    outlined && areTargets(outlined, 'line')
      ? t('stroke.line')
      : outlined && areTargets(outlined, 'image')
        ? t('image.border')
        : t('stroke.outline');
  return (
    <ToolRow>
      {outlined && (
        <ToolGroup label={t('groups.paint')}>
          {filled && <FillTool targets={filled} />}
          <StrokeTool targets={outlined} label={outline} icon={PenLine} />
        </ToolGroup>
      )}
      <ToolGroup label={t('groups.effects')}>
        <ShadowTool targets={targets} />
        <OpacityTool targets={targets} />
      </ToolGroup>
    </ToolRow>
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
