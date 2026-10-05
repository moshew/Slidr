import { cleanFreeMarkup, FREE_MARKUP_SELECTOR } from '@slidr/renderer';
import { everyElement } from './render';
import type { ExportWarning } from './warnings';

/**
 * The drawn slides as the markup of the exported file, with the one promise the file rests on
 * (SEC-03, SEC-06): what a browser builds from the file is what was drawn here, node for node.
 *
 * The slides were cleaned as trees (`@slidr/renderer`, `sanitize.ts`), and a file is a string.
 * A string is parsed again by whoever opens it, and HTML does not come back the same for every
 * tree: text of a `<style>` can close its own element, a nesting the parser would never build
 * is built differently the second time, a `<template>` becomes a live shadow root. What was
 * inert in the editor would be live markup in the file, outside the sandboxed frame a deck's
 * scripts are kept in, and a file has no content policy to stop it.
 *
 * So nothing here trusts a list of known cases. The markup is parsed the way the file will be,
 * and compared with the tree it was written from:
 *
 * 1. Text of a `<style>` is written so that it cannot end its element.
 * 2. Each place that holds free markup of the deck (`html` without scripts, `svg`) is brought to
 *    a fixed point: if its markup parses into another tree, that other tree, cleaned again, is
 *    what the file holds, and it is checked again. A place that never settles is left empty,
 *    with a warning.
 * 3. The whole of the slides is then checked once more. A difference there is in markup this
 *    code itself made, which should not happen; the export fails rather than write it.
 */
export interface WrittenSlides {
  markup: string;
  warnings: ExportWarning[];
}

type Readable = HTMLElement & { getHTML(options: { serializableShadowRoots: boolean }): string };
type Reader = (html: string) => Document;

/** Parses a whole document the way a browser reads a file, declarative shadow roots included. */
function fileReader(): Reader | undefined {
  const reading = Document as typeof Document & { parseHTMLUnsafe?(html: string): Document };
  return typeof reading.parseHTMLUnsafe === 'function'
    ? (html) =>
        reading.parseHTMLUnsafe?.(html) ?? new DOMParser().parseFromString(html, 'text/html')
    : undefined;
}

const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

/** What a parser replaces or drops in the text it reads. */
const UNREADABLE = new RegExp(`[${String.fromCodePoint(0)}${String.fromCodePoint(0xfffd)}]`, 'g');

/** Text as the reader of a file gets it: one kind of line break, no character it would replace. */
const asRead = (text: string) => text.replace(/\r\n?/g, '\n').replace(UNREADABLE, '');

const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;

interface Item {
  node: Node;
  /** Set for a run of text nodes, which a parser reads as one. */
  text?: string;
}

/** The children of a node as a parser would have made them: text in one piece, none empty. */
function items(parent: Node): Item[] {
  const found: Item[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== TEXT && node.nodeType !== CDATA) {
      found.push({ node });
      continue;
    }
    const text = asRead(node.nodeValue ?? '');
    const last = found[found.length - 1];
    if (last?.text !== undefined) last.text += text;
    else found.push({ node, text });
  }
  return found.filter((item) => item.text !== '');
}

function sameAttributes(a: Element, b: Element): boolean {
  if (a.attributes.length !== b.attributes.length) return false;
  // By the name as it is written, which is what the file says; case is the parser's to choose.
  const read = (el: Element) =>
    new Map(Array.from(el.attributes, (attr) => [attr.name.toLowerCase(), asRead(attr.value)]));
  const theirs = read(b);
  for (const [name, value] of read(a)) if (theirs.get(name) !== value) return false;
  return true;
}

/** The shadow root of an element that a serialisation writes out. */
const written = (el: Element, shadows: boolean): ShadowRoot | null =>
  shadows && el.shadowRoot?.serializable ? el.shadowRoot : null;

/**
 * The first node of the drawn tree at which the tree read back from its markup is another one;
 * undefined when the two are the same.
 */
function difference(drawn: Node, read: Node, shadows: boolean): Node | undefined {
  if (drawn.nodeType !== read.nodeType) return drawn;
  if (drawn.nodeType !== ELEMENT) return drawn.nodeValue === read.nodeValue ? undefined : drawn;
  const a = drawn as Element;
  const b = read as Element;
  if (
    a.namespaceURI !== b.namespaceURI ||
    a.localName.toLowerCase() !== b.localName.toLowerCase() ||
    !sameAttributes(a, b)
  ) {
    return drawn;
  }
  const inA = written(a, shadows);
  const inB = shadows ? b.shadowRoot : null;
  if (Boolean(inA) !== Boolean(inB)) return drawn;
  if (inA && inB) {
    const inside = childDifference(inA, inB, shadows);
    if (inside) return inside;
  }
  if (a instanceof HTMLTemplateElement && b instanceof HTMLTemplateElement) {
    const inside = childDifference(a.content, b.content, shadows);
    if (inside) return inside;
  }
  return childDifference(drawn, read, shadows);
}

