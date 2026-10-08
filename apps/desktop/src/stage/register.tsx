import { findSlide, type ImageElement } from '@slidr/model';
import { Button, Icon, IconButton, Select, Slider, Toggle } from '@slidr/ui';
import { Check, Crop, RotateCcw, ZoomIn } from '@slidr/ui/icons';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { hide, toggleLock } from '../arrange/actions';
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
import { stageCommand } from './keyboardSession';
import { ClipboardItems, EditItems, GroupItems, OrderItems, StateItems } from './menu';
import { en, he } from './messages';
import { indexElements, type Located } from './space';
import { focusSelectionToolbar } from './SelectionToolbar';

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

/** The keyboard's way to the toolbar beside the selection (UI-06, ADR-060 section 3). */
registerShortcut({
  id: 'stage.toolbar',
  keys: 'Alt+F10',
  label: 'stage:toolbar.shortcut',
  section: 'edit',
  run: () => focusSelectionToolbar(),
});

/*
 * The keys of the keyboard pass (WG13-T06, UI-06): what the pointer did alone until now. Each is
 * a shortcut of the registry, so the shortcut map lists it and the user can change it; the Stage
 * that has the keyboard does the work (`stageCommand`), and says false when the key is not its
 * own right now, so the key goes its usual way. The arrows inside a mode (a crop handle, a point
 * of a line) stay the Stage's own, like the arrows that move and size.
 */
const pans = [
  { to: 'left', keys: 'Ctrl+Alt+ArrowLeft', dir: { x: -1, y: 0 } },
  { to: 'right', keys: 'Ctrl+Alt+ArrowRight', dir: { x: 1, y: 0 } },
  { to: 'up', keys: 'Ctrl+Alt+ArrowUp', dir: { x: 0, y: -1 } },
  { to: 'down', keys: 'Ctrl+Alt+ArrowDown', dir: { x: 0, y: 1 } },
];
for (const { to, keys, dir } of pans) {
  registerShortcut({
    id: `stage.pan.${to}`,
    keys,
    label: 'stage:keys.pan',
    section: 'view',
    run: () => stageCommand({ type: 'pan', dir }),
  });
}

// The selection walk: from element to element without selecting, and a key that adds the one
// the walk stands on to the selection or takes it out. Several elements that are not the whole
// slide are selected this way without the pointer.
registerShortcut({
  id: 'stage.walk.next',
  keys: 'Alt+ArrowDown',
  label: 'stage:keys.walk',
  section: 'edit',
  run: () => stageCommand({ type: 'walk', step: 1 }),
});
registerShortcut({
  id: 'stage.walk.previous',
  keys: 'Alt+ArrowUp',
  label: 'stage:keys.walk',
  section: 'edit',
  run: () => stageCommand({ type: 'walk', step: -1 }),
});
registerShortcut({
  id: 'stage.walk.toggle',
  keys: 'Alt+Enter',
  label: 'stage:keys.toggle',
  section: 'edit',
  run: () => stageCommand({ type: 'toggle' }),
});

// The points of a line, and the handles of a crop: Enter goes into the points as it goes into a
// group; Tab goes from one point or handle to the next, and the arrows then move it.
registerShortcut({
  id: 'stage.points',
  keys: 'Enter',
  label: 'stage:keys.points',
  section: 'arrange',
  run: () => stageCommand({ type: 'points' }),
});
registerShortcut({
  id: 'stage.part.next',
  keys: 'Tab',
  label: 'stage:keys.part',
  section: 'arrange',
  run: () => stageCommand({ type: 'part', step: 1 }),
});
registerShortcut({
  id: 'stage.part.previous',
  keys: 'Shift+Tab',
  label: 'stage:keys.part',
  section: 'arrange',
  run: () => stageCommand({ type: 'part', step: -1 }),
});
for (const [id, keys] of [
  ['stage.point.add', 'Insert'],
  // The key marked + on the row of digits; a keyboard without Insert has this one.
  ['stage.point.add.plus', 'Shift+='],
] as const) {
  registerShortcut({
    id,
    keys,
    label: 'stage:keys.addPoint',
    section: 'arrange',
    run: () => stageCommand({ type: 'point.add' }),
  });
}
for (const [id, keys] of [
  ['stage.point.remove', 'Delete'],
  ['stage.point.remove.backspace', 'Backspace'],
] as const) {
  registerShortcut({
    id,
    keys,
    label: 'stage:keys.removePoint',
    section: 'arrange',
    run: () => stageCommand({ type: 'point.remove' }),
  });
}

// Lock and hide had no key of their own (ADR-060, section 3): the menu's two items, as keys.
registerShortcut({
  id: 'stage.lock',
  keys: 'Ctrl+Shift+L',
  label: 'stage:keys.lock',
  section: 'arrange',
  run: (editor) => toggleLock(editor),
});
registerShortcut({
  id: 'stage.hide',
  keys: 'Ctrl+Shift+H',
  label: 'stage:keys.hide',
  section: 'arrange',
  run: (editor) => hide(editor),
});

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
 * (30), grouping (40), and lock and hide (50). Another area adds what only it knows, between
 * them: the table's rows and columns are at 25.
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
];
for (const { id, ...part } of menu) registerStageMenu({ id: `stage.${id}`, group: id, ...part });
