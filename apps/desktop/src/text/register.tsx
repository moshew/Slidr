import { i18n, registerMessages } from '../i18n';
import {
  getEditor,
  registerAction,
  registerContextTool,
  registerShortcut,
  type Editor,
} from '../shell';
import { flipDirection, toggleBold, toggleMark, type Step, type TextTarget } from './actions';
import type { FormatContext } from './format';
import { insertTextBox } from './insert';
import { en, he } from './messages';
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
import { AlignTool, DirectionTool, ListTool, SpacingTool } from './toolbar/ParagraphTools';
import { formatContext, resolveTarget } from './toolbar/shared';

/*
 * The text area (WG4): the text tools of row B, the "Text" button of row A, and the text
 * shortcuts of SPEC Appendix A. See docs/adr/ADR-013-text-formatting.md.
 */

registerMessages('text', { he, en });

/* ---------------------------------------------------------------- row B */

/*
 * Groups and order ranges: font 10-19, marks 20-29, colour 30-39, paragraph 40-49, list 50-59,
 * spacing 60-69, the text box 70-79. Other areas follow from 800 (effects) and 900 (arrange).
 */
const tools = [
  { id: 'text.font', group: 'font', order: 10, render: FontTool },
  { id: 'text.size', group: 'font', order: 11, render: SizeTool },
  { id: 'text.weight', group: 'font', order: 12, render: WeightTool },
  { id: 'text.bold', group: 'marks', order: 20, render: BoldTool },
  { id: 'text.italic', group: 'marks', order: 21, render: ItalicTool },
  { id: 'text.underline', group: 'marks', order: 22, render: UnderlineTool },
  { id: 'text.more', group: 'marks', order: 23, render: MoreTool },
  { id: 'text.color', group: 'color', order: 30, render: ColorTool },
  { id: 'text.highlight', group: 'color', order: 31, render: HighlightTool },
  { id: 'text.align', group: 'paragraph', order: 40, render: AlignTool },
  { id: 'text.direction', group: 'paragraph', order: 41, render: DirectionTool },
  { id: 'text.list', group: 'list', order: 50, render: ListTool },
  { id: 'text.spacing', group: 'spacing', order: 60, render: SpacingTool },
  { id: 'text.box', group: 'box', order: 70, render: BoxTool },
];
for (const tool of tools) registerContextTool({ ...tool, kinds: ['text'] });

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
    run(target, formatContext(editor), { label: i18n.t('text:step.format') });
    return true;
  };
}

registerShortcut({ id: 'text.bold', keys: 'Ctrl+B', run: onText(toggleBold) });
registerShortcut({
  id: 'text.italic',
  keys: 'Ctrl+I',
  run: onText((target, ctx, step) => toggleMark(target, ctx, 'italic', step)),
});
registerShortcut({
  id: 'text.underline',
  keys: 'Ctrl+U',
  run: onText((target, ctx, step) => toggleMark(target, ctx, 'underline', step)),
});
registerShortcut({ id: 'text.direction', keys: 'Ctrl+Shift+X', run: onText(flipDirection) });
registerShortcut({ id: 'text.insert', keys: 'T', run: insertTextBox });