function childDifference(drawn: Node, read: Node, shadows: boolean): Node | undefined {
  const a = items(drawn);
  const b = items(read);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    // The file holds more here than was drawn.
    if (!x) return drawn;
    if (!y) return x.node;
    if (x.text !== undefined || y.text !== undefined) {
      if (x.text !== y.text) return x.node;
      continue;
    }
    const inside = difference(x.node, y.node, shadows);
    if (inside) return inside;
  }
  return undefined;
}

/**
 * Text of a `<style>` is written into a file as it is, so text that holds the closing tag ends
 * the element there, and the rest is read as markup. With the slash escaped it is the same CSS
 * (`<\/style` in a string is `</style`), and it is not the tag.
 */
function holdStyleText(host: HTMLElement): void {
  for (const element of everyElement(host)) {
    if (!(element instanceof HTMLStyleElement)) continue;
    const css = element.textContent ?? '';
    if (/<\/style/i.test(css)) element.textContent = css.replace(/<\/(?=style)/gi, '<\\/');
  }
}

/** The most times a place is given the tree its own markup parses into. */
const ROUNDS = 6;

/**
 * Brings one place of free markup to markup that parses into the tree it was written from, as
 * the file will hold it: the content of a declarative shadow root. False when it never gets
 * there; the place is then empty.
 */
function settle(place: Element, read: Reader): boolean {
  const content = place.shadowRoot;
  if (!content) return true;
  const kind = place.hasAttribute('data-slidr-svg')
    ? 'data-slidr-svg=""'
    : 'data-slidr-html="shadow"';
  for (let round = 0; round < ROUNDS; round++) {
    const inside = content.getHTML({ serializableShadowRoots: true });
    const body = read(
      page(`<div ${kind}><template shadowrootmode="open">${inside}</template></div>`),
    ).body;
    const twin = body.firstElementChild;
    const theirs = twin?.shadowRoot;
    if (twin && theirs && body.childNodes.length === 1 && !childDifference(content, theirs, true)) {
      return true;
    }
    // What the file would hold instead, cleaned while it is still in a document where nothing
    // runs. Whatever got out of the place on the way is not part of it.
    if (twin) cleanFreeMarkup(twin);
    content.replaceChildren(...Array.from(twin?.shadowRoot?.childNodes ?? []));
  }
  content.replaceChildren();
  return false;
}

/** The element of the slide a node belongs to, through the shadow roots it may be in. */
function elementOf(node: Node): Element | undefined {
  for (
    let at: Node | null = node;
    at;
    at = at.parentNode ?? (at as Partial<ShadowRoot>).host ?? null
  ) {
    if (at instanceof Element && at.matches('[data-element-id], [data-decoration-id]')) return at;
  }
  return undefined;
}

const nameOf = (element: Element | undefined): string | undefined =>
  element?.getAttribute('data-name') ??
  element?.getAttribute('data-element-id') ??
  element?.getAttribute('data-decoration-id') ??
  undefined;

/**
 * The markup of the drawn slides (`host` holds one `<section>` per slide), checked against what
 * it parses into. Changes `host`, which is the export's own off-screen copy of the slides.
 */
export function writeSlides(host: HTMLElement): WrittenSlides {
  const warnings: ExportWarning[] = [];
  holdStyleText(host);
  const read = fileReader();
  const readable = typeof (host as Partial<Readable>).getHTML === 'function';
  let markup: string;
  if (read && readable) {
    for (const place of Array.from(everyElement(host))) {
      if (!place.matches(FREE_MARKUP_SELECTOR) || settle(place, read)) continue;
      const subject = nameOf(elementOf(place));
      warnings.push({
        code: 'markup-unstable',
        ...(subject ? { subject } : {}),
        message: `Element ${subject ?? ''} could not be written as it is drawn: it is empty in the file`,
      });
    }
    markup = (host as Readable).getHTML({ serializableShadowRoots: true });
  } else {
    markup = host.innerHTML;
    warnings.push({
      code: 'shadow-roots',
      message: 'This browser cannot write shadow roots: HTML elements lost their content',
    });
  }
  // Read as the file holds it: inside the stage, in the body of a document.
  const body = (read ?? ((html) => new DOMParser().parseFromString(html, 'text/html')))(
    page(`<div>${markup}</div>`),
  ).body;
  const stage = body.firstElementChild;
  const differs =
    stage && body.childNodes.length === 1
      ? childDifference(host, stage, Boolean(read && readable))
      : host;
  if (differs) {
    const subject = nameOf(elementOf(differs));
    throw new Error(
      `The slides cannot be written to a file as they are drawn${subject ? ` (${subject})` : ''}`,
    );
  }
  return { markup, warnings };
}
