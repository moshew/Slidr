/**
 * Cleaning markup that is rendered into the editor's own document (SEC-03, SEC-06): an `html`
 * element without scripts, and inline SVG. Markup with scripts never comes here; it runs in a
 * sandboxed frame instead.
 *
 * This removes what can run code or reach outside the slide, and keeps everything that only
 * draws, so that "any HTML renders as it is" (SPEC 5.9) holds for everything that is not a script.
 */

const DROPPED_ELEMENTS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'portal',
  'noscript',
]);

const URL_ATTRIBUTES = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'data',
  'poster',
]);

function isScriptUrl(value: string): boolean {
  // Browsers ignore whitespace and control characters inside the scheme.
  const compact = Array.from(value)
    .filter((c) => c.charCodeAt(0) > 0x20)
    .join('')
    .toLowerCase();
  return compact.startsWith('javascript:') || compact.startsWith('vbscript:');
}

function cleanElement(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || (URL_ATTRIBUTES.has(name) && isScriptUrl(attr.value))) {
      el.removeAttribute(attr.name);
    }
  }
  // A link inside a slide must never navigate the editor's own window away.
  if (el.localName === 'a' && el.hasAttribute('href')) {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
}

function cleanTree(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (DROPPED_ELEMENTS.has(el.localName.toLowerCase())) el.remove();
    else cleanElement(el);
  }
}

/** Parses markup as HTML (inline SVG included) into a detached fragment of `doc`. */
export function parseFragment(markup: string, doc: Document = document): DocumentFragment {
  const template = doc.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

export function serializeFragment(fragment: DocumentFragment, doc: Document = document): string {
  const holder = doc.createElement('div');
  holder.appendChild(fragment);
  return holder.innerHTML;
}

/** Markup without scripts, event handlers, script URLs or embedded browsing contexts. */
export function sanitizeMarkup(markup: string, doc: Document = document): string {
  const fragment = parseFragment(markup, doc);
  cleanTree(fragment);
  return serializeFragment(fragment, doc);
}

/** Cleans a parsed fragment in place. */
export function sanitizeFragment(fragment: DocumentFragment): void {
  cleanTree(fragment);
}
