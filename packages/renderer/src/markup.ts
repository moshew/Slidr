import type { Color, HtmlElement } from '@slidr/model';
import type { RenderContext } from './context';
import { parseFragment, sanitizeFragment, serializeFragment } from './sanitize';
import { colorCss, themeVariablesCss } from './theme';

/** A 1x1 transparent GIF: an image that waits for its content shows no broken-image icon. */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const SRC_ELEMENTS = new Set(['img', 'video', 'audio', 'source', 'track', 'embed']);

/**
 * Points `data-asset="<id>"` at the asset's URL (SPEC 11.5). `<img data-image-prompt>` without a
 * source is a placeholder waiting for a generated image; it gets a blank source and a surface fill.
 */
export function resolveAssetRefs(root: ParentNode, ctx: RenderContext): void {
  for (const el of Array.from(root.querySelectorAll('[data-asset]'))) {
    const url = ctx.assetUrl(el.getAttribute('data-asset') ?? '');
    if (!url) continue;
    const tag = el.localName.toLowerCase();
    if (SRC_ELEMENTS.has(tag)) el.setAttribute('src', url);
    else if (tag === 'image' || tag === 'use') el.setAttribute('href', url);
    else if (el instanceof HTMLElement || el instanceof SVGElement) {
      el.style.backgroundImage = `url("${url}")`;
    }
  }
  for (const el of Array.from(root.querySelectorAll('img[data-image-prompt]:not([src])'))) {
    el.setAttribute('src', BLANK_IMAGE);
    if (el instanceof HTMLElement && !el.style.background) {
      el.style.background = 'var(--color-surface)';
    }
  }
}

// ---- Inline SVG (the `svg` element type). ----

const COLOR_PROPERTIES = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];
const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff' };

/** A colour in the form `colorOverrides` keys are compared in: lower-case, 6- or 8-digit hex. */
export function normalizeColor(value: string): string {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(v);
  if (short)
    return `#${short
      .slice(1)
      .filter(Boolean)
      .map((c) => c + c)
      .join('')}`;
  // The CSSOM hands inline style colours back as rgb().
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('');
    const a = rgb[4];
    if (a === undefined) return `#${hex}`;
    const alpha = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    return alpha >= 1
      ? `#${hex}`
      : `#${hex}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')}`;
  }
  return v;
}

/**
 * Inline SVG ready to place in a slide: cleaned (SEC-06), sized to its frame, and recoloured by
 * `colorOverrides` (SHP-06). A replacement is written as a style, because a presentation attribute
 * cannot hold `var(--color-*)`. The key `#000000` also covers shapes that are black only because
 * black is SVG's initial fill, and `currentColor` sets the colour that icons drawn in
 * `currentColor` follow.
 */
export function prepareSvg(markup: string, overrides: Record<string, Color> | undefined): string {
  const fragment = parseFragment(markup);
  sanitizeFragment(fragment);
  const root = fragment.querySelector('svg');
  if (root) {
    const w = parseFloat(root.getAttribute('width') ?? '');
    const h = parseFloat(root.getAttribute('height') ?? '');
    if (!root.hasAttribute('viewBox') && w > 0 && h > 0)
      root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    root.setAttribute('width', '100%');
    root.setAttribute('height', '100%');
    root.style.display = 'block';
  }
  if (overrides && Object.keys(overrides).length) {
    const map = new Map(
      Object.entries(overrides).map(([k, c]) => [normalizeColor(k), colorCss(c)]),
    );
    for (const el of Array.from(fragment.querySelectorAll('*'))) {
      if (!(el instanceof SVGElement)) continue;
      for (const prop of COLOR_PROPERTIES) {
        const attr = el.getAttribute(prop);
        const fromAttr = attr ? map.get(normalizeColor(attr)) : undefined;
        if (fromAttr) {
          el.removeAttribute(prop);
          el.style.setProperty(prop, fromAttr);
        }
        const inline = el.style.getPropertyValue(prop);
        const fromStyle = inline ? map.get(normalizeColor(inline)) : undefined;
        if (fromStyle) el.style.setProperty(prop, fromStyle);
      }
    }
    if (root) {
      const black = map.get('#000000');
      if (black && !root.getAttribute('fill') && !root.style.getPropertyValue('fill')) {
        root.style.setProperty('fill', black);
      }
      const current = map.get('currentcolor');
      if (current) root.style.setProperty('color', current);
    }
  }
  return serializeFragment(fragment);
}

// ---- `html` elements with scripts run in a sandboxed frame (RND-06, SEC-03). ----

function escapeStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

let pageNonce: string | undefined;

/**
 * Tells the renderer the script nonce of the page it draws in, where the page has a content
 * policy that asks for one (SEC-05). A frame made from `srcdoc` inherits the policy of the page
 * around it, so the scripts of an `html` element run only when they carry the page's nonce. They
 * still run inside the frame's sandbox, and the page's own policy is not loosened. A host sets
 * it once, when the page starts; `SlideRenderer` takes `scriptNonce` to draw without it.
 */
export function setFrameScriptNonce(nonce: string | undefined): void {
  pageNonce = nonce || undefined;
}

/** The nonce the frames of a slide get when the host of the slide names none. */
export function frameScriptNonce(): string | undefined {
  return pageNonce;
}

/**
 * The document of a sandboxed frame. It does not inherit anything from the slide, so it gets the
 * theme variables and the slide's base text style itself (RND-08).
 */
export function frameDocument(
  element: HtmlElement,
  ctx: RenderContext,
  size: { w: number; h: number },
): string {
  const fragment = parseFragment(element.markup);
  resolveAssetRefs(fragment, ctx);
  if (ctx.scriptNonce) {
    for (const script of Array.from(fragment.querySelectorAll('script'))) {
      script.setAttribute('nonce', ctx.scriptNonce);
    }
  }
  const body = ctx.theme.textStyles.body;
  const base = [
    `:root { ${themeVariablesCss(ctx.theme)} }`,
    `html, body { margin: 0; padding: 0; width: ${size.w}px; height: ${size.h}px; overflow: hidden; background: transparent; }`,
    `body { font-family: var(--font-body); font-size: ${body.size}px; line-height: ${body.lineHeight}; color: ${colorCss(body.color)}; }`,
  ].join('\n');
  return [
    '<!doctype html>',
    `<html lang="${ctx.lang}" dir="${ctx.dir}"><head><meta charset="utf-8">`,
    `<style>${escapeStyle(base)}</style>`,
    element.styles ? `<style>${escapeStyle(element.styles)}</style>` : '',
    `</head><body>${serializeFragment(fragment)}</body></html>`,
  ].join('');
}
