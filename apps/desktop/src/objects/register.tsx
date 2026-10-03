import { registerMessages } from '../i18n';
import { getEditor, registerAction, registerActionPopover, registerContextTool } from '../shell';
import { BackgroundTool } from './BackgroundTool';
import { insertImages } from './insert';
import { LineLibrary, ShapeLibrary } from './library';
import { en, he } from './messages';
import { EffectsRow, ImageRow, ShapeRow } from './tools';

/*
 * The objects area (WG5): inserting pictures, shapes and lines, styling them, and the slide
 * background. See docs/adr/ADR-014-objects.md.
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
// Replaces the shell's placeholder of the same id.
registerContextTool({
  id: 'slide.background',
  kinds: ['none'],
  group: 'slide',
  order: 0,
  render: BackgroundTool,
});
