import { findSlide, type ImageElement } from '@slidr/model';
import { Button, Icon, IconButton, Select, Slider, Toggle } from '@slidr/ui';
import { Check, Crop, RotateCcw, ZoomIn } from '@slidr/ui/icons';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useGestureTx } from '../controls';
import { registerMessages } from '../i18n';
import {
  registerContextTool,
  registerShortcut,
  registerStageMenu,
  useDeck,
  useEditor,
  useSelection,
  type ContextToolProps,
  type Editor,
  type SelectionKind,
} from '../shell';
import {
  cropPatch,
  cropToRatio,
  cropView,
  cropZoom,
  cropZoomLevel,
  MAX_CROP_ZOOM,
  pictureRatio,
  resetPatch,
  type CropView,
} from './crop';
import { cropSession, heldRatio, type CropPreset } from './cropSession';
import { refitPatches, type Patch } from './groups';
import { AiItems, ClipboardItems, EditItems, GroupItems, OrderItems, StateItems } from './menu';
import { en, he } from './messages';
import { indexElements, type Located } from './space';

/*
 * The Stage's part of Top Tools row B (SPEC 4.4): crop mode of an image (WG5-T02, IMG-03). The
 * Crop button is there for every image; the rest shows while cropping, when the other image
 * tools step aside. Crop mode itself is `selection.editingElementId` on the image, and the
 * Stage draws it (ADR-016). And the Stage's right-click menu (STG-06), at the end of the file.
 */

registerMessages('stage', { he, en });

interface CropTarget {
  slideId: string;
  located: Located;
  image: ImageElement;
  /** Undefined when the image has no picture of a known size: there is nothing to crop. */
  view: CropView | undefined;
  /** Crop mode is on for this image. */
  cropping: boolean;
}

/** The one selected image, and where it stands with cropping. */
function useCropTarget(): CropTarget | undefined {
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const id = ids.length === 1 ? ids[0] : undefined;
  if (!slide || !id) return undefined;
  const located = indexElements(slide.elements).get(id);
  const image = located?.element;
  if (!located || image?.type !== 'image') return undefined;
  const asset = image.assetId ? deck.assets[image.assetId] : undefined;
  const view =
    asset?.width && asset.height && !located.locked
      ? cropView(image, { w: asset.width, h: asset.height })
      : undefined;
  return { slideId: slide.id, located, image, view, cropping: Boolean(view) && editingId === id };
}

/** Writes a crop to the image, and keeps the groups around it fitted to the new frame. */
function applyCrop(editor: Editor, target: CropTarget, patch: Patch, txId?: string): void {
  const patches = refitPatches(target.located.path, new Map([[target.image.id, patch]]));
  editor.bus.batch(
    [...patches].map(([elementId, p]) => ({
      type: 'element.update' as const,
      slideId: target.slideId,
      elementId,
      patch: p,
    })),
    { txId, label: 'Crop' },
  );
}

function CropToggle() {
  const { t } = useTranslation('stage');
  const { selection } = useEditor();
  const target = useCropTarget();
  if (!target) return null;
  return (
    <Toggle
      icon={Crop}
      label={t('crop.toggle')}
      size="sm"
      pressed={target.cropping}
      disabled={!target.view}
      onPressedChange={(on) => {
        if (on) selection.getState().startEditing(target.image.id);
        else selection.getState().stopEditing();
      }}
    />
  );
}

const RATIOS: Partial<Record<CropPreset, number>> = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };

function CropAspect() {
  const { t } = useTranslation('stage');
  const editor = useEditor();
  const target = useCropTarget();
  const session = useStore(cropSession);
  const view = target?.view;
  if (!target?.cropping || !view) return null;
  // An undo can take the frame out of the proportions a preset gave it: they no longer hold then.
  const preset = heldRatio(session.ratio, view.frame) === null ? 'free' : session.preset;
  const options: { value: CropPreset; label: string }[] = [
    { value: 'free', label: t('crop.free') },
    { value: 'original', label: t('crop.original') },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '16:9', label: '16:9' },
  ];
  return (
    <Select
      aria-label={t('crop.aspect')}
      variant="ghost"
      size="sm"
      className="ms-2 w-24"
      options={options}
      value={preset}
      onValueChange={(next) => {
        const ratio =
          next === 'free'
            ? null
            : next === 'original'
              ? pictureRatio(view)
              : (RATIOS[next] ?? null);
        cropSession.setState({ ratio, preset: next });
        if (ratio) applyCrop(editor, target, cropPatch(cropToRatio(view, ratio)));
      }}
    />
  );
}

