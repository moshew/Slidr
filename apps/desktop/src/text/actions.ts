import {
  findElementInDeck,
  newId,
  updateElement,
  type CommandBus,
  type Insets,
  type RichText,
  type ShapeElement,
  type TextElement,
} from '@slidr/model';
import type { EditorView } from '@tiptap/pm/view';
import {
  changeMarksTr,
  changeParagraphsTr,
  sampleState,
  STEP_META,
  type StepMeta,
} from './editorFormat';
import {
  boldChange,
  flippedDirection,
  mapMarks,
  mapParagraphs,
  patchMarks,
  patchParagraph,
  readFormat,
  sampleRichText,
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
 */

interface TargetBase {
  bus: CommandBus;
  slideId: string;
  element: TextElement | ShapeElement;
}

export type TextTarget =
  (TargetBase & { kind: 'editor'; view: EditorView }) | (TargetBase & { kind: 'element' });

/** One undo step. Changes that share a `txId` are one step (a drag in the colour picker). */
export type Step = StepMeta;

const NO_TEXT: RichText = { paragraphs: [] };

/** The text a target's formatting is read from. */
export function sampleTarget(target: TextTarget): TextSample {
  return target.kind === 'editor'
    ? sampleState(target.view.state)
    : sampleRichText(target.element.content ?? NO_TEXT);
}

const formats = new WeakMap<object, { ctx: FormatContext; format: TextFormat }>();

/** The current formatting of a target. Cached by the text it was read from, which is immutable. */
export function formatOf(target: TextTarget, ctx: FormatContext): TextFormat {
  const key: object =
    target.kind === 'editor' ? target.view.state : (target.element.content ?? NO_TEXT);
  const cached = formats.get(key);
  if (cached && cached.ctx.theme === ctx.theme && cached.ctx.dir === ctx.dir) return cached.format;
  const format = readFormat(sampleTarget(target), ctx);
  formats.set(key, { ctx, format });
  return format;
}

/** The rendered box of an element on the Stage. */
function stageBox(elementId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="stage-surface"] [data-element-id="${CSS.escape(elementId)}"]`,
  );
}

/**
 * A text box that grows with its text (`autoFit: growHeight`) is drawn as tall as its content. This
 * writes that height to the frame, in the undo step of the change that caused it, so the handles
 * and snapping work against the real box. The box is measured once it has been drawn, and again
 * when a font the change asked for has loaded.
 */
export function syncGrowHeight(
  bus: CommandBus,
  elementId: string,
  txId: string,
  box: () => HTMLElement | null = () => stageBox(elementId),
): void {
  const measure = () => {
    const found = findElementInDeck(bus.deck, elementId);
    const dom = box();
    if (!found || !dom || found.element.type !== 'text' || found.element.autoFit !== 'growHeight')
      return;
    const h = Math.round(dom.offsetHeight);
    const { frame } = found.element;
    if (h <= 0 || Math.abs(h - frame.h) < 1) return;
    bus.dispatch(updateElement(found.slide.id, elementId, { frame: { ...frame, h } }), { txId });
  };
  requestAnimationFrame(() => {
    measure();
    if (document.fonts.status === 'loading') void document.fonts.ready.then(measure);
  });
}

function setText(target: TextTarget, content: RichText, step: Step): void {
  const { bus, slideId, element } = target;
  if (sameValue(content, normalizeRichText(element.content ?? NO_TEXT))) return;
  const txId = step.txId ?? newId('tx');
  bus.dispatch(
    { type: 'text.set', slideId, elementId: element.id, content },
    { txId, label: step.label ?? 'Format' },
  );
  syncGrowHeight(bus, element.id, txId);
}

/** Makes a marks change: to the editor's selection, or to all the text of the element. */
export function changeMarks(target: TextTarget, change: MarksChange, step: Step = {}): void {
  if (target.kind === 'editor') {
    const { view } = target;
    view.dispatch(changeMarksTr(view.state, change).setMeta(STEP_META, step));
  } else {
    setText(target, mapMarks(target.element.content ?? NO_TEXT, change), step);
  }
}

/** Makes a paragraph change: to the paragraphs the selection touches, or to all of them. */
export function changeParagraphs(
  target: TextTarget,
  change: ParagraphChange,
  step: Step = {},
): void {
  if (target.kind === 'editor') {
    const { view } = target;
    view.dispatch(changeParagraphsTr(view.state, change).setMeta(STEP_META, step));
  } else {
    setText(target, mapParagraphs(target.element.content ?? NO_TEXT, change), step);
  }
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
