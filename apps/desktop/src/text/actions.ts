import {
  findElementInDeck,
  newId,
  updateElement,
  type CommandBus,
  type ElementPatch,
  type Insets,
  type CellRef,
  type RichText,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type TextStyleRef,
} from '@slidr/model';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
// By file, not through the shell's index: these are plain functions, and the index loads the app.
import { stageElement } from '../shell/stageDom';
import { refitPatches } from '../stage/groups';
import { indexElements } from '../stage/space';
import { cellsWritten } from './cellScope';
import {
  changeMarksTr,
  changeParagraphsTr,
  linkAt,
  paragraphsRange,
  sampleState,
  STEP_META,
  wordRange,
  type StepMeta,
  type TextRange,
} from './editorFormat';
import {
  boldChange,
  clearMarks,
  flippedDirection,
  linkChange,
  mapMarks,
  mapParagraphs,
  matchStyle,
  patchMarks,
  patchParagraph,
  readFormat,
  sampleRichText,
  styleChange,
  type FormatContext,
  type MarksChange,
  type ParagraphChange,
  type TextFormat,
  type TextSample,
} from './format';
import { normalizeRichText, sameValue } from './richTextDoc';

/*
 * Formatting text, whichever of the two targets it is (ADR-013):
 * - `editor`: the text editor is open on the element. A change goes to the editor's selection, and
 *   the editor writes the result to the model as it writes typing, as an undo step of its own.
 * - `element`: a text box or a shape is selected and not being edited. A change goes to all of
 *   its text, as one `text.set`.
 * - `cells`: cells of a table are selected and none is being edited (WG6). A change goes to all
 *   the text of each of them, as one `element.update`. A cell that is being edited is an `editor`
 *   target like any other text.
 */

interface TargetBase {
  bus: CommandBus;
  slideId: string;
}

export type TextTarget =
  | (TargetBase & {
      kind: 'editor';
      view: EditorView;
      element: TextElement | ShapeElement | TableElement;
    })
  | (TargetBase & { kind: 'element'; element: TextElement | ShapeElement })
  | (TargetBase & { kind: 'cells'; element: TableElement; cells: readonly CellRef[] });

/** One undo step. Changes that share a `txId` are one step (a drag in the colour picker). */
export type Step = StepMeta;

const NO_TEXT: RichText = { paragraphs: [] };

/** The texts of the cells of a `cells` target, in their order. */
function cellContents(target: TextTarget & { kind: 'cells' }): RichText[] {
  return target.cells.flatMap(({ row, col }) => {
    const cell = target.element.cells[row]?.[col];
    return cell ? [cell.content] : [];
  });
}

/** The text a target's formatting is read from. */
export function sampleTarget(target: TextTarget): TextSample {
  if (target.kind === 'editor') return sampleState(target.view.state);
  if (target.kind === 'element') return sampleRichText(target.element.content ?? NO_TEXT);
  const samples = cellContents(target).map(sampleRichText);
  return {
    paragraphs: samples.flatMap((sample) => sample.paragraphs),
    spans: samples.flatMap((sample) => sample.spans),
  };
}

const formats = new WeakMap<object, { ctx: FormatContext; format: TextFormat }>();

/** The current formatting of a target. Cached by the text it was read from, which is immutable. */
export function formatOf(target: TextTarget, ctx: FormatContext): TextFormat {
  // Several cells have no one object to cache by; reading them again is cheap.
  if (target.kind === 'cells') return readFormat(sampleTarget(target), ctx);
  const key: object =
    target.kind === 'editor' ? target.view.state : (target.element.content ?? NO_TEXT);
  const cached = formats.get(key);
  if (cached && cached.ctx.theme === ctx.theme && cached.ctx.dir === ctx.dir) return cached.format;
  const format = readFormat(sampleTarget(target), ctx);
  formats.set(key, { ctx, format });
  return format;
}

/**
 * A text box that grows with its text (`autoFit: growHeight`) is drawn as tall as its content. This
 * writes that height to the frame, in the undo step of the change that caused it, so the handles
 * and snapping work against the real box. The groups around the box are refitted with it, as the
 * Stage refits them after its own gestures (ADR-016). The box is measured once it has been drawn,
 * and again when a font the change asked for has loaded.
 */
