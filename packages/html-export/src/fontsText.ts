import { parseFamilies, shapedCodePoints, styleKind, type TextUse } from './fontsMatch';
import { everyElement } from './render';

/**
 * The text the slides draw, by the font it is drawn in (WG9-T09). Read off the live DOM, so the
 * fonts are the computed ones: the theme's variables resolved, a run's own font, whatever the
 * CSS of a slide or of an `html` element sets.
 */

/** Elements whose text is not drawn, or is drawn by a document that cannot be read from here. */
const NOT_DRAWN = new Set(['style', 'script', 'template', 'iframe', 'object', 'embed']);

/** Attributes a browser draws as text: of a picture that is missing, of a form control. */
const TEXT_ATTRIBUTES = ['alt', 'placeholder', 'value', 'label'];

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const SOFT_HYPHEN = chars(0xad);
/** What a line that breaks at a soft hyphen ends with: a hyphen, or a hyphen-minus without one. */
const HYPHENS = chars(0x2010) + '-';
/** What cut-off text ends with: an ellipsis, or three full stops in a font without one. */
const ELLIPSIS = chars(0x2026) + '.';
/** The quotation marks `open-quote` may stand for; which ones depends on the language. */
const QUOTES = '"\'' + chars(0x201c, 0x201d, 0x2018, 0x2019, 0xab, 0xbb, 0x201e, 0x201a);
const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** List markers a browser draws as shapes, not with a font. */
const SHAPE_MARKERS = new Set(['none', 'disc', 'circle', 'square']);

/** A property that says something: it has a value, and not one of those that mean "nothing". */
const isSet = (value: string | undefined, ...nothing: string[]): boolean =>
  Boolean(value) && !nothing.includes(value ?? '');

/** The text of the string literals in a CSS value. */
const strings = (value: string): string =>
  Array.from(value.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g), (match) =>
    (match[1] ?? match[2] ?? '').replace(/\\(.)/g, '$1'),
  ).join('');

/**
 * Every sign a counter style can show. The numbering itself cannot be read from the DOM, so a
 * numbered list takes all the digits, and one in letters the alphabet as well.
 */
function counterText(style: string): string {
  const name = style.trim().toLowerCase();
  if (!name || SHAPE_MARKERS.has(name)) return '';
  if (/^["']/.test(name)) return strings(style);
  if (name.startsWith('decimal')) return DIGITS;
  return DIGITS + LETTERS + LETTERS.toUpperCase();
}

/** The text of a `content` value: its strings, and what its counters and quotes can show. */
function contentText(content: string, quotes: string): string {
  if (!isSet(content, 'none', 'normal')) return '';
  let text = strings(content);
  for (const counter of content.matchAll(/counters?\(([^)]*)\)/g)) {
    const args = (counter[1] ?? '').split(',');
    // `counter(name, style)` and `counters(name, "separator", style)`.
    const style = counter[0].startsWith('counters') ? args[2] : args[1];
    text += counterText(style ?? 'decimal');
  }
  if (content.includes('quote')) text += strings(quotes) || QUOTES;
  return text;
}

/** Text as a style draws it: in the case the style turns it to, with the hyphens it may add. */
function drawnText(text: string, style: CSSStyleDeclaration): string {
  if (!text) return '';
  let drawn = text;
  // Small capitals are capitals drawn smaller, in a font that has no small capitals of its own.
  if (isSet(style.textTransform, 'none') || isSet(style.fontVariantCaps, 'normal')) {
    drawn += text.toUpperCase() + text.toLowerCase();
  }
  if (text.includes(SOFT_HYPHEN) || style.hyphens === 'auto') {
    drawn += HYPHENS + strings(style.getPropertyValue('hyphenate-character'));
  }
  return drawn;
}

/** The text an element holds itself, not through its children. */
function ownText(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) text += (node as Text).data;
  }
  for (const name of TEXT_ATTRIBUTES) text += element.getAttribute(name) ?? '';
  return text;
}

/**
 * Looks through the rendered slides for the text they draw, into the open shadow roots of `html`
 * elements too. Besides text nodes that is what CSS adds (`::before`, `::after`, the markers of
 * a list the browser numbers itself, an ellipsis) and what it changes (`text-transform`). A
 * sandboxed frame is skipped: its document cannot be read, and it does not see the page's fonts.
 */
export function collectText(host: HTMLElement): TextUse[] {
  const view = host.ownerDocument.defaultView;
  if (!view) return [];
  const found = new Map<string, { use: Omit<TextUse, 'codePoints'>; text: string }>();
  const add = (text: string, style: CSSStyleDeclaration) => {
    if (!text) return;
    const features =
      isSet(style.fontFeatureSettings, 'normal') ||
      isSet(style.fontVariantCaps, 'normal') ||
      isSet(style.fontVariantNumeric, 'normal') ||
      isSet(style.fontVariantLigatures, 'normal') ||
      isSet(style.fontVariantEastAsian, 'normal') ||
      isSet(style.fontVariantAlternates, 'normal') ||
      isSet(style.fontVariantPosition, 'normal');
    const variations = isSet(style.fontVariationSettings, 'normal');
    const weight = style.fontWeight === 'bold' ? 700 : Number(style.fontWeight) || 400;
    const kind = styleKind(style.fontStyle);
    const key = [style.fontFamily, kind, weight, features, variations].join('|');
    const entry = found.get(key);
    if (entry) entry.text += text;
    else {
      const families = parseFamilies(style.fontFamily);
      found.set(key, { text, use: { families, style: kind, weight, features, variations } });
    }
  };

  for (const element of everyElement(host)) {
    if (NOT_DRAWN.has(element.localName)) continue;
    const style = view.getComputedStyle(element);
    add(drawnText(ownText(element), style), style);
    if (
      isSet(style.textOverflow, 'clip') ||
      isSet(style.getPropertyValue('-webkit-line-clamp'), 'none')
    ) {
      add(ELLIPSIS + strings(style.textOverflow), style);
    }
    for (const pseudo of ['::before', '::after']) {
      const drawn = view.getComputedStyle(element, pseudo);
      add(drawnText(contentText(drawn.content, drawn.quotes), drawn), drawn);
    }
    if (style.display === 'list-item') {
      const marker = view.getComputedStyle(element, '::marker');
      const text = contentText(marker.content, marker.quotes) || counterText(style.listStyleType);
      // A full stop and a space follow the number.
      if (text) add(`${text}. `, marker);
    }
  }

  return Array.from(found.values(), ({ use, text }) => {
    const codePoints = new Set<number>();
    for (const char of text) codePoints.add(Number(char.codePointAt(0)));
    return { ...use, codePoints: shapedCodePoints(codePoints) };
  });
}
