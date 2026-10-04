import { i18n, registerMessages } from '../i18n';
import {
  getEditor,
  registerAction,
  registerContextTool,
  registerShortcut,
  whenEditor,
  type Editor,
} from '../shell';
import {
  clearFormatting,
  flipDirection,
  toggleBold,
  toggleMark,
  type Step,
  type TextTarget,
} from './actions';
import type { FormatContext } from './format';
import { insertTextBox } from './insert';
import { en, he } from './messages';
import { typeToEdit } from './opening';
import { paint, pickUp, watchPainter } from './painter';
import { BoxTool } from './toolbar/BoxTool';
import {
  BoldTool,
  ColorTool,
  FontTool,
  HighlightTool,
  ItalicTool,
  MoreTool,
  SizeTool,
  UnderlineTool,
  WeightTool,
} from './toolbar/CharacterTools';
import { TextEffectsTool } from './toolbar/EffectsTool';
import { LinkTool, requestLink } from './toolbar/LinkTool';
import { AlignTool, DirectionTool, ListTool, SpacingTool } from './toolbar/ParagraphTools';
import {
  CLEAR_KEYS,
  formatContext,
  LINK_KEYS,
  PAINT_FORMAT_KEYS,
  PICK_FORMAT_KEYS,
  resolveTarget,
} from './toolbar/shared';
import { ShapeTextTool } from './toolbar/ShapeTextTool';
import { PainterTool, StyleTool } from './toolbar/StyleTools';

/*
 * The text area (WG4): the text tools of row B, the "Text" button of row A, and the text
 * shortcuts of SPEC Appendix A. See docs/adr/ADR-013-text-formatting.md.
 */

registerMessages('text', { he, en });

/* ---------------------------------------------------------------- row B */

/*
 * Groups and order ranges: font 8-19 (the format painter first), marks 20-29, colour 30-39,
 * paragraph 40-49, and the layout of the text from 50: lists, spacing and the text box, as one
 * group, since every group costs the row its gap. Other areas follow from 800 (effects) and 900
 * (arrange).
 */
const tools = [
  { id: 'text.painter', group: 'font', order: 8, render: PainterTool },
  { id: 'text.style', group: 'font', order: 9, render: StyleTool },
  { id: 'text.font', group: 'font', order: 10, render: FontTool },
  { id: 'text.size', group: 'font', order: 11, render: SizeTool },
  { id: 'text.weight', group: 'font', order: 12, render: WeightTool },
  { id: 'text.bold', group: 'marks', order: 20, render: BoldTool },
  { id: 'text.italic', group: 'marks', order: 21, render: ItalicTool },
  { id: 'text.underline', group: 'marks', order: 22, render: UnderlineTool },
  { id: 'text.more', group: 'marks', order: 23, render: MoreTool },
  { id: 'text.link', group: 'marks', order: 24, render: LinkTool },
  { id: 'text.color', group: 'color', order: 30, render: ColorTool },
  { id: 'text.highlight', group: 'color', order: 31, render: HighlightTool },
  { id: 'text.align', group: 'paragraph', order: 40, render: AlignTool },
  { id: 'text.direction', group: 'paragraph', order: 41, render: DirectionTool },
  { id: 'text.list', group: 'layout', order: 50, render: ListTool },
  { id: 'text.spacing', group: 'layout', order: 60, render: SpacingTool },
  { id: 'text.box', group: 'layout', order: 70, render: BoxTool },
  // Beside the effects every element has (opacity, shadow, corners), which the objects area draws.
  { id: 'text.effects', group: 'effects', order: 799, render: TextEffectsTool },
];
for (const tool of tools) registerContextTool({ ...tool, kinds: ['text'] });

// A selected shape has the row of a shape; its text is one button away (SHP-04).
registerContextTool({
  id: 'text.shapeText',
  kinds: ['shape'],
  group: 'text',
  order: 30,
  render: ShapeTextTool,
});

