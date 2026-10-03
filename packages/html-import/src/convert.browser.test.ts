/**
 * The conversion on slides written as HTML: what becomes which element, and that every slide
 * ends up looking like its source. Runs in a real browser (the engine WebView2 uses): the
 * engine measures what the browser laid out and compares pictures of what it painted.
 *
 * The figures printed at the end (editability, time per slide) are the ones ADR-017 quotes.
 * Run with `--silent=false` to see them.
 */
import {
  createDeck,
  plainText,
  Slide,
  type AssetMeta,
  type Deck,
  type Element,
  type ShapeElement,
  type TextElement,
} from '@slidr/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { ConversionResult } from './engine';
import * as fixtures from './fixtures';
import { openSandbox } from './sandbox';
import { convertHtml } from './service';
import { testHost, testImage, withAssets } from './testing';

const ROCKET =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19l4-1 9-9a3 3 0 0 0-4-4l-9 9-1 4z"/></svg>';

const host = testHost({ 'lucide:rocket': ROCKET });
const report: string[] = [];
let png = '';
let asset: AssetMeta;
let english: Deck;
let hebrew: Deck;

beforeAll(async () => {
  await page.viewport(1920, 1080);
  png = testImage(640, 400);
  const bytes = new Uint8Array(await (await fetch(png)).arrayBuffer());
  asset = await host.storeAsset(bytes, { mime: 'image/png', name: 'team.png' });
  english = withAssets(createDeck({ lang: 'en' }), [asset]);
  hebrew = withAssets(createDeck({ lang: 'he' }), [asset]);
});

afterAll(() => {
  const header = 'fixture | editability | text | engine ms | with loading ms | rounds | elements';
  console.log([header, ...report].join('\n'));
});

async function convert(
  name: string,
  html: string,
  deck: Deck = english,
): Promise<ConversionResult> {
  const started = performance.now();
  const result = await convertHtml(html, deck, host, deck.size);
  const total = Math.round(performance.now() - started);
  const counts: Record<string, number> = {};
  for (const e of result.slide.elements) counts[e.type] = (counts[e.type] ?? 0) + 1;
  report.push(
    [
      name,
      `${(result.editability * 100).toFixed(0)}%`,
      `${(result.textEditability * 100).toFixed(0)}%`,
      result.ms,
      total,
      result.guard.rounds,
      Object.entries(counts)
        .map(([type, n]) => `${n} ${type}`)
        .join(', '),
    ].join(' | '),
  );
  // Whatever came out is a slide the model accepts.
  expect(Slide.safeParse(result.slide).error?.issues).toBeUndefined();
  expect(result.guard.faithful).toBe(true);
  return result;
}

const texts = (r: ConversionResult) =>
  r.slide.elements.filter((e): e is TextElement => e.type === 'text');
const shapes = (r: ConversionResult) =>
  r.slide.elements.filter((e): e is ShapeElement => e.type === 'shape');
const textOf = (e: TextElement) => plainText(e.content);
const byText = (r: ConversionResult, text: string) => {
  const found = texts(r).find((e) => textOf(e).includes(text));
  if (!found) throw new Error(`no text element with "${text}"`);
  return found;
};
const runs = (e: TextElement) => e.content.paragraphs.flatMap((p) => p.runs);
const fillColor = (e: Element) =>
  e.type === 'shape' && e.fill.kind === 'solid' ? e.fill.color : undefined;