function CropZoom() {
  const { t } = useTranslation('stage');
  const editor = useEditor();
  const target = useCropTarget();
  const tx = useGestureTx();
  const view = target?.view;
  if (!target?.cropping || !view) return null;
  const { fit } = target.image;
  return (
    <div className="ms-2 flex items-center gap-2">
      <Icon icon={ZoomIn} className="text-ui-fg-muted" />
      {/* The slider fills what it is in, so the width is the wrapper's. */}
      <div className="w-28">
        <Slider
          aria-label={t('crop.zoom')}
          min={1}
          max={MAX_CROP_ZOOM}
          step={0.01}
          value={Math.min(MAX_CROP_ZOOM, Math.max(1, cropZoomLevel(view, fit)))}
          onValueChange={(level) =>
            applyCrop(editor, target, cropPatch(cropZoom(view, fit, level)), tx.id())
          }
          onValueCommit={() => tx.end()}
        />
      </div>
    </div>
  );
}

function CropReset() {
  const { t } = useTranslation('stage');
  const editor = useEditor();
  const target = useCropTarget();
  const view = target?.view;
  if (!target?.cropping || !view) return null;
  // Nothing to reset while the frame shows exactly the whole picture.
  const whole = cropPatch(view).crop === null;
  return (
    <IconButton
      icon={RotateCcw}
      size="sm"
      className="ms-2"
      label={t('crop.reset')}
      disabled={whole}
      onClick={() => {
        cropSession.setState({ ratio: null, preset: 'free' });
        applyCrop(editor, target, resetPatch(view));
      }}
    />
  );
}

function CropDone() {
  const { t } = useTranslation('stage');
  const { selection } = useEditor();
  const target = useCropTarget();
  if (!target?.cropping) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={Check}
      className="ms-1"
      onClick={() => selection.getState().stopEditing()}
    >
      {t('crop.done')}
    </Button>
  );
}

// One group, so the tools sit together; the fractions keep them next to the button.
const tools = [
  { id: 'image.crop', order: 10, render: CropToggle },
  { id: 'image.crop.aspect', order: 10.1, render: CropAspect },
  { id: 'image.crop.zoom', order: 10.2, render: CropZoom },
  { id: 'image.crop.reset', order: 10.3, render: CropReset },
  { id: 'image.crop.done', order: 10.4, render: CropDone },
];
for (const tool of tools) registerContextTool({ ...tool, kinds: ['image'], group: 'crop' });

/** Esc leaves crop mode also when the focus is on one of the crop tools and not on the Stage. */
registerShortcut({
  id: 'stage.crop.leave',
  keys: 'Escape',
  run: (editor) => {
    const { editingElementId, currentSlideId, stopEditing } = editor.selection.getState();
    const slide = currentSlideId
      ? findSlide(editor.deck.getState().deck, currentSlideId)
      : undefined;
    const editing =
      editingElementId && slide ? indexElements(slide.elements).get(editingElementId) : undefined;
    if (editing?.element.type !== 'image') return false;
    stopEditing();
    return true;
  },
});

/* ---------------------------------------------------------------- the right-click menu */

/** Every kind of selection that is one element or more; `none` is the slide itself. */
const elementKinds: SelectionKind[] = [
  'text',
  'image',
  'shape',
  'table',
  'chart',
  'media',
  'html',
  'group',
  'multiple',
];

/*
 * Groups, top to bottom: the clipboard (10), the element's own way in (20), order and alignment
 * (30), grouping (40), lock and hide (50), and the AI tools last (90). Another area adds what
 * only it knows, between them: the table's rows and columns are at 25.
 */
const menu: {
  id: string;
  order: number;
  kinds: readonly SelectionKind[];
  render: ComponentType<ContextToolProps>;
}[] = [
  { id: 'clipboard', order: 10, kinds: ['none', ...elementKinds], render: ClipboardItems },
  { id: 'edit', order: 20, kinds: elementKinds, render: EditItems },
  { id: 'order', order: 30, kinds: elementKinds, render: OrderItems },
  { id: 'group', order: 40, kinds: ['group', 'multiple'], render: GroupItems },
  { id: 'state', order: 50, kinds: elementKinds, render: StateItems },
  { id: 'ai', order: 90, kinds: ['none', ...elementKinds], render: AiItems },
];
for (const { id, ...part } of menu) registerStageMenu({ id: `stage.${id}`, group: id, ...part });