export function syncGrowHeight(
  bus: CommandBus,
  elementId: string,
  txId: string,
  box: () => HTMLElement | null = () => stageElement(elementId),
): void {
  const measure = () => {
    const found = findElementInDeck(bus.deck, elementId);
    const dom = box();
    if (!found || !dom || found.element.type !== 'text' || found.element.autoFit !== 'growHeight')
      return;
    const h = Math.round(dom.offsetHeight);
    const { frame } = found.element;
    if (h <= 0 || Math.abs(h - frame.h) < 1) return;
    const path = indexElements(found.slide.elements).get(elementId)?.path ?? [];
    const patches = refitPatches(path, new Map([[elementId, { frame: { ...frame, h } }]]));
    bus.batch(
      [...patches].map(([id, patch]) => updateElement(found.slide.id, id, patch as ElementPatch)),
      { txId },
    );
  };
  requestAnimationFrame(() => {
    measure();
    if (document.fonts.status === 'loading') void document.fonts.ready.then(measure);
  });
}

function setText(target: TextTarget & { kind: 'element' }, content: RichText, step: Step): void {
  const { bus, slideId, element } = target;
  if (sameValue(content, normalizeRichText(element.content ?? NO_TEXT))) return;
  const txId = step.txId ?? newId('tx');
  bus.dispatch(
    { type: 'text.set', slideId, elementId: element.id, content },
    { txId, label: step.label ?? 'Format' },
  );
  syncGrowHeight(bus, element.id, txId);
}

/** Changes the text of every cell of a `cells` target, as one change to the table. */
function setCells(
  target: TextTarget & { kind: 'cells' },
  map: (content: RichText) => RichText,
  step: Step,
): void {
  const { bus, slideId, element } = target;
  const picked = new Set(target.cells.map(({ row, col }) => `${row},${col}`));
  let changed = false;
  const cells = element.cells.map((row, r) =>
    row.map((cell, c) => {
      if (!picked.has(`${r},${c}`)) return cell;
      const content = map(cell.content);
      if (sameValue(content, normalizeRichText(cell.content))) return cell;
      changed = true;
      return { ...cell, content };
    }),
  );
  if (!changed) return;
  const txId = step.txId ?? newId('tx');
  bus.dispatch(updateElement(slideId, element.id, { cells }), {
    txId,
    label: step.label ?? 'Format',
  });
  cellsWritten(bus, element.id, txId);
}

/** A change to the marks of a text, to its paragraphs, or to both at once. */
export interface TextChange {
  marks?: MarksChange;
  paragraphs?: ParagraphChange;
  /**
   * In the editor: the stretch of text the change goes to, in place of the selection. A text
   * style changes the marks of whole paragraphs, and a link is edited as a whole.
   */
  range?: TextRange;
}

/**
 * Makes a change, as one undo step: to the editor's selection (marks to the text it covers,
 * paragraph fields to the paragraphs it touches), or to all the text of the element or the cells.
 */
export function changeText(target: TextTarget, change: TextChange, step: Step = {}): void {
  if (target.kind === 'editor') {
    const { view } = target;
    const { state } = view;
    // Neither kind of change moves text, so both are written against the same positions.
    const tr = state.tr;
    if (change.marks) changeMarksTr(state, change.marks, change.range, tr);
    if (change.paragraphs) changeParagraphsTr(state, change.paragraphs, change.range, tr);
    view.dispatch(tr.setMeta(STEP_META, step));
    return;
  }
  const map = (content: RichText) => {
    const marked = change.marks ? mapMarks(content, change.marks) : content;
    return change.paragraphs ? mapParagraphs(marked, change.paragraphs) : marked;
  };
  if (target.kind === 'cells') setCells(target, map, step);
  else setText(target, map(target.element.content ?? NO_TEXT), step);
}

/** Makes a marks change: to the editor's selection, or to all the text of the element. */
export function changeMarks(target: TextTarget, change: MarksChange, step?: Step): void {
  changeText(target, { marks: change }, step);
}

/** Makes a paragraph change: to the paragraphs the selection touches, or to all of them. */
export function changeParagraphs(target: TextTarget, change: ParagraphChange, step?: Step): void {
  changeText(target, { paragraphs: change }, step);
}

