/**
 * Text as animation targets: the paragraphs of an element, and its words or characters (WG8-T03).
 *
 * Words and characters do not exist in the DOM, so they are wrapped in spans while an animation
 * plays and the original text nodes are put back afterwards.
 *
 * A plain inline span leaves the text exactly where it was, and can be faded and moved. Scaling,
 * rotating and clipping need a box, so for those a part is an inline-block. That has a price in
 * mixed-direction text: the bidi algorithm orders inline-blocks as neutrals, so two English
 * words inside a Hebrew line would swap. Nothing here guesses when that happens. The parts are
 * measured before and after the split, and a paragraph whose parts changed line or order goes
 * back to inline spans.
 */

/** The elements the renderer draws a paragraph as; an export may turn a `p` into a heading. */
const PARAGRAPHS = 'p, li, h1, h2, h3, h4, h5, h6';
const MARKER = '[data-slidr-marker]';

/** The paragraphs of an element that have text, in order. */
export function paragraphsOf(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>(PARAGRAPHS)).filter(
    (p) => (p.textContent ?? '').trim() !== '',
  );
}

function textNodesOf(paragraph: HTMLElement): Text[] {
  const walker = paragraph.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // A list marker is one part, taken whole.
    if (!node.parentElement?.closest(MARKER)) nodes.push(node as Text);
  }
  return nodes;
}

