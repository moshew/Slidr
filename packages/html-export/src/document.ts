import { READY_CLASS, SLIDE_CLASS, STAGE_CLASS, VIEWPORT_CLASS } from '@slidr/runtime';

/**
 * The exported document around the slides (WG9-T07, T10): `lang` and `dir`, a small stylesheet,
 * and the runtime as an inline script. The class names are fixed, so the file reads the same from
 * one export to the next (EXP-11).
 */
export interface DocumentParts {
  title: string;
  lang: string;
  dir: 'rtl' | 'ltr';
  size: { w: number; h: number };
  /** The `<section class="slide">` elements, serialised. */
  slides: string;
  /** `@font-face` rules for fonts that are not assets of the deck. */
  fontCss: string;
  /** The runtime bundle. */
  script: string;
  /**
   * The chart engine with its library, for a deck that has charts (EXP-12). It comes before the
   * runtime: the charts are listening when the player gives the first slide its cues.
   */
  chartScript?: string | undefined;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Text of an inline `<style>` or `<script>`: nothing in it may read as the closing tag. */
function inline(text: string): string {
  return text.replace(/<\/(script|style)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/**
 * The page is a black viewport with the stage in it; the runtime scales the stage and shows one
 * slide at a time. Until it has taken over nothing is shown, so no unscaled slide flashes by.
 */
function baseCss(size: { w: number; h: number }): string {
  return `html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
.${VIEWPORT_CLASS} { position: fixed; inset: 0; overflow: hidden; background: #000; }
.${STAGE_CLASS} { position: absolute; left: 0; top: 0; width: ${size.w}px; height: ${size.h}px; overflow: hidden; transform-origin: 0 0; }
html:not(.${READY_CLASS}) .${STAGE_CLASS} { visibility: hidden; }
.${SLIDE_CLASS} { position: absolute; left: 0; top: 0; display: none; }
.slidr-fullscreen { position: absolute; inset-inline-end: 16px; bottom: 16px; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: rgba(0, 0, 0, 0.5); color: #fff; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
.slidr-active .slidr-fullscreen, .slidr-fullscreen:focus-visible { opacity: 1; }`;
}

/** Without scripts the slides are a column to scroll through. */
function noScriptCss(): string {
  return `html, body { height: auto; overflow: auto; }
.${VIEWPORT_CLASS} { position: static; overflow: visible; }
html:not(.${READY_CLASS}) .${STAGE_CLASS} { position: static; width: auto; height: auto; overflow: visible; visibility: visible; }
.${SLIDE_CLASS} { position: relative; display: block; margin: 0 auto 16px; width: max-content; }`;
}

export function buildDocument(parts: DocumentParts): string {
  const { size } = parts;
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(parts.lang)}" dir="${parts.dir}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="Slidr">',
    `<title>${escapeHtml(parts.title)}</title>`,
    `<style>${inline(baseCss(size))}</style>`,
    parts.fontCss ? `<style data-slidr-fonts>${inline(parts.fontCss)}</style>` : '',
    `<noscript><style>${noScriptCss()}</style></noscript>`,
    '</head>',
    '<body>',
    `<div class="${VIEWPORT_CLASS}"><div class="${STAGE_CLASS}" data-width="${size.w}" data-height="${size.h}">`,
    parts.slides,
    '</div></div>',
    parts.chartScript ? `<script data-slidr-charts>${inline(parts.chartScript)}</script>` : '',
    `<script>${inline(parts.script)}</script>`,
    '</body>',
    '</html>',
    '',
  ]
    .filter((line, i, all) => line !== '' || i === all.length - 1)
    .join('\n');
}
