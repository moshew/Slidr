import { CodeXml } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import {
  getEditor,
  registerAction,
  registerActionPopover,
  registerContextTool,
  registerPanel,
  registerStageMenu,
} from '../shell';
import { BackgroundTool } from './BackgroundTool';
import { CODE_PANEL, CodePanel } from './CodePanel';
import { HtmlRow } from './htmlTools';
import { insertImages } from './insert';
import { LineLibrary, ShapeLibrary } from './library';
import { HtmlMenuItems, ImageMenuItems } from './menu';
import { en, he } from './messages';
import { EffectsRow, ImageRow, ShapeRow } from './tools';

/*
 * The objects area (WG5): inserting pictures, shapes and lines, styling them, the slide
 * background, and the code of an `html` element. See docs/adr/ADR-014-objects.md and
 * ADR-057-objects-code-media-images.md.
 */

registerMessages('objects', { he, en });

/* Row A: Insert. */
registerAction('insert.image', () => void insertImages(getEditor()));
registerActionPopover('insert.shape', ShapeLibrary);
registerActionPopover('insert.line', LineLibrary);

/*
 * Row B. One tool per kind of selection: it draws its own groups, since what applies depends on
 * the element (shape, line and SVG are all the `shape` kind). The orders leave 10 for the Crop
 * button of an image, and 900 and up for the arrange menu.
 */
registerContextTool({
  id: 'objects.shape',
  kinds: ['shape'],
  group: 'objects',
  order: 10,
  render: ShapeRow,
});
registerContextTool({
  id: 'objects.image',
  kinds: ['image'],
  group: 'objects',
  order: 20,
  render: ImageRow,
});
registerContextTool({
  id: 'objects.effects',
  kinds: ['text', 'html', 'table', 'chart', 'media', 'group'],
  group: 'effects',
  order: 800,
  render: EffectsRow,
});
registerContextTool({
  id: 'objects.html',
  kinds: ['html'],
  group: 'objects',
  order: 30,
  render: HtmlRow,
});
// Replaces the shell's placeholder of the same id.
registerContextTool({
  id: 'slide.background',
  kinds: ['none'],
  group: 'slide',
  order: 0,
  render: BackgroundTool,
});

/*
 * The code panel (HTM-04): after the panels of SPEC 4.2. It shows the selected `html` element,
 * and row B's "Edit the code" opens it.
 */
registerPanel({
  id: CODE_PANEL,
  kind: 'tool',
  slot: 'tools',
  order: 6,
  title: 'objects:code.title',
  icon: CodeXml,
  content: CodePanel,
});

/*
 * The Stage's right-click menu (STG-06): replace a picture, edit the code of an `html` element and
 * decompose it, in the group of the element's own way in (crop, edit the text).
 */
registerStageMenu({
  id: 'objects.image',
  kinds: ['image'],
  group: 'edit',
  order: 21,
  render: ImageMenuItems,
});
registerStageMenu({
  id: 'objects.html',
  kinds: ['html'],
  group: 'edit',
  order: 22,
  render: HtmlMenuItems,
});