describe('layouts and text', () => {
  it('converts an English slide laid out with absolute positions', async () => {
    const r = await convert('English, absolute', fixtures.englishAbsolute);
    expect(r.editability).toBe(1);
    expect(r.guard).toMatchObject({ rounds: 1, fallbacks: [], exact: true, diffPixels: 0 });
    // The box that fills the slide is its background, not a shape.
    expect(r.slide.background?.fill).toMatchObject({ kind: 'linear', angle: 135 });

    const title = byText(r, 'Quarterly results');
    expect(title.frame.x).toBe(120);
    // A single line is stored so that it can never wrap.
    expect(title.wrap).toBe(false);
    // The theme's title style is bold already: the weight needs no mark.
    expect(title.content.paragraphs[0]!.styleRef).toBe('title');
    expect(runs(title)[0]!.marks).toEqual({ font: 'Arial', size: 96, color: { value: '#ffffff' } });

    const body = byText(r, 'Revenue grew');
    expect(body.wrap).toBeUndefined();
    expect(body.frame).toMatchObject({ x: 120, w: 900 });
    expect(body.content.paragraphs[0]).toMatchObject({
      dir: 'ltr',
      align: 'start',
      lineHeight: 1.5,
    });
    expect(runs(body).map((run) => [run.text, run.marks?.italic ?? false])).toEqual([
      ['Revenue grew by a third while costs stayed flat, and the new product line reached ', false],
      ['break-even', true],
      [' two quarters early.', false],
    ]);

    const [card] = shapes(r);
    expect(card).toMatchObject({
      frame: { x: 1280, y: 300, w: 520, h: 360 },
      fill: { kind: 'solid', color: { value: '#ffffff' } },
      // A box shadow of 40px blur is a drop shadow of 20: the renderer draws the latter.
      effects: {
        radius: 24,
        shadow: { x: 0, y: 20, blur: 20, color: { value: '#000000', alpha: 0.35 } },
      },
    });
  });

  it('converts a Hebrew slide laid out with flex, and keeps what it took from the theme', async () => {
    const r = await convert('Hebrew, flex, theme variables', fixtures.hebrewFlex, hebrew);
    expect(r.editability).toBe(1);
    expect(r.slide.archetype).toBe('textImage');
    expect(r.slide.background).toEqual({ fill: { kind: 'solid', color: { token: 'bg' } } });
    for (const text of texts(r)) expect(text.content.paragraphs[0]!.dir).toBe('rtl');

    // Text in the theme's heading font, size and weight needs one mark only: its colour.
    const title = byText(r, 'המטרות שלנו');
    expect(title.role).toBe('title');
    expect(title.content.paragraphs[0]!.styleRef).toBe('title');
    expect(runs(title)[0]!.marks).toEqual({ color: { token: 'primary' } });
    expect(byText(r, 'שלושה יעדים').role).toBe('subtitle');

    // Each list item is a text box with a bullet; the role of the list reaches its items.
    const items = texts(r).filter((e) => e.content.paragraphs[0]!.list);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.role).toBe('body');
      expect(item.content.paragraphs[0]!.list).toEqual({ kind: 'bullet', level: 0 });
    }
    expect(runs(items[1]!).map((run) => [run.text, run.marks?.weight])).toEqual([
      ['שיפור זמני התגובה ב-', undefined],
      ['40%', 700],
    ]);

    // A pill: the radius CSS shrinks to half the height.
    const [tag] = shapes(r);
    expect(tag!.fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
    expect(tag!.effects!.radius).toBeCloseTo(tag!.frame.h / 2, 0);
  });

  it('converts a grid of cards with inline SVG icons', async () => {
    const r = await convert('grid, cards, SVG', fixtures.gridCards);
    expect(r.editability).toBe(1);
    expect(shapes(r)).toHaveLength(3);
    for (const card of shapes(r)) {
      expect(card).toMatchObject({
        stroke: { color: { value: '#e2e8f0' }, width: 2 },
        effects: { radius: 20 },
      });
    }
    const icons = r.slide.elements.filter((e) => e.type === 'svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon.frame).toMatchObject({ w: 64, h: 64 });
      // Drawn in `currentColor`: the colour is kept apart, so the icon can follow the theme.
      expect(icon.colorOverrides).toEqual({ currentColor: { value: '#2563eb' } });
      expect(icon.markup).toContain('currentcolor');
    }
    // A paint a stylesheet gave (the class `dot`) travels with the markup.
    expect(icons[1]!.markup).toContain('rgb(245, 158, 11)');
  });
});

