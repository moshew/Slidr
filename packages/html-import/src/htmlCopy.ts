/**
 * A rendered subtree as the `markup` and `styles` of an `html` element (SPEC 5.9): what a
 * region falls back to when it cannot become regular elements. Two ways to make the copy:
 *
 * - `markup`: the original markup, inside empty shells of its ancestors, with the style rules
 *   of the document that can match in it. It stays readable and editable, keeps following the
 *   theme variables, and is small. It needs the subtree to mean the same outside its document.
 * - `computed`: every node rebuilt with its computed style written inline. It depends on
 *   nothing, at the price of large markup that no longer follows anything.
 *
 * The fidelity guard tries the first and falls back to the second (ADR-017).
 */
import { px } from './css';
import { composedChildNodes, composedParent, isElement, isSvg, isText, styleOf } from './measure';

export type CopyStrategy = 'markup' | 'computed';

export interface CopyRequest {
  /** False: the element's own box and pseudo-elements, without its children. */
  deep: boolean;
  /** Screen px per CSS px of the element's parent. */
  parentScale: number;
  /**
   * The source is a document of its own, not one the engine built to stand in for a slide:
   * nothing of the slide (theme variables, body text style) is assumed to reach the copy.
   */
  foreign: boolean;
  /** Stores an image and returns its asset id; undefined when it cannot be read. */
  storeImage(url: string): Promise<string | undefined>;
}

export interface HtmlCopy {
  markup: string;
  styles?: string;
  /** The size the markup lays out at, in CSS px of the element's parent. */
  natural: { w: number; h: number };
  /** What the copy could not carry over. */
  lossy: string[];
}

/** Marks what the engine itself put into a sandbox document, so that copies leave it out. */
export const BASE_STYLE_ATTRIBUTE = 'data-slidr-base';
/** An inline background the engine wrote to show a `data-asset`; the renderer writes its own. */
export const RESOLVED_BACKGROUND_ATTRIBUTE = 'data-slidr-resolved';
/** An empty picture the engine gave an image that waits for its own (`data-image-prompt`). */
export const BLANK_IMAGE_ATTRIBUTE = 'data-slidr-blank';

const DROPPED = 'script, style, link, base, meta, noscript, template';
/** Tags the HTML parser only keeps inside a table; a copy that is parsed again cannot use them. */
const TABLE_PARTS = new Set([
  'caption',
  'col',
  'colgroup',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
]);
/** Stand-ins for the document's root and body, which cannot exist inside another document. */
const ROOT_SHELL = 'slidr-html';
const BODY_SHELL = 'slidr-body';

function shellTag(el: Element): string {
  if (el.localName === 'html') return ROOT_SHELL;
  if (el.localName === 'body') return BODY_SHELL;
  return el.localName;
}

/**
 * Where the element's untransformed box sits inside the box its transform makes it cover, in
 * CSS px of its parent.
 */
function transformInset(el: Element, cs: CSSStyleDeclaration): { x: number; y: number } {
  if (cs.transform === 'none') return { x: 0, y: 0 };
  const html = el as HTMLElement;
  const w = html.offsetWidth ?? px(cs.width);
  const h = html.offsetHeight ?? px(cs.height);
  const matrix = new DOMMatrix(cs.transform);
  const [ox, oy] = cs.transformOrigin.split(' ').map(px) as [number, number];
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ] as const) {
    const p = matrix.transformPoint(new DOMPoint(x - ox, y - oy));
    minX = Math.min(minX, p.x + ox);
    minY = Math.min(minY, p.y + oy);
  }
  return { x: -minX, y: -minY };
}

/** The layout size of an element: `offset*` for boxes, the measured size for SVG. */
function layoutSize(el: Element, scale: number): { w: number; h: number } {
  const html = el as HTMLElement;
  if (typeof html.offsetWidth === 'number' && !isSvg(el)) {
    // `offset*` are whole numbers; the fractional size keeps a copy from wrapping differently.
    const cs = styleOf(el);
    const w = px(cs.width);
    const h = px(cs.height);
    if (cs.boxSizing === 'border-box' && w > 0 && h > 0) return { w, h };
    const extra = (a: string, b: string, c: string, d: string) => px(a) + px(b) + px(c) + px(d);
    if (w > 0 && h > 0) {
      return {
        w: w + extra(cs.paddingLeft, cs.paddingRight, cs.borderLeftWidth, cs.borderRightWidth),
        h: h + extra(cs.paddingTop, cs.paddingBottom, cs.borderTopWidth, cs.borderBottomWidth),
      };
    }
    return { w: html.offsetWidth, h: html.offsetHeight };
  }
  const r = el.getBoundingClientRect();
  return { w: r.width / scale, h: r.height / scale };
}

