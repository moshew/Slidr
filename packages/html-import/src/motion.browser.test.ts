/**
 * Motion carried over by an import (SPEC 13.3), in a real browser: the page is watched while a
 * slide comes in, and the slide keeps the transition and the entrances the file played, with
 * the file's own keyframes and timing. The deck is one of the import test set
 * (`apps/desktop/e2e/import-set/canvas-animations.html`): slide 4 cross-fades in over 0.35 s,
 * its heading slides in from the left, and four cards rise one after another.
 */
import { createDeck, walkElements, type Element, type Slide } from '@slidr/model';
import { renderSlideOffscreen, type OffscreenSlide } from '@slidr/renderer';
import { createTimeline } from '@slidr/runtime';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createImportPage, type ImportPage } from './importPage';
import { testHost } from './testing';

/** Vite's own additions to `import.meta`, which this package's types do not know. */
interface ViteMeta {
  glob(pattern: string, options: object): Record<string, string>;
}
const [CANVAS] = Object.values(
  (import.meta as unknown as ViteMeta).glob(
    '../../../apps/desktop/e2e/import-set/canvas-animations.html',
    { query: '?raw', import: 'default', eager: true },
  ),
);

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

const bytes = (html: string) => new TextEncoder().encode(html).buffer;

let open: ImportPage | undefined;
let drawn: OffscreenSlide | undefined;

function importPage(html: string): ImportPage {
  open = createImportPage({ source: () => Promise.resolve(bytes(html)), host: testHost() });
  return open;
}

afterEach(() => {
  open?.dispose();
  open = undefined;
  drawn?.dispose();
  drawn = undefined;
});

/** The player chrome of the deck, which is not part of a slide. */
const NO_CHROME =
  "for (const el of document.querySelectorAll('.brand, .pager, .progress')) el.style.display = 'none';";

const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 1;

function elementOf(slide: Slide, id: string): Element | undefined {
  return Array.from(walkElements(slide.elements)).find((e) => e.id === id);
}

