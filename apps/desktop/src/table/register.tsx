import { registerActionPopover, registerContextTool } from '../shell';
import {
  BoldTool,
  ColorTool,
  FontTool,
  ItalicTool,
  SizeTool,
  UnderlineTool,
} from '../text/toolbar/CharacterTools';
import { AlignTool } from '../text/toolbar/ParagraphTools';
import { installTableClipboard } from './clipboard';
import './messages';
import { TableInsert } from './TableInsert';
import { LookTools, StructureTools } from './tools';

/*
 * The table area (WG6): inserting a table (row A), the table tools of row B, and pasting tables.
 * What the Stage does for a table is `stage.tsx`. See docs/adr/ADR-033-tables.md.
 */

/* ---------------------------------------------------------------- row A */

registerActionPopover('insert.table', TableInsert);

/* ---------------------------------------------------------------- row B */

/*
 * The table's own tools first (SPEC 4.4), then the text tools that matter most in a cell. The
 * text tools are the ones a text box has: they format the selection of the editor open in a
 * cell, or all the text of the selected cells (`text/cellScope.ts`). The rest of them (lists,
 * spacing, highlight) are left out: the row is no wider than the editor at 1366.
 */
const tools = [
  { id: 'table.structure', group: 'table.structure', order: 10, render: StructureTools },
  { id: 'table.look', group: 'table.look', order: 20, render: LookTools },
  { id: 'table.text.font', group: 'table.font', order: 110, render: FontTool },
  { id: 'table.text.size', group: 'table.font', order: 111, render: SizeTool },
  { id: 'table.text.bold', group: 'table.marks', order: 120, render: BoldTool },
  { id: 'table.text.italic', group: 'table.marks', order: 121, render: ItalicTool },
  { id: 'table.text.underline', group: 'table.marks', order: 122, render: UnderlineTool },
  { id: 'table.text.color', group: 'table.marks', order: 123, render: ColorTool },
  { id: 'table.text.align', group: 'table.paragraph', order: 130, render: AlignTool },
];
for (const tool of tools) registerContextTool({ ...tool, kinds: ['table'] });

/* ---------------------------------------------------------------- clipboard */

const stopClipboard = installTableClipboard();
import.meta.hot?.dispose(stopClipboard);
