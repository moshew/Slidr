import type { Deck } from '@slidr/model';
// By file, not through the shell's index: these are plain functions, and the index loads the app.
import { stageElement } from '../shell/stageDom';
import { matchText, paragraphText, type Match } from './search';

/*
 * The matches on the Stage, drawn with the CSS Custom Highlight API: ranges over the text nodes
 * the renderer drew, painted by the `::highlight()` rules of `highlight.css`. Nothing is added to
 * the slide's DOM, so the renderer and the Stage know nothing of it. Where the API is missing the
 * bar works without the marks.
 */

/** Every match on the slide but the current one, softly. */
export const MATCHES = 'slidr-find';
/** The match the bar stands on. */
export const CURRENT = 'slidr-find-current';

const supported = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/** The text nodes of a drawn paragraph, without its list marker, which is not part of its text. */
function textNodes(paragraph: Element): Text[] {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('[data-slidr-marker]')) nodes.push(node as Text);
  }
  return nodes;
}

/** The place of an offset of a paragraph's text among its text nodes. */
function locate(nodes: readonly Text[], offset: number): [Text, number] | undefined {
  let passed = 0;
  for (const node of nodes) {
    if (offset <= passed + node.length) return [node, offset - passed];
    passed += node.length;
  }
  return undefined;
}

/**
 * The range of a match over the text the Stage shows, or undefined when it shows none of it: the
 * match is on another slide, in a hidden element or in the speaker notes. A paragraph (a `<p>` or
 * an `<li>`) is marked only when its drawn text is the model's: a preview of a proposed change, or
 * the text editor with a line break of its own, draws something else.
 */
function rangeOf(deck: Deck, match: Match): Range | undefined {
  if (!match.elementId) return undefined;
  const box = stageElement(match.elementId);
  const holder = match.cell
    ? box?.querySelector(
        `:scope > table > tbody > tr > td[data-row="${match.cell.row}"][data-col="${match.cell.col}"]`,
      )
    : box;
  const drawn = holder?.querySelectorAll('p, li')[match.paragraph];
  const paragraph = matchText(deck, match)?.paragraphs[match.paragraph];
  if (!drawn || !paragraph) return undefined;
  const nodes = textNodes(drawn);
  if (nodes.map((node) => node.data).join('') !== paragraphText(paragraph)) return undefined;
  const start = locate(nodes, match.start);
  const end = locate(nodes, match.end);
  if (!start || !end) return undefined;
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  return range;
}

function paint(name: string, ranges: Range[]): void {
  if (ranges.length) CSS.highlights.set(name, new Highlight(...ranges));
  else CSS.highlights.delete(name);
}

/** Marks the matches of the slide on the Stage, the current one apart. */
export function paintMatches(
  deck: Deck,
  slideId: string | null,
  matches: readonly Match[],
  current: Match | undefined,
): void {
  if (!supported()) return;
  const soft: Range[] = [];
  const strong: Range[] = [];
  for (const match of matches) {
    if (match.slideId !== slideId) continue;
    const range = rangeOf(deck, match);
    if (range) (match === current ? strong : soft).push(range);
  }
  paint(MATCHES, soft);
  paint(CURRENT, strong);
}

export function clearMatches(): void {
  if (!supported()) return;
  CSS.highlights.delete(MATCHES);
  CSS.highlights.delete(CURRENT);
}