describe('the sandbox', () => {
  it('draws the theme fonts registered in the page around it', async () => {
    // A frame does not see the faces of the page it sits in; the engine hands them over.
    const registered = document.createElement('style');
    registered.textContent = '@font-face { font-family: "Host Serif"; src: local("Georgia"); }';
    document.head.append(registered);
    const serif = { he: 'Host Serif', latin: 'Host Serif' };
    const deck = {
      ...english,
      theme: { ...english.theme, fonts: { heading: serif, body: serif } },
    };
    try {
      const r = await convert(
        'theme font of the page',
        `<div style="position:relative;width:1920px;height:1080px;overflow:hidden">
          <h1 style="margin:100px;font-family:var(--font-heading);font-size:72px;font-weight:700;line-height:1.1">Set in the theme's own font</h1>
        </div>`,
        deck,
      );
      // Had the frame drawn a fallback font, the lines would differ and the text would be HTML.
      expect(r.editability).toBe(1);
      expect(runs(byText(r, 'Set in the theme'))).toEqual([
        { text: "Set in the theme's own font" },
      ]);
    } finally {
      registered.remove();
    }
  });

  it('runs no code and loads nothing from outside (SEC-03, IMP-08)', async () => {
    const surface = document.createElement('div');
    surface.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
    document.body.append(surface);
    const sandbox = await openSandbox(
      `<script>document.documentElement.dataset.ran = 'script'</script>
       <img id="outside" src="https://example.com/picture.png" onerror="document.documentElement.dataset.ran = 'handler'">
       <p>Text</p>`,
      { deck: english, host, size: english.size, parent: surface },
    );
    try {
      const doc = sandbox.document;
      expect(sandbox.frame.getAttribute('sandbox')).toBe('allow-same-origin');
      expect(doc.querySelector('script')).toBeNull();
      expect(doc.documentElement.dataset.ran).toBeUndefined();
      expect(doc.querySelector<HTMLImageElement>('#outside')!.naturalWidth).toBe(0);
      // The page is laid out as a slide, with the theme's variables on its root.
      expect(doc.body.getBoundingClientRect()).toMatchObject({ width: 1920, height: 1080 });
      expect(getComputedStyle(doc.documentElement).getPropertyValue('--color-primary')).toBe(
        english.theme.colors.primary,
      );
    } finally {
      sandbox.dispose();
      surface.remove();
    }
  });
});

describe('fills, pictures and CSS without a field', () => {
  it('turns gradients into fills where the model has their shape, and keeps the CSS where not', async () => {
    const r = await convert('gradients', fixtures.gradients);
    expect(r.editability).toBe(1);
    const fills = shapes(r).map((s) => s.fill);
    expect(fills[0]).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { color: { value: '#ef4444' }, at: 0 },
        { color: { value: '#f59e0b' }, at: 0.4 },
        { color: { value: '#10b981' }, at: 1 },
      ],
    });
    expect(fills[1]).toMatchObject({ kind: 'radial' });
    expect(fills[2]).toMatchObject({ kind: 'conic', angle: 90 });
    expect(shapes(r)[2]!.geometry).toEqual({ kind: 'preset', preset: 'ellipse' });
    // "to bottom right" depends on the box: the angle is worked out from its sides.
    expect(fills[3]).toMatchObject({
      kind: 'linear',
      stops: [{ color: { alpha: 0.9 } }, { color: { alpha: 0.1 } }],
    });
    expect(fills[4]).toMatchObject({ kind: 'css' });
    expect(fills[5]).toMatchObject({ kind: 'css' });
    // Text shown through a gradient: the gradient travels in `css`.
    expect(byText(r, 'Gradient text').css).toMatchObject({ 'background-clip': 'text' });
  });

  it('stores pictures as assets and places them as the browser did', async () => {
    const r = await convert('images', fixtures.images(png));
    expect(r.editability).toBe(1);
    // The same picture six times is one asset; it is already in the deck, so nothing is new.
    expect(r.assets).toEqual([]);
    const images = r.slide.elements.filter((e) => e.type === 'image');
    expect(images).toHaveLength(5);
    expect(images[0]).toMatchObject({
      assetId: asset.id,
      fit: 'cover',
      alt: 'Team at work',
      frame: { x: 100, y: 100, w: 700, h: 500 },
      effects: { radius: 28, shadow: { blur: 16 } },
    });
    expect(images[1]).toMatchObject({ fit: 'contain' });
    // A border lies outside the picture: the frame is the picture, the border a ring around it.
    expect(images[2]).toMatchObject({
      frame: { x: 1406, y: 106, w: 400, h: 250 },
      css: { 'box-shadow': '0 0 0 6px rgb(28, 25, 23)' },
    });
    expect(images[3]).toMatchObject({ mask: { kind: 'ellipse' } });
    // An image that waits for its picture: a placeholder with the prompt, no asset.
    expect(images[4]).toMatchObject({
      prompt: 'A lighthouse at dusk, flat illustration',
      name: 'hero-image',
    });
    expect(images[4]!.assetId).toBeUndefined();
    expect(shapes(r)[0]!.fill).toEqual({ kind: 'image', assetId: asset.id, fit: 'cover' });
  });

  it('passes on CSS the model has no field for, and puts keyframes on the slide', async () => {
    const r = await convert('CSS passthrough', fixtures.passthrough);
    expect(r.editability).toBe(1);
    const title = byText(r, 'Passthrough');
    expect(title.css).toEqual({ 'text-shadow': 'rgba(0, 0, 0, 0.6) 0px 6px 18px' });
    expect(runs(title)[0]!.marks).toMatchObject({ letterSpacing: 4, case: 'upper' });
    const css = shapes(r).map((s) => s.css ?? {});
    expect(css[0]).toEqual({ filter: 'blur(40px)' });
    expect(css[1]).toEqual({ 'mix-blend-mode': 'screen' });
    expect(css[2]).toHaveProperty('clip-path');
    expect(css[3]).toHaveProperty('animation');
    expect(r.slide.css).toMatch(/^@keyframes pulse/);
    // Borders on two sides only: the model has one outline for the whole box.
    expect(css[4]).toEqual({
      'border-bottom': '8px solid rgb(52, 211, 153)',
      'border-left': '8px solid rgb(52, 211, 153)',
    });
    // A turn is a field of the model.
    expect(byText(r, 'Tilted').rotation).toBe(-8);
  });

  it('carries a font the HTML defines itself on the slide', async () => {
    const r = await convert('own @font-face', fixtures.ownFont);
    expect(r.editability).toBe(1);
    expect(runs(byText(r, 'Set in its own font'))[0]!.marks).toMatchObject({
      font: 'Fixture Mono',
    });
    // Without the rule the renderer would draw the text in another font, and the guard would say so.
    expect(r.slide.css).toMatch(
      /^@font-face \{ font-family: "Fixture Mono"; src: local\("Courier New"\); \}$/,
    );
  });
});

