import {
  findElementInDeck,
  newId,
  type CellRef,
  type CommandBus,
  type Direction,
  type RichText,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type Theme,
} from '@slidr/model';
import { cellTextDefaults, colorCss } from '@slidr/renderer';
import { Extension } from '@tiptap/core';
import { Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
// By file, not through the shell's index: the index loads the Stage, which loads this editor.
import { stageElement } from '../shell/stageDom';
import { flipDirection, syncGrowHeight, toggleBold, toggleMark, type TextTarget } from './actions';
import { announceEditor } from './activeEditor';
import { cellsWritten } from './cellScope';
import { changeParagraphsTr, STEP_META, type StepMeta } from './editorFormat';
import { editorCommand, type EditorCommand } from './editorKeys';
import { levelChange, type FormatContext } from './format';
import { finishOpening, takeOpening } from './opening';
import { knowInstalledFonts, sourceContext } from './pasteSource';
import {
  blurredSelectionPlugin,
  clipboardPlugin,
  decorationsPlugin,
  emptyLinePlugin,
  painterPlugin,
  rightClickPlugin,
} from './plugins';
import { docToRichText, normalizeRichText, richTextToDoc, sameValue } from './richTextDoc';
import { textExtensions } from './schema';

/**
 * In-place text editing on the Stage (WG4-T02, TXT-01), following ADR-006:
 * - TipTap sits inside the scaled slide, in the element's own text box (`TextSlot`), so the text
 *   does not move when editing starts.
 * - TipTap keeps no history. Every change is `text.set` on the bus, and a burst of typing is one
 *   transaction: a pause of 650ms or a caret move starts the next (rule 3). Ctrl+Z is the bus's.
 * - The caret and the selection are the browser's own (rule 2).
 *
 * Formatting from the toolbar and from the keyboard, paste, cut and drop are each an undo step of
 * their own, apart from the typing around them (ADR-013). The editor announces itself
 * (`activeEditor.ts`), which is how the toolbar reaches its selection.
 *
 * The same editor edits one cell of a table (WG6): it sits in the cell (`CellSlot`), writes
 * `text.set` with the cell, and takes the cell's direction and text defaults from its table.
 */
export interface TextEditorProps {
  bus: CommandBus;
  slideId: string;
  element: TextElement | ShapeElement | TableElement;
  /** For a table: the cell whose text is edited. */
  cell?: CellRef;
  theme: Theme;
  /** Where the user double-clicked, to put the caret there. Without it the caret goes to the end. */
  caretAt?: { x: number; y: number };
  /** Without `caretAt`: the caret at the end of the text (the default), or all of it selected. */
  select?: 'end' | 'all';
  /**
   * What was typed to open the editor (a character on a selected table cell): it takes the place
   * of all the text, in the formatting the text had, as the first of the typing that follows.
   */
  replaceWith?: string;
  /**
   * Keys the host takes before the editor does, by their ProseMirror names: Tab between the cells
   * of a table. A handler that returns false leaves the key to the editor.
   */
  keys?: Record<string, () => boolean>;
  /** Esc: leave editing. */
  onExit: () => void;
}

/** A pause in typing longer than this starts a new undo step (ADR-006). */
const BURST_MS = 650;
/** How long after it opened with a typed character the editor is still settling its selection. */
const OPENING_MS = 200;

const NO_TEXT: RichText = { paragraphs: [] };

type Dispatch = (tr: Transaction) => void;

/** The text the editor is open on: the element's own, or that of one cell of a table. */
function editedText(element: TextEditorProps['element'], cell: CellRef | undefined): RichText {
  if (element.type !== 'table') return element.content ?? NO_TEXT;
  return (cell ? element.cells[cell.row]?.[cell.col]?.content : undefined) ?? NO_TEXT;
}

/** Text in a shape is expected in its middle: a shape without text starts with a centred line (SHP-04). */
const CENTRED: RichText = { paragraphs: [{ dir: 'auto', align: 'center', runs: [] }] };

/** What the editor shows for the text: the text itself, or for a shape that has none, one centred line. */
function shownText(element: TextEditorProps['element'], cell: CellRef | undefined): RichText {
  const text = editedText(element, cell);
  return element.type === 'shape' && text.paragraphs.length === 0 ? CENTRED : text;
}

/**
 * Tab / Shift+Tab: one list level deeper or shallower (TXT-06). Outside a list Tab does nothing,
 * but it is still taken, so focus does not leave the text box.
 */
function shiftLevel(state: EditorState, dispatch: Dispatch, by: 1 | -1): boolean {
  const tr = changeParagraphsTr(state, levelChange(by));
  if (tr.docChanged) dispatch(tr);
  return true;
}

/** Enter on an empty list item ends the list, as in every word processor. */
function leaveEmptyListItem(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || node.type.name !== 'paragraph' || node.content.size > 0 || !node.attrs.list)
    return false;
  dispatch(state.tr.setNodeAttribute($from.before(), 'list', null));
  return true;
}

