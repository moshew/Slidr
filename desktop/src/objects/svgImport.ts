import type { AssetMeta } from '@slidr/model';
import { cleanPicture, normalizeColor, SVG_NAMESPACE } from '@slidr/renderer';

/*
 * Importing an SVG file (SHP-06, SEC-06). A small SVG becomes an `svg` element that holds its
 * markup, so that its colours can be replaced and tied to the theme; the markup is cleaned
 * first, by the rules of a picture that the renderer holds every `svg` element to when it draws
 * it (`cleanPicture`): what goes into the deck is already what will be drawn. A large one, or a
 * file that is not an SVG after all, stays an asset and is drawn as a picture, as before.
 */

/** Above this many characters an SVG stays an asset: the markup would be stored in the deck itself. */
export const MAX_INLINE_SVG = 300_000;

/** How specific a selector is, roughly: ids, then classes and attributes, then element names. */
function specificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)?.length ?? 0;
  const names = selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g)?.length ?? 0;
  return ids * 10_000 + classes * 100 + names;
}

/**
 * Writes what the file's stylesheets say onto the elements themselves, and takes the
 * stylesheets out: a colour that only a class gives cannot be replaced per element. Rules are
 * applied in order of specificity; what an element says in its own `style` wins, as it did in
 * the file. At-rules (`@media`, `@keyframes`) are dropped.
 */
function inlineStylesheets(root: Element): void {
  const sheets = Array.from(root.querySelectorAll('style'));
  if (sheets.length === 0) return;
  const own = new Map<Element, Set<string>>();
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const style = (el as SVGElement).style;
    if (style) own.set(el, new Set(Array.from(style)));
  }
  const rules: { selector: string; style: CSSStyleDeclaration; order: number }[] = [];
  for (const sheet of sheets) {
    const parsed = new CSSStyleSheet();
    try {
      // `@import` is not allowed in a constructed sheet, and is dropped: nothing is fetched.
      parsed.replaceSync(sheet.textContent ?? '');
    } catch {
      continue;
    }
    for (const rule of Array.from(parsed.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      for (const selector of rule.selectorText.split(',')) {
        rules.push({ selector: selector.trim(), style: rule.style, order: rules.length });
      }
    }
  }
  rules.sort((a, b) => specificity(a.selector) - specificity(b.selector) || a.order - b.order);
  for (const { selector, style } of rules) {
    let matched: Element[];
    try {
      matched = Array.from(root.querySelectorAll(selector));
      if (root.matches(selector)) matched.unshift(root);
    } catch {
      continue;
    }
    for (const el of matched) {
      const target = (el as SVGElement).style;
      if (!target) continue;
      for (const property of Array.from(style)) {
        if (own.get(el)?.has(property)) continue;
        target.setProperty(
          property,
          style.getPropertyValue(property),
          style.getPropertyPriority(property),
        );
      }
    }
  }
  for (const sheet of sheets) sheet.remove();
}

/**
 * The markup of an SVG file as a picture (`cleanPicture`): SVG that draws, with nothing that
 * runs, nothing of another kind of markup, no link, no reference to anything outside the file,
 * and its stylesheets written onto its elements. Undefined when the text is not an SVG, or is
 * too large to keep in the deck.
 */
export function cleanSvg(text: string): string | undefined {
  if (text.length > MAX_INLINE_SVG) return undefined;
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NAMESPACE ||
    parsed.querySelector('parsererror')
  ) {
    return undefined;
  }
  cleanPicture(root);
  inlineStylesheets(root);
  // Once more, for what the stylesheets wrote onto the elements.
  cleanPicture(root);
  if (!root.getAttribute('viewBox')) {
    const w = parseFloat(root.getAttribute('width') ?? '');
    const h = parseFloat(root.getAttribute('height') ?? '');
    if (w > 0 && h > 0) root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  const markup = new XMLSerializer().serializeToString(root);
  return markup.length > MAX_INLINE_SVG ? undefined : markup;
}

/** The size an SVG says it has: its `viewBox`, or else its width and height. */
export function svgSize(markup: string): { w: number; h: number } | undefined {
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const box = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return { w: box[2]!, h: box[3]! };
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  return w > 0 && h > 0 ? { w, h } : undefined;
}

const COLOR_PROPERTIES = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];
const NOT_A_COLOR = /^(none|transparent|inherit|initial|unset|context-fill|context-stroke|url\()/i;
const PAINTED = 'path, rect, circle, ellipse, polygon, polyline, text, line';
/** What SVG paints a shape in when nothing says otherwise, as the renderer keys it. */
const BLACK = normalizeColor('black');

/**
 * The colours an SVG is drawn in, in the form `colorOverrides` keys are compared in, by how
 * often each is used: what the recolour tool lists. `currentcolor` is one of them when the
 * markup draws in the element's own colour, and `#000000` stands for shapes that name no fill,
 * which SVG draws black.
 */
export function svgColors(markup: string): string[] {
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const counts = new Map<string, number>();
  const count = (value: string | null | undefined) => {
    const raw = value?.trim();
    if (!raw || NOT_A_COLOR.test(raw)) return;
    const colour = normalizeColor(raw);
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  };
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const style = (el as SVGElement).style;
    for (const property of COLOR_PROPERTIES) {
      count(el.getAttribute(property));
      count(style?.getPropertyValue(property));
    }
  }
  // Black by default: a shape with no fill of its own, under no ancestor that gives one.
  const filled = (el: Element | null): boolean =>
    Boolean(
      el &&
      (el.getAttribute('fill') ||
        (el as SVGElement).style?.getPropertyValue('fill') ||
        filled(el.parentElement)),
    );
  if (Array.from(root.querySelectorAll(PAINTED)).some((el) => !filled(el))) count(BLACK);
  return Array.from(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([colour]) => colour);
}

/**
 * The markup of the SVG files among what was just imported, by asset id: the files whose
 * markup can be kept in an element. `files[i]` is the file `assets[i]` was made from.
 */
export async function svgMarkups(
  files: readonly File[],
  assets: readonly AssetMeta[],
): Promise<Map<string, string>> {
  const markups = new Map<string, string>();
  await Promise.all(
    assets.map(async (asset, i) => {
      const file = files[i];
      if (asset.kind !== 'svg' || !file || file.size > MAX_INLINE_SVG) return;
      // A file the cleaning cannot make sense of stays an asset, drawn as a picture.
      const markup = await file.text().then(cleanSvg, () => undefined);
      if (markup) markups.set(asset.id, markup);
    }),
  );
  return markups;
}