describe('what the browser paints, and in which order', () => {
  it('orders elements by stacking context, not by z-index alone', async () => {
    const r = await convert('stacking contexts', fixtures.stacking);
    expect(r.editability).toBe(1);
    expect(r.slide.background?.fill).toEqual({ kind: 'solid', color: { value: '#ffffff' } });
    // z-index 5 inside a context of z-index 0 lies under z-index 1 outside it; the negative
    // one lies under everything but the slide; 100 inside the blue box stays inside it.
    expect(shapes(r).map((s) => fillColor(s))).toEqual([
      { value: '#fecaca' },
      { value: '#bfdbfe' },
      { value: '#10b981' },
      { value: '#1d4ed8' },
      { value: '#fbbf24' },
    ]);
    expect(r.slide.elements.at(-1)).toMatchObject({ type: 'text' });
    expect(shapes(r)[3]!.opacity).toBeCloseTo(0.999, 2);
  });

  it('leaves out what is in the DOM and not on screen', async () => {
    const r = await convert('hidden content', fixtures.hidden);
    expect(texts(r).map(textOf)).toEqual(['The only visible line', 'but this part shows']);
    expect(r.slide.elements).toHaveLength(2);
  });

  it('keeps boxes drawn by pseudo-elements as HTML and reads generated text', async () => {
    const r = await convert('pseudo-elements', fixtures.pseudo);
    // The bar of the heading has no box to measure: the heading's own box stays HTML, its text converts.
    const kept = r.slide.elements.filter((e) => e.type === 'html');
    expect(kept).toHaveLength(1);
    expect(kept[0]!.markup).toContain('<h1');
    expect(kept[0]!.markup).not.toContain('A bar drawn by CSS');
    expect(byText(r, 'A bar drawn by CSS').frame.x).toBe(160);
    expect(runs(byText(r, 'First do this'))).toEqual([
      { text: '→ ', marks: { font: 'Arial', size: 40, color: { value: '#dc2626' } } },
      { text: 'First do this', marks: { font: 'Arial', size: 40, color: { value: '#111111' } } },
    ]);
    expect(textOf(byText(r, 'Make it simple'))).toBe('Make it simple ”');
    expect(r.editability).toBe(0.8);
    expect(r.textEditability).toBe(1);
  });

  it('converts content inside a scaled stage, and says the comparison was not exact', async () => {
    const r = await convert('nested scale', fixtures.nestedScale);
    expect(r.guard.exact).toBe(false);
    // Lengths read from styles take the scale: 100px text at 0.8 is 80.
    expect(runs(byText(r, 'Scaled stage'))[0]!.marks).toMatchObject({ size: 80 });
    expect(runs(byText(r, 'Everything in here'))[0]!.marks).toMatchObject({ size: 32 });
    expect(byText(r, 'Everything in here').frame).toMatchObject({ x: 240, w: 880 });
    expect(shapes(r)[0]!.frame).toEqual({ x: 160, y: 90, w: 1600, h: 900 });
    expect(r.textEditability).toBe(1);
  });

  it('converts tables, whatever they are made of, into table elements', async () => {
    const r = await convert('tables', fixtures.tables);
    expect(r.editability).toBe(1);
    const tables = r.slide.elements.filter((e) => e.type === 'table');
    expect(tables).toHaveLength(2);
    const [byTags, byDisplay] = tables;
    expect(byTags!.rows).toHaveLength(4);
    expect(byTags!.cols).toHaveLength(3);
    expect(byTags!.cells[0]![0]).toMatchObject({
      fill: { kind: 'solid', color: { value: '#1e3a8a' } },
      vAlign: 'middle',
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      borders: { top: { width: 2 } },
    });
    expect(byTags!.cells[1]![1]!.content.paragraphs[0]).toMatchObject({ align: 'end' });
    expect(byTags!.cells[3]![0]).toMatchObject({ colSpan: 2 });
    expect(byTags!.cells[3]![1]).toMatchObject({ merged: true });
    // The second is a table only by `display`.
    expect(byDisplay!.cells.map((row) => row.map((c) => plainText(c.content)))).toEqual([
      ['Plan', 'Free', 'Team'],
      ['Seats', '3', '50'],
    ]);
  });
});

