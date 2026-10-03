import { newId, updateElement, type CommandBus } from '@slidr/model';
import type { HtmlEditing } from '@slidr/renderer';
import { copyText, elementCount, fragmentMarkup, keepsStructure } from './htmlText';

/*
 * Editing the text inside an `html` element in place (HTM-03, IMP-13). A double-click on such an
 * element makes the text of its content editable where it stands: the content is the renderer's
 * own, in its shadow root, so nothing moves and every style of the element still applies. What
 * can change is text only: characters inside a text node, and text typed where there was none.
 * The elements of the markup stay as they are (`keepsStructure`); a change that would take one
 * away or split one is not made.
 *
 * As in a text box (ADR-006), every change is written to the model at once, a burst of typing is
 * one undo step, and Ctrl+Z is the deck's.
 *
 * An element with scripts runs in a sandboxed frame the editor cannot reach into: its text is
 * edited through the agent or the code editor (HTM-02, HTM-04), not here.
 */

export interface HtmlTextEditingOptions {
  bus: CommandBus;
  slideId: string;
  elementId: string;
  /** Where the user double-clicked, to put the caret there. Without it: the end of the first text. */
  caretAt?: { x: number; y: number };
  /** Esc: leave editing. */
  onExit: () => void;
}

/** A pause in typing longer than this starts a new undo step, as in a text box. */
const BURST_MS = 650;

/** What is not text to edit, among the top-level elements of the content. */
const NOT_TEXT = 'style, script, link, svg, img, video, audio, canvas, iframe';

/**
 * Makes the top-level elements of the content editable as plain text, through a stylesheet of
 * the shadow root: no attribute is written on the content, and `contenteditable` would also
 * change how its long words wrap. The focus ring of an editable element is not part of the slide.
 */
const EDITABLE_CSS = `:host > :not(${NOT_TEXT}) { -webkit-user-modify: read-write-plaintext-only; outline: none; cursor: text; }`;

type CaretPoint = { offsetNode: Node; offset: number } | null;

/** The place in the text under a point of the window, inside a shadow root (Chromium 128+). */
function caretFromPoint(root: ShadowRoot, x: number, y: number): CaretPoint {
  const doc = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
      options?: { shadowRoots: ShadowRoot[] },
    ) => CaretPoint;
  };
  return doc.caretPositionFromPoint?.(x, y, { shadowRoots: [root] }) ?? null;
}

/** The first top-level element of the content that holds text to edit. */
function firstEditable(root: ShadowRoot): HTMLElement | undefined {
  return Array.from(root.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.matches(NOT_TEXT) && child.textContent?.trim() !== '',
  );
}

/** The top-level element of the content a node is in. */
function topLevel(root: ShadowRoot, node: Node | null): HTMLElement | undefined {
  let at = node;
  while (at && at.parentNode !== root) at = at.parentNode;
  return at instanceof HTMLElement ? at : undefined;
}

/**
 * The editing of one `html` element's text: give it to `SlideRenderer` as the element's
 * `htmlSlot` for as long as the element is being edited.
 */
export function createHtmlTextEditing(options: HtmlTextEditingOptions): HtmlEditing {
  const { bus, slideId, elementId, onExit } = options;
  /** The markup written last: the content shows exactly it. */
  let written: string | undefined;
  let burst: { txId: string; at: number } | null = null;
  let caretAt = options.caretAt;

  return {
    shows: (markup) => markup === written,

    attach(root, source, sourceOf, rebuild) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(EDITABLE_CSS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      /** The elements of the content: an edit of text leaves their number as it is. */
      const elements = elementCount(root);
      // What the renderer puts in the root besides the markup: the element's stylesheet.
      const own = (node: Node) => node.parentNode === root && !sourceOf(node);
      /** The selection, with the nodes of the shadow tree it is in (Chromium). */
      const selection = () =>
        (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ??
        root.ownerDocument.getSelection();

      /** Reads the text back into the markup and writes it; a burst of typing is one undo step. */
      const write = () => {
        if (elementCount(root) !== elements || !copyText(root, source, sourceOf, own)) {
          // The edit took an element away or added one: it is not kept. The content is built
          // again from the markup of the model, which never saw it.
          rebuild();
          return;
        }
        const markup = fragmentMarkup(source);
        if (markup === written) return;
        const now = performance.now();
        if (!burst || now - burst.at > BURST_MS) burst = { txId: newId('tx'), at: now };
        burst.at = now;
        written = markup;
        bus.dispatch(updateElement(slideId, elementId, { markup }), {
          txId: burst.txId,
          label: 'Typing',
        });
      };

      const onBeforeInput = (event: InputEvent) => {
        const caret = selection();
        if (!caret || !keepsStructure(event.inputType, caret)) event.preventDefault();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        // The keys typed here are text: the Stage and the app's shortcuts do not hear them.
        event.stopPropagation();
        const mod = event.ctrlKey || event.metaKey;
        if (event.key === 'Escape') {
          event.preventDefault();
          onExit();
        } else if (mod && event.code === 'KeyZ') {
          // Undo is the deck's (ADR-006), also for what was typed here.
          event.preventDefault();
          burst = null;
          if (event.shiftKey) bus.redo();
          else bus.undo();
        } else if (mod && event.code === 'KeyY') {
          event.preventDefault();
          burst = null;
          bus.redo();
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          // A new line would be a new element, and Tab would take the focus away.
          event.preventDefault();
        } else if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
          // A caret move ends the burst.
          burst = null;
        }
      };
      const onPaste = (event: ClipboardEvent) => {
        event.stopPropagation();
        event.preventDefault();
        // Plain text on one line: a line break would be an element.
        const text = event.clipboardData?.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ');
        if (text) root.ownerDocument.execCommand('insertText', false, text);
      };
      const stop = (event: Event) => event.stopPropagation();

      const quiet = ['keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'];
      const mine = ['click', 'dblclick', 'copy', 'cut', 'dragstart', 'drop'];
      root.addEventListener('beforeinput', onBeforeInput as EventListener);
      root.addEventListener('input', write);
      root.addEventListener('keydown', onKeyDown as EventListener);
      root.addEventListener('paste', onPaste as EventListener);
      for (const type of [...quiet, ...mine]) root.addEventListener(type, stop);

      // The caret: where the double-click was, or at the end of the first text.
      const point = caretAt ? caretFromPoint(root, caretAt.x, caretAt.y) : null;
      caretAt = undefined;
      const host = point ? topLevel(root, point.offsetNode) : firstEditable(root);
      if (host) {
        host.focus({ preventScroll: true });
        const caret = selection();
        if (point) caret?.collapse(point.offsetNode, point.offset);
        else {
          caret?.selectAllChildren(host);
          caret?.collapseToEnd();
        }
      }

      return () => {
        root.removeEventListener('beforeinput', onBeforeInput as EventListener);
        root.removeEventListener('input', write);
        root.removeEventListener('keydown', onKeyDown as EventListener);
        root.removeEventListener('paste', onPaste as EventListener);
        for (const type of [...quiet, ...mine]) root.removeEventListener(type, stop);
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((other) => other !== sheet);
        written = undefined;
      };
    },
  };
}