/** Start and end of every run of non-space characters. */
function wordsOf(text: string): [number, number][] {
  return Array.from(text.matchAll(/\S+/g), (m) => [m.index, m.index + m[0].length]);
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined;

/** What a reader counts as characters: a letter keeps its combining marks, such as nikud. */
function charactersOf(word: string): string[] {
  return segmenter ? Array.from(segmenter.segment(word), (s) => s.segment) : Array.from(word);
}

/** How many parts `splitText` makes, without touching the DOM. */
export function countParts(element: HTMLElement, by: 'word' | 'char'): number {
  let count = 0;
  for (const paragraph of paragraphsOf(element)) {
    if (paragraph.querySelector(MARKER)) count++;
    for (const node of textNodesOf(paragraph)) {
      for (const [start, end] of wordsOf(node.data)) {
        count += by === 'word' ? 1 : charactersOf(node.data.slice(start, end)).length;
      }
    }
  }
  return count;
}

export interface Part {
  node: HTMLElement;
  /** False for an inline span: it can be faded and moved, not scaled, rotated or clipped. */
  box: boolean;
}

export interface Split {
  parts: Part[];
  /** Puts the original text nodes back. */
  restore: () => void;
}

interface Place {
  left: number;
  top: number;
  height: number;
}

function place(rect: DOMRect | undefined): Place {
  return { left: rect?.left ?? 0, top: rect?.top ?? 0, height: rect?.height ?? 0 };
}

/** Whether the parts are still on the lines, and in the order, they were measured in. */
export function sameFlow(before: readonly Place[], after: readonly Place[]): boolean {
  for (let i = 0; i < before.length; i++) {
    const b = before[i] as Place;
    const a = after[i];
    if (!a) return false;
    const line = Math.max(b.height, 1);
    if (Math.abs(a.top - b.top) > line / 2 || Math.abs(a.left - b.left) > line) return false;
    const prev = before[i - 1];
    const prevAfter = after[i - 1];
    if (prev && prevAfter && Math.abs(prev.top - b.top) < line / 2) {
      const was = b.left - prev.left;
      const is = a.left - prevAfter.left;
      if (Math.abs(was) > 0.5 && was * is < 0) return false;
    }
  }
  return true;
}

const RIGHT_TO_LEFT = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;
const LATIN = /\p{Script=Latin}/u;

/** The direction of a word's first strong letter: a word of characters lays them out its own way. */
function wordDirection(word: string): string {
  for (const ch of word) {
    if (RIGHT_TO_LEFT.test(ch)) return 'rtl';
    if (LATIN.test(ch)) return 'ltr';
  }
  return '';
}

/** An inline-block would indent its own first line, and does not take its parent's underline. */
const BOX = 'display:inline-block;text-indent:0;text-decoration:inherit';
/** Inline, and offset from its place in the line by `left` and `top`. */
const INLINE = 'position:relative';

/** A span that can be animated by itself: one word, or one character. */
function wrap(doc: Document, part: boolean, box: boolean): HTMLSpanElement {
  const el = doc.createElement('span');
  if (part) el.dataset.slidrPart = '';
  if (box) el.style.cssText = BOX;
  else if (part) el.style.cssText = INLINE;
  return el;
}

/**
 * The run a text node is all of: the `span` or `a` the renderer draws a marked run as. Its
 * highlight and underline are drawn by the run, not by the letters, so each part gets a copy of
 * the run around its own text, and the run's styling comes and goes with the word.
 */
function runOf(node: Text, paragraph: HTMLElement): HTMLElement | undefined {
  const parent = node.parentElement;
  if (!parent || parent === paragraph || parent.parentNode !== paragraph) return undefined;
  return parent.childNodes.length === 1 ? parent : undefined;
}

/**
 * Wraps the words or characters of an element's text, each in a span, and returns them in
 * reading order. Spaces of plain text stay between the words; inside a marked run a space goes
 * with the word before it, so that no piece of highlight or underline stands alone.
 *
 * `boxes` asks for parts that can be transformed; a paragraph that cannot have them without its
 * text moving gets inline parts all the same (`Part.box`).
 */
export function splitText(element: HTMLElement, by: 'word' | 'char', boxes = true): Split {
  const doc = element.ownerDocument;
  const parts: Part[] = [];
  const undo: (() => void)[] = [];
  const range = doc.createRange();

  const measure = (node: Text, start: number, end: number): Place => {
    range.setStart(node, start);
    range.setEnd(node, end);
    return place(range.getBoundingClientRect?.());
  };

  for (const paragraph of paragraphsOf(element)) {
    const marker = paragraph.querySelector<HTMLElement>(MARKER);
    if (marker) parts.push({ node: marker, box: true });
    const made: HTMLElement[] = [];
    const wrappers: HTMLElement[] = [];
    const nodes = textNodesOf(paragraph).filter((node) => node.parentNode);

    // Every part is measured before the first one is wrapped: wrapping may move what follows.
    const before: Place[] = [];
    for (const node of boxes ? nodes : []) {
      for (const [start, end] of wordsOf(node.data)) {
        if (by === 'word') before.push(measure(node, start, end));
        else {
          let offset = start;
          for (const ch of charactersOf(node.data.slice(start, end))) {
            before.push(measure(node, offset, offset + ch.length));
            offset += ch.length;
          }
        }
      }
    }

    for (const node of nodes) {
      const text = node.data;
      const words = wordsOf(text);
      if (!words.length) continue;
      const run = runOf(node, paragraph);
      const fragment = doc.createDocumentFragment();
      /** A part with its text, inside a copy of the run when there is one. */
      const piece = (content: string): HTMLSpanElement => {
        const el = wrap(doc, true, boxes);
        const inner = run ? (run.cloneNode(false) as HTMLElement) : el;
        inner.textContent = content;
        if (run) el.append(inner);
        made.push(el);
        return el;
      };
      words.forEach(([start, end], w) => {
        const word = text.slice(start, end);
        const gapBefore = text.slice(w === 0 ? 0 : (words[w - 1] as [number, number])[1], start);
        // In a run the first word takes the space before it, and every word the space after.
        const lead = run && w === 0 ? gapBefore : '';
        const tail = run ? text.slice(end, words[w + 1]?.[0] ?? text.length) : '';
        if (!run && gapBefore) fragment.append(gapBefore);
        if (by === 'word') {
          fragment.append(piece(lead + word + tail));
          return;
        }
        // The word stays one unbreakable box, with a character box for every character.
        const wrapper = wrap(doc, false, boxes);
        if (boxes) wrapper.style.direction = wordDirection(word);
        const characters = charactersOf(word);
        characters.forEach((ch, c) => {
          const last = c === characters.length - 1;
          wrapper.append(piece((c === 0 ? lead : '') + ch + (last ? tail : '')));
        });
        wrappers.push(wrapper);
        fragment.append(wrapper);
      });
      const lastEnd = (words[words.length - 1] as [number, number])[1];
      if (!run && lastEnd < text.length) fragment.append(text.slice(lastEnd));
      const inserted = Array.from(fragment.childNodes);
      const replaced: ChildNode = run ?? node;
      replaced.parentNode?.replaceChild(fragment, replaced);
      undo.push(() => {
        const first = inserted[0];
        if (first?.parentNode) first.parentNode.insertBefore(replaced, first);
        for (const n of inserted) n.parentNode?.removeChild(n);
      });
    }

    const box =
      boxes &&
      sameFlow(
        before,
        made.map((el) => place(el.getBoundingClientRect())),
      );
    if (boxes && !box) {
      for (const el of wrappers) el.style.cssText = '';
      for (const el of made) el.style.cssText = INLINE;
    }
    for (const node of made) parts.push({ node, box });
  }

  return {
    parts,
    restore: () => {
      for (const step of undo.reverse()) step();
      undo.length = 0;
    },
  };
}