describe('the authoring conventions of SPEC 11.5', () => {
  it('honours data-asset, data-image-prompt, data-chart, data-icon, data-name, data-role, data-anim, data-keep-html and data-archetype', async () => {
    const r = await convert('conventions', fixtures.conventions(asset.id));
    expect(r.slide.archetype).toBe('chart');
    const named = (name: string) => r.slide.elements.find((e) => e.name === name);

    expect(named('headline')).toMatchObject({ type: 'text', role: 'title' });
    expect(named('team-photo')).toMatchObject({
      type: 'image',
      assetId: asset.id,
      role: 'image',
      effects: { radius: 16 },
    });
    expect(named('pending-art')).toMatchObject({
      type: 'image',
      prompt: 'A paper plane over a city, flat style',
    });
    expect(named('sales')).toMatchObject({
      type: 'chart',
      role: 'chart',
      chartType: 'column',
      data: { categories: ['Q1', 'Q2'], series: [{ name: 'Sales', values: [3, 5] }] },
      options: { title: 'Sales', legend: { show: true } },
    });
    expect(named('lucide:rocket')).toMatchObject({
      type: 'svg',
      frame: { w: 96, h: 96 },
      colorOverrides: { currentColor: { token: 'accent' } },
    });
    // On an element that is not an image, the asset is its background.
    expect(named('cover')).toMatchObject({
      type: 'shape',
      fill: { kind: 'image', assetId: asset.id, fit: 'cover' },
    });
    const widget = named('widget');
    expect(widget).toMatchObject({ type: 'html', hasScripts: false });
    expect(r.notes).toContain(`Kept as HTML (element ${widget!.id}): data-keep-html.`);

    expect(r.slide.timeline.map((s) => [s.elementId, s.preset, s.trigger, s.category])).toEqual([
      [named('headline')!.id, 'fade', 'onClick', 'entrance'],
      [widget!.id, 'rise', 'onClick', 'entrance'],
    ]);
  });

  it('links a colour to the theme only where the HTML took it from the theme', async () => {
    const r = await convert('theme variables', fixtures.themeUse);
    // The same blue twice: once through the variable, once written out.
    expect(byText(r, 'Linked to the theme').content.paragraphs[0]).toMatchObject({
      styleRef: 'heading',
      runs: [{ marks: { color: { token: 'primary' } } }],
    });
    expect(runs(byText(r, 'written out'))[0]!.marks).toEqual({ color: { value: '#2f5bea' } });
    // Body text exactly as the theme has it carries no marks at all.
    expect(runs(byText(r, 'Body text'))).toEqual([
      { text: 'Body text exactly as the theme has it' },
    ]);

    const [linked, literal, half] = shapes(r);
    expect(linked).toMatchObject({
      fill: { kind: 'solid', color: { token: 'surface' } },
      stroke: { color: { token: 'accent' }, width: 3 },
    });
    expect(literal!.fill).toEqual({ kind: 'solid', color: { value: '#f3f4f6' } });
    expect(half!.fill).toEqual({ kind: 'solid', color: { token: 'secondary', alpha: 0.4 } });
  });
});
