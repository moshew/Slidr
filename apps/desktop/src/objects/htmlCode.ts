import {
  newId,
  updateElement,
  type CommandBus,
  type ElementPatch,
  type HtmlElement,
} from '@slidr/model';

/*
 * What the code editor of an `html` element writes (HTM-04). The element has two texts: its
 * markup, and a stylesheet of its own. As in a text box (ADR-006), what is typed goes to the
 * model at once, so the slide on the Stage is the live preview; a burst of typing is one undo
 * step, and undo is the deck's.
 */

/** The two texts of an `html` element that the code editor shows. */
export type CodePart = 'markup' | 'styles';

/**
 * Whether markup carries a script. Such an element runs in a sandboxed frame instead of the
 * slide's own document (RND-06), so the flag has to follow what the markup says: a script typed
 * into an element that does not run scripts would be cleaned away and never run.
 */
export function markupHasScripts(markup: string): boolean {
  if (!/<script[\s>/]/i.test(markup)) return false;
  return new DOMParser().parseFromString(markup, 'text/html').querySelector('script') !== null;
}

/** The change that writes one of the element's texts. An empty stylesheet is no stylesheet. */
export function codePatch(element: HtmlElement, part: CodePart, text: string): ElementPatch {
  if (part === 'styles') return { styles: text.trim() === '' ? null : text };
  const hasScripts = markupHasScripts(text);
  return { markup: text, ...(hasScripts !== element.hasScripts ? { hasScripts } : {}) };
}

/** What a part of the element holds now, as the editor shows it. */
export function codeOf(element: HtmlElement, part: CodePart): string {
  return part === 'markup' ? element.markup : (element.styles ?? '');
}

/** A pause in typing longer than this starts a new undo step, as in a text box. */
const BURST_MS = 650;
/** What is typed is written after this long without a key, so a fast typist renders once. */
const WRITE_MS = 180;

export interface CodeWriter {
  /** The editor's text changed: it is written shortly, or at once by `flush`. */
  type: (text: string) => void;
  /** Writes what is waiting. Called before an undo, and when the editor goes away. */
  flush: () => void;
  /**
   * The deck now holds `text`. True when this writer wrote it: that is not news to the editor.
   * Any other text came from elsewhere (an undo, the agent), and what was typed over the text
   * it replaced is dropped rather than written over it.
   */
  own: (text: string) => boolean;
  /** Undo and redo are the deck's (ADR-006), also for what was typed here. */
  undo: () => void;
  redo: () => void;
}

/**
 * Writes what is typed in the code editor of one part of one element. `element` gives the
 * element as it is in the deck now, or undefined once it is gone.
 */
export function createCodeWriter(options: {
  bus: CommandBus;
  slideId: string;
  elementId: string;
  part: CodePart;
  element: () => HtmlElement | undefined;
  label: string;
}): CodeWriter {
  const { bus, slideId, elementId, part, label } = options;
  let waiting: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let burst: { txId: string; at: number } | null = null;
  let written: string | undefined;

  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const text = waiting;
    waiting = undefined;
    const element = options.element();
    if (text === undefined || !element || codeOf(element, part) === text) return;
    const now = performance.now();
    if (!burst || now - burst.at > BURST_MS) burst = { txId: newId('tx'), at: now };
    burst.at = now;
    written = text;
    bus.dispatch(updateElement(slideId, elementId, codePatch(element, part, text)), {
      txId: burst.txId,
      label,
    });
  };

  return {
    type(text) {
      waiting = text;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_MS);
    },
    flush,
    own(text) {
      if (text === written) return true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      waiting = undefined;
      return false;
    },
    // After either, the deck's text is news to the editor, even when it is what was typed.
    undo() {
      flush();
      burst = null;
      written = undefined;
      bus.undo();
    },
    redo() {
      flush();
      burst = null;
      written = undefined;
      bus.redo();
    },
  };
}
