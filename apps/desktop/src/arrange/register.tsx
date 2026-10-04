import type { ZOrderMove } from '@slidr/model';
import { Layers } from '@slidr/ui/icons';
import { i18n, registerMessages } from '../i18n';
import {
  registerContextTool,
  registerPanel,
  registerShortcut,
  type Editor,
  type SelectionKind,
} from '../shell';
import { duplicate, group, pasteStyle, reorder, ungroup } from './actions';
import {
  AlignHorizontal,
  AlignVertical,
  ArrangeMenu,
  Distribute,
  GroupButton,
  LAYERS_PANEL,
} from './ArrangeTools';
import { copiedElement, focusInFilmstrip, installClipboard } from './clipboard';
import { LayersPanel } from './LayersPanel';
import { en, he } from './messages';
import { PlacementTool } from './PlacementTool';
import { addSlide, duplicateSlides, layoutOfCurrentSlide } from './slides';

/*
 * Arranging objects and managing slides (WG5-T06, T08): row B for a multiple selection, the
 * Arrange menu for every element, the Layers panel, the shortcuts of SPEC Appendix A, and the
 * clipboard. See docs/adr/ADR-015-arrange-and-slides.md.
 */

registerMessages('arrange', { he, en });

/* ---------------------------------------------------------------- row B */

registerContextTool({
  id: 'arrange.alignHorizontal',
  kinds: ['multiple'],
  group: 'arrange.alignHorizontal',
  order: 10,
  render: AlignHorizontal,
});
registerContextTool({
  id: 'arrange.alignVertical',
  kinds: ['multiple'],
  group: 'arrange.alignVertical',
  order: 20,
  render: AlignVertical,
});
registerContextTool({
  id: 'arrange.distribute',
  kinds: ['multiple'],
  group: 'arrange.distribute',
  order: 30,
  render: Distribute,
});
registerContextTool({
  id: 'arrange.group',
  kinds: ['multiple', 'group'],
  group: 'arrange.group',
  order: 40,
  render: GroupButton,
});

/** Every kind of selection that is one element or more. */
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
// Position, size and rotation as numbers (ARR-07): for one element, just before the menu.
registerContextTool({
  id: 'arrange.placement',
  kinds: elementKinds.filter((kind) => kind !== 'multiple'),
  group: 'arrange.menu',
  order: 890,
  render: PlacementTool,
});
// Order 900 and up is the end of the row, after the tools of the element's own kind.
registerContextTool({
  id: 'arrange.menu',
  kinds: elementKinds,
  group: 'arrange.menu',
  order: 900,
  render: ArrangeMenu,
});

/* ---------------------------------------------------------------- the Layers panel */

registerPanel({
  id: LAYERS_PANEL,
  kind: 'tool',
  slot: 'tools',
  order: 2,
  title: 'panels.layers',
  icon: Layers,
  content: LayersPanel,
});

/* ---------------------------------------------------------------- shortcuts (SPEC Appendix A) */

registerShortcut({
  id: 'arrange.duplicate',
  keys: 'Ctrl+D',
  // With the focus in the Filmstrip the slides are what is duplicated.
  run: (editor) => (focusInFilmstrip() ? duplicateSelectedSlides(editor) : duplicate(editor)),
});
registerShortcut({
  id: 'arrange.pasteStyle',
  keys: 'Ctrl+Alt+V',
  run: (editor) => pasteStyle(editor, copiedElement()),
});
registerShortcut({ id: 'arrange.group', keys: 'Ctrl+G', run: group });
registerShortcut({ id: 'arrange.ungroup', keys: 'Ctrl+Shift+G', run: ungroup });

const orderKeys: Record<ZOrderMove, string> = {
  front: 'Ctrl+Shift+]',
  forward: 'Ctrl+]',
  backward: 'Ctrl+[',
  back: 'Ctrl+Shift+[',
};
for (const [to, keys] of Object.entries(orderKeys) as [ZOrderMove, string][]) {
  registerShortcut({ id: `arrange.order.${to}`, keys, run: (editor) => reorder(editor, to) });
}

registerShortcut({
  id: 'arrange.newSlide',
  keys: 'Ctrl+M',
  run: ({ bus, selection }) => {
    addSlide(bus, selection, {
      layoutId: layoutOfCurrentSlide(bus.deck, selection),
      label: i18n.t('arrange:slides.new'),
    });
  },
});

function duplicateSelectedSlides({ bus, selection }: Editor): boolean {
  const ids = selection.getState().selectedSlideIds;
  if (ids.length === 0) return false;
  duplicateSlides(bus, selection, ids, i18n.t('arrange:slides.duplicate'));
  return true;
}

/* ---------------------------------------------------------------- clipboard */

const stopClipboard = installClipboard();
import.meta.hot?.dispose(stopClipboard);
