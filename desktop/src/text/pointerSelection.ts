import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

interface PointerPoint {
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface OpeningSelection {
  elementId: string;
  attach(view: EditorView): () => void;
  cancel(): void;
}

let pending: OpeningSelection | null = null;

/**
 * The press that opens editing landed on rendered text, before the editor existed. Keep its
 * pointer movement until the editor can extend the selection from that press. Once it is open,
 * later presses use the editor's normal browser selection.
 */
export function beginPointerSelection(elementId: string, pointer: PointerPoint): void {
  pending?.cancel();
  const start = { left: pointer.clientX, top: pointer.clientY };
  let point = start;
  let view: EditorView | undefined;
  let anchor = 0;
  let moved = false;
  let ended = false;
  let closed = false;

  const apply = () => {
    if (!view || !moved || closed) return;
    if (view.isDestroyed || !view.dom.isConnected) return cancel();
    const bounds = view.dom.getBoundingClientRect();
    // A drag beyond the text keeps selecting to its nearest edge, rather than moving the box.
    const head = view.posAtCoords({
      left: Math.max(bounds.left, Math.min(point.left, bounds.right - 1)),
      top: Math.max(bounds.top, Math.min(point.top, bounds.bottom - 1)),
    });
    if (!head) return;
    const { doc, selection, tr } = view.state;
    const from = doc.resolve(Math.min(anchor, doc.content.size));
    const to = doc.resolve(head.pos);
    const next = TextSelection.between(from, to);
    if (!selection.eq(next)) view.dispatch(tr.setSelection(next).setMeta('pointer', true));
    view.focus();
  };

  const track = (event: PointerEvent) => {
    point = { left: event.clientX, top: event.clientY };
    moved ||= point.left !== start.left || point.top !== start.top;
    apply();
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId === pointer.pointerId) track(event);
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointer.pointerId) return;
    track(event);
    ended = true;
    stopTracking();
    // A quick drag may finish before mounting. Its final range is applied when the editor attaches.
    if (view) cancel();
  };
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === pointer.pointerId) cancel();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
  };
  const stopTracking = () => {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onCancel, true);
  };
  const cancel = () => {
    if (closed) return;
    closed = true;
    stopTracking();
    document.removeEventListener('pointerdown', cancel, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', cancel);
    if (pending === opening) pending = null;
  };
  const opening: OpeningSelection = {
    elementId,
    cancel,
    attach(editorView) {
      if (closed) return cancel;
      view = editorView;
      // TextEditor has already placed the caret at the original press, using the browser's layout.
      anchor = view.state.selection.anchor;
      apply();
      if (ended) cancel();
      return cancel;
    },
  };
  pending = opening;
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onCancel, true);
  document.addEventListener('pointerdown', cancel, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', cancel);
}

/** Takes over the opening drag once this element's editor has mounted. Returns its cleanup. */
export function attachPointerSelection(elementId: string, view: EditorView): () => void {
  return pending?.elementId === elementId ? pending.attach(view) : () => {};
}