/**
 * Shift+Enter breaks the line inside the paragraph, as in every word processor: the model keeps
 * the break as a newline in the run's text (UI-06; ADR-060 listed it as having no key at all).
 * The break carries the marks at the caret, so what is typed after it looks as before.
 */
function breakLine(state: EditorState, dispatch: Dispatch): boolean {
  const type = state.schema.nodes.hardBreak;
  if (!type) return false;
  const marks = state.storedMarks ?? state.selection.$from.marks();
  dispatch(
    state.tr.replaceSelectionWith(type.create(), true).setStoredMarks(marks).scrollIntoView(),
  );
  return true;
}

/** Backspace at the start of a list item removes its bullet before it joins paragraphs. */
function unlistAtStart(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || $from.parentOffset !== 0 || node.type.name !== 'paragraph' || !node.attrs.list)
    return false;
  dispatch(state.tr.setNodeAttribute($from.before(), 'list', null));
  return true;
}

/**
 * Ctrl+arrow moves by a word; at the very start of the text, the arrow that points back has
 * nowhere to go. In the app Chromium then puts the caret at the END of the text (it does not in a
 * page with nothing editable before the editor), and with Shift selects all of it. The key is
 * taken instead, so the caret stays; the same at the end, where the browser already stays.
 * Which arrow points back depends on the direction of the paragraph (ADR-006: the arrows are
 * logical in it).
 */
function wordMoveAtEdge(view: EditorView, arrow: 'left' | 'right'): boolean {
  const { $head } = view.state.selection;
  const dom = view.nodeDOM($head.before());
  const rtl = dom instanceof HTMLElement && getComputedStyle(dom).direction === 'rtl';
  const forward = (arrow === 'left') === rtl;
  if (forward)
    return (
      $head.parentOffset === $head.parent.content.size &&
      $head.index(0) === $head.doc.childCount - 1
    );
  return $head.parentOffset === 0 && $head.index(0) === 0;
}

/** A transaction that puts the selection at the given positions, as far as the text allows. */
function selectionTr(state: EditorState, anchor: number, head: number): Transaction {
  const { doc } = state;
  const at = (pos: number) => doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  return state.tr.setSelection(TextSelection.between(at(anchor), at(head)));
}

/** What makes a transaction an undo step of its own: a formatting change, or the clipboard. */
function ownStep(transaction: Transaction): StepMeta | undefined {
  const step = transaction.getMeta(STEP_META) as StepMeta | undefined;
  if (step) return step;
  const event = transaction.getMeta('uiEvent') as string | undefined;
  if (event === 'paste') return { label: 'Paste' };
  if (event === 'cut') return { label: 'Cut' };
  if (event === 'drop') return { label: 'Move text' };
  return undefined;
}