describe('the motion of an imported slide', () => {
  it('keeps the transition into the slide and the entrances on it, as the file played them', async () => {
    const imported = importPage(CANVAS!);
    // The slide before is on screen, as the capture of slide 3 leaves the page.
    await imported.evaluate(
      `${NO_CHROME} goTo(2); await new Promise((r) => setTimeout(r, 600)); return true;`,
    );
    const deck = createDeck({ lang: 'en' });
    const captured = await imported.capture({
      selector: '.slide.active',
      before: 'goTo(3);',
      deck,
      takenIds: [],
    });

    expect(captured.guard.faithful).toBe(true);
    // Both slides fade, the one that leaves and the one that comes: a cross-fade of 0.35 s.
    expect(captured.slide.transition).toEqual({
      type: 'crossfade',
      duration: 350,
      easing: 'ease',
      advance: { onClick: true },
    });

    const { timeline } = captured.slide;
    // The heading slides in; the four cards rise 0.18 s apart. In the deck the steps start once
    // the transition has ended, so the cards' 0.35 s lead is spent by then.
    expect(timeline).toHaveLength(5);
    expect(timeline.every((s) => s.trigger === 'withPrevious' && s.category === 'entrance')).toBe(
      true,
    );
    expect(timeline.map((s) => s.duration)).toEqual([700, 800, 800, 800, 800]);
    const delays = timeline.map((s) => s.delay);
    [0, 0, 180, 360, 540].forEach((expected, i) => expect(near(delays[i]!, expected)).toBe(true));
    expect(timeline[0]!.easing).toBe('linear');

    const [heading, card] = timeline;
    expect(heading!.preset).toMatch(/^css:slidr-/);
    expect(card!.preset).not.toBe(heading!.preset);
    // The heading is text, and each card a box with its texts on it, which enters as the one
    // thing it is. An entrance that has ended lets go of its element, so it is not drawn on a
    // layer of its own and kept as html for the way its text is drawn there.
    expect(elementOf(captured.slide, heading!.elementId)?.type).toBe('text');
    expect(timeline.slice(1).map((s) => elementOf(captured.slide, s.elementId)?.type)).toEqual([
      'group',
      'group',
      'group',
      'group',
    ]);
    // The keyframes the steps play travel with the slide, written as the file wrote them.
    const css = captured.slide.css ?? '';
    const name = (preset: string) => preset.slice('css:'.length);
    expect(css).toContain(`@keyframes ${name(heading!.preset)}`);
    expect(css).toMatch(/translateX\(-120px\)/);
    expect(css).toMatch(/translateY\(80px\)/);
    expect(css).toContain('cubic-bezier(0.2, 0.7, 0.2, 1)');
  });

  it('plays the steps it kept with the keyframes of the file', async () => {
    const imported = importPage(CANVAS!);
    await imported.evaluate(
      `${NO_CHROME} goTo(2); await new Promise((r) => setTimeout(r, 600)); return true;`,
    );
    const deck = createDeck({ lang: 'en' });
    const captured = await imported.capture({
      selector: '.slide.active',
      before: 'goTo(3);',
      deck,
      takenIds: [],
    });
    imported.dispose();
    open = undefined;

    drawn = await renderSlideOffscreen(
      { deck: { ...deck, slides: [captured.slide] }, slide: captured.slide, mode: 'present' },
      { hidden: false },
    );
    const timeline = createTimeline(drawn.root, captured.slide.timeline, {
      size: { w: 1920, h: 1080 },
    });
    expect(timeline.clicks).toBe(0);
    timeline.apply(0);
    const node = (step: number) =>
      drawn!.root.querySelector<HTMLElement>(
        `[data-element-id="${captured.slide.timeline[step]!.elementId}"]`,
      )!;
    expect(getComputedStyle(node(1)).visibility).toBe('hidden');
    const playing = timeline.play(0);
    // Every step plays the keyframes it names, not a fallback: the first card rises 80 px.
    const moves = node(1)
      .getAnimations()
      .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
      .map((k) => k.transform);
    expect(moves).toContain('translateY(80px)');
    for (const a of node(1).getAnimations()) a.currentTime = 400;
    expect(Number(getComputedStyle(node(1)).opacity)).toBeGreaterThan(0.2);
    expect(Number(getComputedStyle(node(1)).opacity)).toBeLessThan(1);
    // The last card waits for its turn.
    for (const a of node(4).getAnimations()) a.currentTime = 400;
    expect(getComputedStyle(node(4)).visibility).toBe('hidden');
    timeline.finish();
    await playing;
    for (let i = 0; i < 5; i++) expect(getComputedStyle(node(i)).visibility).toBe('visible');
  });

  it('takes the agent’s mark for when a step plays, and the page’s motion for how', async () => {
    const deckHtml = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Arial, sans-serif; }
      .slide { width: 1920px; height: 1080px; background: #0f172a; padding: 120px; box-sizing: border-box; color: #f8fafc; }
      h1 { margin: 0 0 60px; font-size: 80px; }
      .step { width: 900px; font-size: 44px; margin: 0 0 30px; opacity: 0; transform: translateY(40px); transition: opacity 0.4s ease-out, transform 0.4s ease-out; }
      .step.shown { opacity: 1; transform: none; }
    </style></head><body>
      <div class="slide"><h1>Three steps</h1>
        <p class="step">Plan the route</p><p class="step">Book the bikes</p><p class="step">Ride</p>
      </div>
    </body></html>`;
    const imported = importPage(deckHtml);
    const captured = await imported.capture({
      selector: '.slide',
      before: `document.querySelectorAll('.step').forEach((el, i) => {
        el.classList.add('shown');
        el.dataset.slidrAnim = JSON.stringify({ order: i + 1 });
      });`,
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    expect(captured.slide.transition).toBeUndefined();
    const { timeline } = captured.slide;
    expect(timeline.map((s) => [s.trigger, s.duration, s.delay, s.easing])).toEqual([
      ['onClick', 400, 0, 'ease-out'],
      ['onClick', 400, 0, 'ease-out'],
      ['onClick', 400, 0, 'ease-out'],
    ]);
    expect(timeline.every((s) => s.preset.startsWith('css:slidr-'))).toBe(true);
    expect(captured.slide.css).toMatch(/translateY\(40px\)|matrix\(1, 0, 0, 1, 0, 40\)/);
    // The marks are the page's for one capture only.
    expect(
      await imported.evaluate("return document.querySelectorAll('[data-slidr-anim]').length"),
    ).toBe('0');
  });
});