function naturalSize(el: Element, parentScale: number): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { w: r.width / parentScale, h: r.height / parentScale };
}

function hasShadow(el: Element, deep: boolean): boolean {
  if (el.getRootNode() !== el.ownerDocument) return true;
  if (el.shadowRoot) return true;
  return deep && Array.from(el.querySelectorAll('*')).some((n) => n.shadowRoot);
}

/** Whether the original markup can stand outside its document at all. */
export function markupCopyPossible(el: Element, deep: boolean): boolean {
  if (TABLE_PARTS.has(el.localName) || hasShadow(el, deep)) return false;
  for (let p = composedParent(el); p; p = composedParent(p)) {
    if (TABLE_PARTS.has(p.localName) || p.localName === 'table') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Images inside a copy become assets, referenced with `data-asset` (ADR-009).

async function assetImages(root: Element, source: Element, request: CopyRequest, lossy: string[]) {
  const copies = [root, ...Array.from(root.querySelectorAll('*'))];
  const originals = [source, ...Array.from(source.querySelectorAll('*'))];
  for (let i = 0; i < copies.length; i++) {
    const copy = copies[i]!;
    if (copy.hasAttribute(RESOLVED_BACKGROUND_ATTRIBUTE)) {
      copy.removeAttribute(RESOLVED_BACKGROUND_ATTRIBUTE);
      (copy as HTMLElement).style.removeProperty('background-image');
    }
    if (copy.localName !== 'img') continue;
    if (copy.hasAttribute('data-asset') || copy.hasAttribute(BLANK_IMAGE_ATTRIBUTE)) {
      copy.removeAttribute('src');
      copy.removeAttribute(BLANK_IMAGE_ATTRIBUTE);
      continue;
    }
    const original = originals[i] as HTMLImageElement | undefined;
    const url = original?.currentSrc || original?.src || copy.getAttribute('src') || '';
    if (!url) continue;
    const id = await request.storeImage(url);
    if (id) {
      copy.setAttribute('data-asset', id);
      copy.removeAttribute('src');
      copy.removeAttribute('srcset');
    } else lossy.push(`image ${url.slice(0, 80)} could not be read`);
  }
}

// ---------------------------------------------------------------------------------------------
// The markup copy.

/** `html`, `body` and `:root` in a selector, renamed to the shells that stand in for them. */
export function rewriteSelector(selector: string): string {
  return selector
    .replace(/:root\b/g, ROOT_SHELL)
    .replace(/(?<![\w\-#.:[="'])(html|body)(?![\w-])/g, (_, name: string) =>
      name === 'html' ? ROOT_SHELL : BODY_SHELL,
    );
}

/** A selector without the parts that never match an element at rest. */
function selectorForMatching(selector: string): string {
  return selector
    .replace(
      /::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop)\b/g,
      '',
    )
    .replace(/:(hover|focus|focus-within|focus-visible|active|visited|target)\b/g, '')
    .split(',')
    .map((part) => (part.trim() === '' ? '*' : part))
    .join(',');
}

function canMatch(scope: ParentNode, selector: string): boolean {
  try {
    return scope.querySelector(selectorForMatching(selector)) !== null;
  } catch {
    // A selector this cannot test is kept: a rule too many is harmless, a missing one is not.
    return true;
  }
}

function absoluteUrls(css: string, base: string): string {
  return css.replace(/url\((["']?)(.*?)\1\)/g, (whole, _quote: string, url: string) => {
    if (/^(data:|blob:|#|https?:|[a-z][a-z0-9+.-]*:)/i.test(url)) return whole;
    try {
      return `url("${new URL(url, base).href}")`;
    } catch {
      return whole;
    }
  });
}

/** The rule's type by name: rule classes of another document are not this window's classes. */
function ruleKind(rule: CSSRule): string {
  return rule.constructor.name;
}

/**
 * The rules of the document that can match inside `scope`, as stylesheet text. Grouping rules
 * (`@media`, `@supports`, `@layer`) keep their condition around what is left of them.
 * `@font-face` is left out (fonts are assets of the deck), `@import` is followed where the
 * sheet can be read.
 */
function collectRules(rules: CSSRuleList, scope: ParentNode, base: string, out: string[]): void {
  for (const rule of Array.from(rules)) {
    const kind = ruleKind(rule);
    if (kind === 'CSSStyleRule') {
      const style = rule as CSSStyleRule;
      const selector = rewriteSelector(style.selectorText);
      if (!canMatch(scope, selector)) continue;
      out.push(absoluteUrls(selector + style.cssText.slice(style.selectorText.length), base));
    } else if (kind === 'CSSFontFaceRule') {
      continue;
    } else if (kind === 'CSSImportRule') {
      const sheet = (rule as CSSImportRule).styleSheet;
      try {
        if (sheet) collectRules(sheet.cssRules, scope, sheet.href ?? base, out);
      } catch {
        // A sheet from another origin cannot be read.
      }
    } else if ('cssRules' in rule && kind !== 'CSSKeyframesRule') {
      const inner: string[] = [];
      collectRules((rule as CSSGroupingRule).cssRules, scope, base, inner);
      if (inner.length === 0) continue;
      const header = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
      out.push(`${header} {\n${inner.join('\n')}\n}`);
    } else {
      out.push(absoluteUrls(rule.cssText, base));
    }
  }
}

function documentRules(doc: Document, scope: ParentNode): string {
  const out: string[] = [];
  const sheets = [...Array.from(doc.styleSheets), ...doc.adoptedStyleSheets];
  for (const sheet of sheets) {
    const owner = sheet.ownerNode;
    if (owner && isElement(owner) && owner.hasAttribute(BASE_STYLE_ATTRIBUTE)) continue;
    try {
      collectRules(sheet.cssRules, scope, sheet.href ?? doc.baseURI, out);
    } catch {
      // A sheet from another origin cannot be read.
    }
  }
  // Keyframes nobody in the copy names are dropped.
  const text = out.join('\n');
  return out
    .filter((rule) => {
      const name = /^@(?:-webkit-)?keyframes\s+([^\s{]+)/.exec(rule)?.[1];
      if (!name) return true;
      return new RegExp(
        `animation[^;{}]*\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      ).test(text);
    })
    .join('\n');
}

function cleanClone(clone: Element): void {
  for (const dropped of Array.from(clone.querySelectorAll(DROPPED))) dropped.remove();
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
    }
  }
}

async function copyByMarkup(el: Element, request: CopyRequest): Promise<HtmlCopy> {
  const doc = el.ownerDocument;
  const cs = styleOf(el);
  const lossy: string[] = [];
  const out = doc.implementation.createHTMLDocument('');
  const natural = naturalSize(el, request.parentScale);
  const size = layoutSize(el, request.parentScale);
  const inset = transformInset(el, cs);

  const clone = out.importNode(el, request.deep);
  // Before anything is removed from the clone: it is matched to the original node by node.
  await assetImages(clone, el, request, lossy);
  // The document's own root and body cannot be nested; they become the shells that the
  // rewritten selectors name.
  let root: Element = clone;
  if (el.localName === 'html' || el.localName === 'body') {
    root = out.createElement(shellTag(el));
    for (const attr of Array.from(clone.attributes)) root.setAttribute(attr.name, attr.value);
    if (el.localName === 'html') {
      const body = Array.from(clone.children).find((c) => c.localName === 'body');
      if (body) {
        const shell = out.createElement(BODY_SHELL);
        for (const attr of Array.from(body.attributes)) shell.setAttribute(attr.name, attr.value);
        shell.append(...Array.from(body.childNodes));
        // The size the engine gave the sandbox's body is part of what the page looked like.
        const bodyStyle = styleOf(el.ownerDocument.body);
        shell.style.cssText +=
          `;display:${bodyStyle.display};width:${bodyStyle.width};height:${bodyStyle.height};` +
          `box-sizing:${bodyStyle.boxSizing};margin:0;overflow:hidden`;
        root.append(shell);
      }
    } else root.append(...Array.from(clone.childNodes));
  }
  cleanClone(root);
  if (!request.deep) root.replaceChildren();

  // The root fills the box the model frame gives the copy; its own transform stays on it.
  const pinned = root as HTMLElement;
  pinned.style.cssText +=
    `;position:absolute;left:${inset.x}px;top:${inset.y}px;right:auto;bottom:auto;margin:0;` +
    `width:${size.w}px;height:${size.h}px;box-sizing:border-box;float:none` +
    (cs.display === 'inline' || cs.display === 'contents'
      ? ';display:block'
      : `;display:${cs.display}`);

  // Empty shells of the ancestors keep selectors matching and inherited values flowing.
  let top: Element = root;
  for (let p = composedParent(el); p; p = composedParent(p)) {
    const shell = out.createElement(shellTag(p));
    for (const attr of Array.from(p.attributes)) {
      if (!attr.name.toLowerCase().startsWith('on')) shell.setAttribute(attr.name, attr.value);
    }
    shell.style.cssText += ';display:contents !important';
    shell.append(top);
    top = shell;
  }

  const holder = out.createElement('div');
  const direction = styleOf(composedParent(el) ?? el).direction;
  holder.setAttribute('dir', direction);
  // Written as an attribute: through the style object `all` would be spelled out, property by property.
  holder.setAttribute(
    'style',
    (request.foreign ? 'all:initial;' : '') +
      `display:block;position:relative;width:${natural.w}px;height:${natural.h}px;direction:${direction}`,
  );
  holder.append(top);

  const styles = documentRules(doc, holder);
  return { markup: holder.outerHTML, ...(styles ? { styles } : {}), natural, lossy };
}

// ---------------------------------------------------------------------------------------------
// The computed-style copy.

interface Baseline {
  doc: Document;
  byTag: Map<string, Record<string, string>>;
  dispose(): void;
}

let baseline: Baseline | undefined;

/** The computed style of a pristine element of a tag: what a copy does not need to say. */
function baselineFor(tag: string, svg: boolean): Record<string, string> {
  if (!baseline) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.documentElement.append(frame);
    baseline = { doc: frame.contentDocument!, byTag: new Map(), dispose: () => frame.remove() };
  }
  const key = `${svg ? 'svg:' : ''}${tag}`;
  const known = baseline.byTag.get(key);
  if (known) return known;
  const doc = baseline.doc;
  const el = svg ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag);
  doc.body.append(el);
  const cs = doc.defaultView!.getComputedStyle(el);
  const map: Record<string, string> = {};
  for (const property of Array.from(cs)) map[property] = cs.getPropertyValue(property);
  el.remove();
  baseline.byTag.set(key, map);
  return map;
}

/** Releases the frame the baselines are read from. */
export function disposeCopyBaseline(): void {
  baseline?.dispose();
  baseline = undefined;
}

// Properties that say where a box sits among its siblings; the model frame places the copy.
const ROOT_SKIP =
  /^(margin|inset|top|right|bottom|left|position|float|grid-(row|column|area)|align-self|justify-self|place-self|order|flex($|-grow|-shrink|-basis))/;
// Logical twins of physical properties, values that only repeat `color`, and what belongs to
// a document's root alone: a view transition name on a copy would give it a layer of its own,
// and text on such a layer is anti-aliased differently.
const NEVER =
  /^(transition|view-transition|-webkit-locale|perspective-origin|block-size|inline-size|min-block-size|min-inline-size|max-block-size|max-inline-size|-webkit-text-fill-color|caret-color|column-rule-color|text-emphasis-color|-webkit-text-stroke-color|outline-color|text-decoration-color|border-(block|inline)-|margin-(block|inline)-|padding-(block|inline)-|inset-(block|inline))/;
const FOLLOW_COLOR = [
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  'text-decoration-color',
  'outline-color',
];

function styleDiff(cs: CSSStyleDeclaration, base: Record<string, string>, isRoot: boolean): string {
  let css = '';
  for (const property of Array.from(cs)) {
    if (property.startsWith('--') || NEVER.test(property)) continue;
    if (isRoot && ROOT_SKIP.test(property)) continue;
    if (property === 'transform-origin' && cs.transform === 'none') continue;
    const value = cs.getPropertyValue(property);
    if (value !== base[property]) css += `${property}:${value};`;
  }
  for (const property of FOLLOW_COLOR) {
    const value = cs.getPropertyValue(property);
    if (value && value !== cs.color) css += `${property}:${value};`;
  }
  return `${css}transition:none;`;
}

const KEPT_ATTRIBUTES = [
  'dir',
  'lang',
  'alt',
  'colspan',
  'rowspan',
  'value',
  'type',
  'start',
  'reversed',
  'href',
  'data-asset',
  'data-image-prompt',
  'data-name',
  'data-role',
];

async function copyByComputedStyle(el: Element, request: CopyRequest): Promise<HtmlCopy> {
  const doc = el.ownerDocument;
  const out = doc.implementation.createHTMLDocument('');
  const lossy: string[] = [];

  const pseudo = (node: Element, which: '::before' | '::after'): Element | undefined => {
    const cs = styleOf(node, which);
    const content = cs.content;
    if (!content || content === 'none' || content === 'normal') return undefined;
    const span = out.createElement('span');
    const literal = /^"((?:[^"\\]|\\.)*)"$/.exec(content);
    if (literal) span.textContent = literal[1]!.replace(/\\(.)/g, '$1');
    else lossy.push(`${which} content ${content.slice(0, 40)}`);
    const base = baselineFor('span', false);
    let css = '';
    for (const property of Array.from(cs)) {
      if (property.startsWith('--') || NEVER.test(property) || property === 'content') continue;
      const value = cs.getPropertyValue(property);
      if (value !== base[property]) css += `${property}:${value};`;
    }
    span.setAttribute('style', css);
    return span;
  };

  const copy = async (node: Node, isRoot: boolean): Promise<Node | undefined> => {
    if (isText(node)) return out.createTextNode(node.data);
    if (!isElement(node)) return undefined;
    const tag = node.localName;
    if (node.matches(DROPPED)) return undefined;
    const cs = styleOf(node);
    if (cs.display === 'none') return undefined;
    const svg = isSvg(node);

    let made: Element;
    if (tag === 'canvas') {
      // A canvas is drawn by script; the copy is its current picture.
      made = out.createElement('img');
      try {
        made.setAttribute('src', (node as HTMLCanvasElement).toDataURL('image/png'));
      } catch {
        lossy.push('a canvas that cannot be read');
      }
    } else if (svg) {
      made = out.createElementNS('http://www.w3.org/2000/svg', node.tagName);
      for (const attr of Array.from(node.attributes)) {
        if (!attr.name.toLowerCase().startsWith('on')) made.setAttribute(attr.name, attr.value);
      }
    } else {
      // The document's root and body, and parts of a table, cannot be parsed back as they are.
      const plain = tag === 'html' || tag === 'body' || TABLE_PARTS.has(tag) || tag === 'table';
      made = out.createElement(plain ? 'div' : tag);
      for (const name of KEPT_ATTRIBUTES) {
        const value = node.getAttribute(name);
        if (value !== null) made.setAttribute(name, value);
      }
      if (tag === 'img') {
        const img = node as HTMLImageElement;
        if (!made.hasAttribute('data-asset') && !img.hasAttribute(BLANK_IMAGE_ATTRIBUTE)) {
          const url = img.currentSrc || img.src;
          const id = url ? await request.storeImage(url) : undefined;
          if (id) made.setAttribute('data-asset', id);
          else if (url) lossy.push(`image ${url.slice(0, 80)} could not be read`);
        }
      }
      if (
        tag === 'iframe' ||
        tag === 'video' ||
        tag === 'audio' ||
        tag === 'object' ||
        tag === 'embed'
      ) {
        lossy.push(`<${tag}>`);
      }
    }

    let style = styleDiff(cs, baselineFor(tag, svg), isRoot);
    if (node.hasAttribute(RESOLVED_BACKGROUND_ATTRIBUTE)) {
      style = style.replace(/background-image:[^;]*;/, '');
    }
    if (isRoot) {
      const size = layoutSize(node, request.parentScale);
      const inset = transformInset(node, cs);
      style +=
        `position:absolute;left:${inset.x}px;top:${inset.y}px;margin:0;` +
        `width:${size.w}px;height:${size.h}px;box-sizing:border-box;`;
    }
    made.setAttribute('style', style);

    const before = !svg || tag === 'svg' ? pseudo(node, '::before') : undefined;
    if (before) made.append(before);
    if ((request.deep || !isRoot || svg) && tag !== 'canvas') {
      for (const child of composedChildNodes(node)) {
        const copied = await copy(child, false);
        if (copied) made.append(copied);
      }
    }
    const after = !svg ? pseudo(node, '::after') : undefined;
    if (after) made.append(after);
    return made;
  };

  const root = await copy(el, true);
  const natural = naturalSize(el, request.parentScale);
  const holder = out.createElement('div');
  const direction = styleOf(composedParent(el) ?? el).direction;
  holder.setAttribute('dir', direction);
  // Nothing of the slide may reach a copy that says everything itself.
  holder.setAttribute(
    'style',
    `all:initial;display:block;position:relative;width:${natural.w}px;height:${natural.h}px;direction:${direction}`,
  );
  if (root) holder.append(root);
  return { markup: holder.outerHTML, natural, lossy };
}

export function copySubtree(
  el: Element,
  strategy: CopyStrategy,
  request: CopyRequest,
): Promise<HtmlCopy> {
  return strategy === 'markup' && markupCopyPossible(el, request.deep)
    ? copyByMarkup(el, request)
    : copyByComputedStyle(el, request);
}