/** Clear formatting (TXT-10): the character marks go, links and paragraph fields stay. */
export function clearFormatting(target: TextTarget, step?: Step): void {
  changeMarks(target, clearMarks, step);
}

/**
 * What a link would be put on, in the editor (TXT-09): the selection; or with a caret the whole
 * link it is in, or else the word it is in. Null when the caret is at neither: nothing to link.
 */
export function linkTarget(state: EditorState): (TextRange & { link?: string }) | null {
  const { from, to, empty } = state.selection;
  return empty ? (linkAt(state) ?? wordRange(state)) : { from, to };
}

/**
 * Links the text, or with `null` unlinks it, as one undo step: the editor's selection (see
 * `linkTarget`), or all the text of the element. False when the caret has nothing to link.
 */
export function setLink(target: TextTarget, link: string | null, step?: Step): boolean {
  const range = target.kind === 'editor' ? linkTarget(target.view.state) : undefined;
  if (range === null) return false;
  changeText(target, { marks: linkChange(link), range }, step);
  return true;
}

/** In the editor a text style is about whole paragraphs, whatever part of them is selected. */
function wholeParagraphs(target: TextTarget): TextRange | undefined {
  return target.kind === 'editor' ? paragraphsRange(target.view.state) : undefined;
}

/** Gives the paragraphs of the target a text style of the theme, so that the style shows (TXT-08). */
export function applyStyle(target: TextTarget, styleRef: TextStyleRef, step?: Step): void {
  changeText(target, { ...styleChange(styleRef), range: wholeParagraphs(target) }, step);
}

/**
 * "Update the style to match" (TXT-08): writes what the text has into its text style of the
 * theme, and takes from the paragraphs the marks that now only repeat the style. One undo step:
 * the theme and the text change in one transaction. False when there is nothing to update.
 */
export function updateStyle(
  target: TextTarget,
  ctx: FormatContext,
  styleRef: TextStyleRef,
  step: Step = {},
): boolean {
  const match = matchStyle(formatOf(target, ctx), ctx.theme.textStyles[styleRef]);
  if (!match) return false;
  const { bus, element } = target;
  const txId = step.txId ?? newId('tx');
  const label = step.label ?? 'Update style';
  bus.dispatch(
    { type: 'theme.update', patch: { textStyles: { [styleRef]: match.style } } },
    { txId, label },
  );
  changeText(
    target,
    { marks: match.marks, paragraphs: match.paragraphs, range: wholeParagraphs(target) },
    { txId, label },
  );
  // The box is as tall as its text in the style's new size, also when no mark had to go.
  if (target.kind === 'element') syncGrowHeight(bus, element.id, txId);
  return true;
}

/** Bold on if any of the text is not bold, off if all of it is (Ctrl+B). */
export function toggleBold(target: TextTarget, ctx: FormatContext, step?: Step): void {
  changeMarks(target, boldChange(!formatOf(target, ctx).bold, ctx), step);
}

/** Italic, underline or strike: on if any of the text lacks it, off if all of it has it. */
export function toggleMark(
  target: TextTarget,
  ctx: FormatContext,
  mark: 'italic' | 'underline' | 'strike',
  step?: Step,
): void {
  changeMarks(target, patchMarks({ [mark]: formatOf(target, ctx)[mark] ? null : true }), step);
}

/** Turns the text the other way (Ctrl+Shift+X): right to left becomes left to right, and back. */
export function flipDirection(target: TextTarget, ctx: FormatContext, step?: Step): void {
  const dir = flippedDirection(sampleTarget(target), ctx);
  changeParagraphs(target, patchParagraph({ dir }), step);
}

/** The fields of a text box that are about its text; `padding: null` removes the padding. */
export interface BoxPatch {
  autoFit?: TextElement['autoFit'];
  vAlign?: TextElement['vAlign'];
  padding?: Insets | null;
}

/** Changes the text box itself: auto-fit, vertical alignment, padding (WG4-T05). */
export function updateBox(target: TextTarget, patch: BoxPatch, step: Step = {}): void {
  const { bus, slideId, element } = target;
  if (element.type !== 'text') return;
  const txId = step.txId ?? newId('tx');
  bus.dispatch(updateElement(slideId, element.id, patch), {
    txId,
    label: step.label ?? 'Text box',
  });
  syncGrowHeight(bus, element.id, txId);
}
