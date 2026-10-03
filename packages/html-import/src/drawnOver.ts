/**
 * What a page draws over an element without being part of it: a page counter, navigation
 * arrows, a progress bar, a fixed logo. A capture of the element cannot look like the page
 * while such a thing lies over it: the picture of the source shows it, and the element's own
 * subtree does not have it. Whether it is player chrome to hide or a part of the slide to
 * include is for the agent to say; this only finds it, by asking the browser what it paints
 * where (IMP-04: no names, no selectors).
 */
import { composedParent, isInside, ownPaint, styleOf } from './measure';

/** Points asked across the element, a grid of this many columns and rows. */
const COLUMNS = 24;
const ROWS = 14;

const REPLACED = new Set(['img', 'svg', 'canvas', 'video', 'iframe', 'object', 'embed', 'input']);

/** Whether the element itself puts ink on the page: a box, a picture, or text of its own. */
function paints(el: Element): boolean {
  if (REPLACED.has(el.localName)) return true;
  if (ownPaint(styleOf(el)).any) return true;
  return Array.from(el.childNodes).some(
    (node) => node.nodeType === 3 && (node.nodeValue ?? '').trim() !== '',
  );
}

function shown(el: Element): boolean {
  if (styleOf(el).visibility !== 'visible') return false;
  for (let node: Element | undefined = el; node; node = composedParent(node)) {
    if (Number.parseFloat(styleOf(node).opacity) === 0) return false;
  }
  return true;
}

/**
 * The elements outside `root` that are painted above it somewhere inside its box, outermost
 * first. The browser is asked for the stack of elements at a grid of points; hit testing is
 * opened to every element for the moment, so one that ignores the pointer is found too.
 */
export function drawnOver(root: Element): Element[] {
  const doc = root.ownerDocument;
  const rect = root.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return [];
  const open = doc.createElement('style');
  open.textContent = '* { pointer-events: auto !important; }';
  (doc.head ?? doc.documentElement).append(open);
  const found = new Set<Element>();
  try {
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const x = rect.left + ((column + 0.5) / COLUMNS) * rect.width;
        const y = rect.top + ((row + 0.5) / ROWS) * rect.height;
        for (const el of doc.elementsFromPoint(x, y)) {
          // From the top down to the element itself: what comes after it lies behind it.
          if (el === root) break;
          if (isInside(el, root) || isInside(root, el)) continue;
          if (paints(el) && shown(el)) found.add(el);
        }
      }
    }
  } finally {
    open.remove();
  }
  // A thing and its parts are one thing: only the outermost is named.
  return Array.from(found).filter(
    (el) => !Array.from(found).some((other) => other !== el && isInside(el, other)),
  );
}

/** `tag#id.class [WxH @x,y] "text"`, as the outline of the page names an element. */
export function nameOf(el: Element): string {
  let name = el.localName;
  if (el.id) name += `#${el.id}`;
  const classes = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
  if (classes.length > 0) name += `.${classes.slice(0, 3).join('.')}`;
  const r = el.getBoundingClientRect();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return (
    `${name} [${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}]` +
    (text ? ` "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` : '')
  );
}