export function TextEditor({
  bus,
  slideId,
  element,
  cell,
  theme,
  caretAt,
  select = 'end',
  replaceWith,
  keys,
  onExit,
}: TextEditorProps) {
  // What the editor's handlers call when they run: the editor outlives the render that made it.
  const exitRef = useRef(onExit);
  const keysRef = useRef(keys);
  const burst = useRef<{ txId: string; at: number } | null>(null);
  /** When the editor opened with a typed character (`replaceWith`); 0 when it did not. */
  const openedTyping = useRef(0);
  /**
   * Where the selection is and whether the editor has the focus, once it has opened. A change of
   * theme builds the editor anew (its paragraphs are drawn from the theme), and the new one
   * carries on from here instead of opening again.
   */
  const kept = useRef<{ anchor: number; head: number; focused: boolean } | null>(null);
  /** What the editor last wrote to the model, to tell our own changes from undo or the agent's. */
  const written = useRef<RichText>(normalizeRichText(editedText(element, cell)));

  useEffect(() => {
    exitRef.current = onExit;
    keysRef.current = keys;
  });

  /**
   * The direction of a `dir: auto` line without letters: the deck's, and in a table the table's
   * (SPEC 5.4). Read from the deck when it is asked for: the direction of a table can change
   * while one of its cells is edited.
   */
  const emptyDir = (): Direction => {
    const current = findElementInDeck(bus.deck, element.id)?.element;
    return current?.type === 'table' ? current.dir : bus.deck.meta.dir;
  };

  // The text of a table cell starts from what its table gives it: the header row's colour and
  // weight. The renderer draws the cell with the same, so nothing changes when editing starts.
  const defaults =
    element.type === 'table' && cell ? cellTextDefaults(element, cell.row, cell.col) : undefined;
  // A text box draws its text in a colour of its own where its layout gave it one.
  const ink = element.type === 'text' && element.color ? colorCss(element.color) : defaults?.color;

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions({
          // Paragraph styles read the theme when they draw; a theme change rebuilds the editor.
          getTheme: () => theme,
          styleRef: 'body',
          wrap: element.type === 'text' ? (element.wrap ?? true) : true,
          color: ink,
          weight: defaults?.weight,
          alignTo: defaults?.alignTo,
        }),
        Extension.create({
          name: 'slidrKeys',
          addKeyboardShortcuts() {
            const ed = this.editor;
            const own: Record<string, () => boolean> = {
              Tab: () => shiftLevel(ed.state, ed.view.dispatch, 1),
              'Shift-Tab': () => shiftLevel(ed.state, ed.view.dispatch, -1),
              Enter: () => leaveEmptyListItem(ed.state, ed.view.dispatch),
              'Shift-Enter': () => breakLine(ed.state, ed.view.dispatch),
              Backspace: () => unlistAtStart(ed.state, ed.view.dispatch),
              'Mod-ArrowLeft': () => wordMoveAtEdge(ed.view, 'left'),
              'Mod-ArrowRight': () => wordMoveAtEdge(ed.view, 'right'),
              'Shift-Mod-ArrowLeft': () => wordMoveAtEdge(ed.view, 'left'),
              'Shift-Mod-ArrowRight': () => wordMoveAtEdge(ed.view, 'right'),
              // All the text, from the start of its first line to the end of its last, as the
              // menu selects it: what is typed over it keeps the first paragraph, with its
              // direction and alignment, and the type the text was set in. The editor's own
              // "select all" takes the paragraphs too, and what is typed then is bare.
              'Mod-a': () => {
                const { doc, tr } = ed.state;
                ed.view.dispatch(
                  tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)),
                );
                return true;
              },
              Escape: () => {
                exitRef.current();
                return true;
              },
            };
            // The host's keys come first; one that declines leaves the key to the editor.
            const shortcuts = { ...own };
            for (const name of Object.keys(keys ?? {})) {
              shortcuts[name] = () =>
                Boolean(keysRef.current?.[name]?.()) || (own[name]?.() ?? false);
            }
            return shortcuts;
          },
          addProseMirrorPlugins() {
            const ed = this.editor;
            const target = (): TextTarget => ({
              kind: 'editor',
              view: ed.view,
              bus,
              slideId,
              element,
            });
            const ctx = (): FormatContext => ({ theme, dir: emptyDir() });
            // The commands whose keys the user can move (`editorKeys.ts`): which key each is
            // on is asked at every press, so they are no part of the fixed keymap above.
            const commands: Record<EditorCommand, () => void> = {
              undo: () => void bus.undo(),
              redo: () => void bus.redo(),
              bold: () => toggleBold(target(), ctx()),
              italic: () => toggleMark(target(), ctx(), 'italic'),
              underline: () => toggleMark(target(), ctx(), 'underline'),
              // SPEC Appendix A: flips the direction of the paragraphs the selection touches.
              direction: () => flipDirection(target(), ctx()),
            };
            return [
              new Plugin({
                props: {
                  handleKeyDown(_view, event) {
                    const command = editorCommand(event);
                    if (!command) return false;
                    commands[command]();
                    return true;
                  },
                  handleDOMEvents: {
                    // The browser has an undo and a bold of its own for editable text. Its
                    // history is not the deck's (ADR-006, rule 3), and its formatting is no
                    // mark of the model. Their keys are kept from it by the shell, also once
                    // they are no longer the keys of the commands above (`shell/shortcuts.ts`);
                    // this turns back the same asked for in any other way, where the browser
                    // lets it be turned back (its own undo it does not).
                    beforeinput(_view, event) {
                      if (!/^(?:history|format)/.test(event.inputType)) return false;
                      event.preventDefault();
                      return true;
                    },
                  },
                },
              }),
              decorationsPlugin(emptyDir),
              emptyLinePlugin(),
              blurredSelectionPlugin(),
              clipboardPlugin({ source: () => sourceContext(bus.deck), dir: emptyDir }),
              rightClickPlugin(),
              painterPlugin(() => ({ kind: 'editor', view: ed.view, bus, slideId, element })),
            ];
          },
        }),
      ],
      content: richTextToDoc(shownText(element, cell)),
      editorProps: {
        attributes: {
          'data-text-editor': '',
          spellcheck: 'false',
          style:
            'outline: none; white-space: pre-wrap; overflow-wrap: break-word; caret-color: auto;',
        },
      },
      onSelectionUpdate: ({ transaction }) => {
        // Moving the caret ends the typing burst. Not the selection the browser reports as the
        // editor takes the focus, right after it opened with a typed character: that character
        // and the typing that follows it are one burst.
        const opening = performance.now() - openedTyping.current < OPENING_MS;
        if (!transaction.docChanged && !opening) burst.current = null;
      },
      onTransaction: ({ editor: ed, transaction }) => {
        // So does a formatting change, also one that only sets what is typed next.
        if (ownStep(transaction)) burst.current = null;
        const { anchor, head } = ed.state.selection;
        if (kept.current) kept.current = { ...kept.current, anchor, head };
      },
      onFocus: ({ editor: ed }) => {
        if (kept.current) kept.current.focused = true;
        // What was typed on the selected box while the editor was on its way to the keyboard.
        const rest = finishOpening(element.id);
        if (rest) ed.view.dispatch(ed.state.tr.insertText(rest));
      },
      onBlur: () => {
        if (kept.current) kept.current.focused = false;
      },
      onUpdate: ({ editor: ed, transaction }) => {
        const content = docToRichText(ed.getJSON());
        written.current = content;
        const step = ownStep(transaction);
        let txId: string;
        if (step) {
          txId = step.txId ?? newId('tx');
        } else {
          const now = performance.now();
          if (!burst.current || now - burst.current.at > BURST_MS)
            burst.current = { txId: newId('tx'), at: now };
          burst.current.at = now;
          txId = burst.current.txId;
        }
        bus.dispatch(
          { type: 'text.set', slideId, elementId: element.id, content, ...(cell ? { cell } : {}) },
          { txId, label: step ? (step.label ?? 'Format') : 'Typing' },
        );
        if (element.type === 'table') {
          // A row is as tall as its text: the table area writes the new heights, in the same step.
          cellsWritten(bus, element.id, txId);
        } else {
          // A growing text box writes its new height to the frame, in the same undo step.
          // By the time it is measured this editor may be gone, rebuilt for a new theme.
          syncGrowHeight(bus, element.id, txId, () =>
            ed.isDestroyed
              ? stageElement(element.id)
              : ed.view.dom.closest<HTMLElement>('[data-element-id]'),
          );
        }
      },
      onCreate: ({ editor: ed }) => {
        // A paste that keeps the fonts of its source has to know which fonts are installed.
        knowInstalledFonts();
        if (kept.current) {
          // Built anew for a new theme: the selection is where it was, and the focus is taken
          // only if the editor had it (it may be in a popover of the toolbar).
          const { anchor, head, focused } = kept.current;
          ed.view.dispatch(selectionTr(ed.state, anchor, head));
          if (focused) ed.view.focus();
          return;
        }
        // Opened by a typed character or from row B (`opening.ts`): the caret goes to the end,
        // wherever the last double click was.
        const opening = takeOpening(element.id);
        const point = opening ? undefined : caretAt;
        const pos = point ? ed.view.posAtCoords({ left: point.x, top: point.y }) : null;
        if (pos) {
          // A point beside the text (in a table cell, most of the cell) is between two lines: the
          // caret goes to the nearest place in the text.
          const at = ed.state.doc.resolve(pos.pos);
          if (at.parent.inlineContent) ed.commands.setTextSelection(pos.pos);
          else ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(at)));
        } else if (select === 'all') ed.commands.selectAll();
        ed.commands.focus(pos || select === 'all' ? null : 'end');
        if (replaceWith) {
          // From the start of the first line to the end of the last: the first paragraph stays,
          // with its direction and alignment, and the new text takes the marks of the old.
          const { doc, tr } = ed.state;
          const all = TextSelection.create(doc, 1, doc.content.size - 1);
          openedTyping.current = performance.now();
          ed.view.dispatch(tr.setSelection(all).insertText(replaceWith));
        } else if (opening?.typed) {
          // Typed on the selected box: it goes at the end of the text, in the formatting there,
          // as the first of the typing that follows.
          openedTyping.current = performance.now();
          ed.view.dispatch(ed.state.tr.insertText(opening.typed));
        }
        const { anchor, head } = ed.state.selection;
        kept.current = { anchor, head, focused: true };
      },
    },
    [theme, ink, defaults?.weight, defaults?.alignTo],
  );

  useEffect(() => {
    if (!editor) return;
    return announceEditor({ editor, slideId, elementId: element.id, ...(cell ? { cell } : {}) });
    // The cell is given as a new object on every render; its place is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, slideId, element.id, cell?.row, cell?.col]);

  // An undo, a redo or the agent changed the text while it is being edited: show the model's.
  const text = editedText(element, cell);
  const shown = shownText(element, cell);
  useEffect(() => {
    // An editor that a change of theme has just taken away is left alone: the one built in its
    // place starts from the model's text.
    if (!editor || editor.isDestroyed) return;
    // Compared as values: the editor and the model do not keep the keys of a run in one order.
    const model = normalizeRichText(text);
    if (sameValue(model, written.current)) return;
    written.current = model;
    const { anchor, head } = editor.state.selection;
    editor.commands.setContent(richTextToDoc(shown), { emitUpdate: false });
    // The selection stays where it was, as far as the new text allows.
    editor.view.dispatch(selectionTr(editor.state, anchor, head).setMeta('preventUpdate', true));
    burst.current = null;
  }, [editor, text, shown]);

  return <EditorContent editor={editor} />;
}