/* ---------------------------------------------------------------- row A */

registerAction('insert.text', () => void insertTextBox(getEditor()));

/* ---------------------------------------------------------------- shortcuts */

/*
 * For a text box or a shape that is selected and not being edited: the shortcut formats all of
 * its text. Inside the text editor the same keys are the editor's own (TextEditor.tsx), and act
 * on its selection.
 */
function onText(run: (target: TextTarget, ctx: FormatContext, step: Step) => void) {
  return (editor: Editor) => {
    const target = resolveTarget(editor);
    if (!target) return false;
    run(target, formatContext(editor, target), { label: i18n.t('text:step.format') });
    return true;
  };
}

/** A field that types text and is not the slide's text editor: the chat, a field of a popover. */
function inOtherField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-text-editor]')) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

/*
 * The shortcuts that have no key of the editor's own: the shell hears them while the text is
 * being edited too (`inText`), and they act on the editor's selection there. The shell matches a
 * letter by its physical key, which the editor's keymap does not do for Ctrl+Alt on Windows.
 */
function onTextOrSelection(run: (target: TextTarget) => boolean | void) {
  return (editor: Editor, event: KeyboardEvent) => {
    const target = inOtherField(event.target) ? null : resolveTarget(editor);
    return target ? run(target) !== false : false;
  };
}

const text = { section: 'text' } as const;

registerShortcut({
  id: 'text.bold',
  keys: 'Ctrl+B',
  run: onText(toggleBold),
  label: 'text:shortcut.bold',
  ...text,
});
registerShortcut({
  id: 'text.italic',
  keys: 'Ctrl+I',
  run: onText((target, ctx, step) => toggleMark(target, ctx, 'italic', step)),
  label: 'text:shortcut.italic',
  ...text,
});
registerShortcut({
  id: 'text.underline',
  keys: 'Ctrl+U',
  run: onText((target, ctx, step) => toggleMark(target, ctx, 'underline', step)),
  label: 'text:shortcut.underline',
  ...text,
});
registerShortcut({
  id: 'text.direction',
  keys: 'Ctrl+Shift+X',
  run: onText(flipDirection),
  label: 'text:shortcut.direction',
  ...text,
});
registerShortcut({
  id: 'text.clear',
  keys: CLEAR_KEYS,
  inText: true,
  run: onTextOrSelection((target) => clearFormatting(target, { label: i18n.t('text:step.clear') })),
  label: 'text:shortcut.clear',
  ...text,
});
registerShortcut({
  id: 'text.pickFormat',
  keys: PICK_FORMAT_KEYS,
  inText: true,
  run: onTextOrSelection((target) => pickUp(target)),
  label: 'text:shortcut.pickFormat',
  ...text,
});
registerShortcut({
  id: 'text.paintFormat',
  keys: PAINT_FORMAT_KEYS,
  inText: true,
  run: onTextOrSelection(paint),
  label: 'text:shortcut.paintFormat',
  ...text,
});
registerShortcut({
  id: 'text.link',
  keys: LINK_KEYS,
  inText: true,
  // The popover is a tool of row B, which a text box has, and a shape while its text is edited.
  run: onTextOrSelection((target) => {
    if (target.kind === 'element' && target.element.type !== 'text') return false;
    if (target.kind === 'cells' || target.element.type === 'table') return false;
    requestLink();
  }),
  label: 'text:shortcut.link',
  ...text,
});
registerShortcut({
  id: 'text.insert',
  keys: 'T',
  run: insertTextBox,
  label: 'text:shortcut.insert',
  section: 'insert',
});

/* ---------------------------------------------------------------- what follows the selection */

// The format painter paints the box that is clicked while the brush is in hand, and a character
// typed on a selected text box or shape starts editing its text (SHP-04).
whenEditor((editor) => {
  watchPainter(editor);
  typeToEdit(editor);
});
