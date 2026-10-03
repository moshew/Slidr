/**
 * The page side of HTML import (SPEC 13.2), in a real browser: a file with scripts runs in a
 * frame, and the calls the agent's tools make are answered from its live DOM.
 */
import { createDeck, Slide } from '@slidr/model';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createImportPage, type ImportPage } from './importPage';
import { testHost } from './testing';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

/** A deck of three slides that its own script shows one at a time, as hand-written decks do. */
const DECK = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>תוכנית עבודה</title>
<style>
  html, body { margin: 0; height: 100%; background: #101828; font-family: Arial, sans-serif; }
  .stage { position: relative; width: 1280px; height: 720px; margin: 0 auto; }
  section { position: absolute; inset: 0; display: none; background: #fdf6e3; padding: 80px; box-sizing: border-box; }
  section.current { display: block; }
  h1 { margin: 0 0 24px; font-size: 64px; color: #1d3557; }
  p { margin: 0; font-size: 32px; line-height: 1.4; color: #333; }
  .counter { position: fixed; bottom: 12px; left: 12px; color: #fff; font-size: 14px; }
</style>
</head>
<body>
<div class="stage">
  <section class="current"><h1>פתיחה</h1><p>שקף ראשון</p></section>
  <section><h1>יעדים</h1><p>שקף שני</p></section>
  <section><h1>סיכום</h1><p>שקף שלישי</p><img src="images/chart.png" alt=""></section>
</div>
<div class="counter">1 / 3</div>
<script>
  window.go = function (n) {
    document.querySelectorAll('section').forEach(function (s, i) { s.classList.toggle('current', i === n); });
    document.querySelector('.counter').textContent = (n + 1) + ' / 3';
  };
  document.title = document.title + ' (נטען)';
</script>
</body>
</html>`;

const bytes = (html: string) => new TextEncoder().encode(html).buffer;

let open: ImportPage | undefined;

function importPage(html: string, options: Partial<Parameters<typeof createImportPage>[0]> = {}) {
  open = createImportPage({
    source: () => Promise.resolve(bytes(html)),
    host: testHost(),
    ...options,
  });
  return open;
}

afterEach(() => {
  open?.dispose();
  open = undefined;
});

describe('an imported file in its frame', () => {
  it('runs its scripts, from an address of its own that reaches no file beside it', async () => {
    const imported = importPage(DECK);
    const facts = await imported.evaluate(
      'return { title: document.title, protocol: location.protocol, framed: window.top !== window, go: typeof window.go, storage: typeof localStorage, size: [innerWidth, innerHeight] }',
    );
    expect(JSON.parse(facts)).toEqual({
      title: 'תוכנית עבודה (נטען)',
      protocol: 'blob:',
      framed: true,
      go: 'function',
      storage: 'object',
      size: [1920, 1080],
    });
  });

  it('outlines the live page, with what it could not load', async () => {
    const imported = importPage(DECK);
    const outline = await imported.inspect({ depth: 3 });
    expect(outline).toContain('"title": "תוכנית עבודה (נטען)"');
    expect(outline).toContain('"viewport": "1920x1080"');
    expect(outline).toContain('"dir": "rtl"');
    // A file beside the source was not taken along, and the page has nowhere to ask for it.
    expect(outline).toMatch(/"filesBesideTheSourceThatDidNotLoad": \[\s*"images\/chart\.png"/);
    expect(outline).toMatch(/section\.current \[1280x720 @320,0\] children:2 \(absolute\)/);
    expect(outline).toMatch(/section \[0x0 @0,0\] children:2 \(display:none, absolute\)/);
    expect(outline).toContain('div.counter');

    // A subtree alone, without the page facts.
    const stage = await imported.inspect({ selector: '.stage', depth: 1 });
    expect(stage.startsWith('div.stage [1280x720 @320,0] children:3')).toBe(true);
    await expect(imported.inspect({ selector: '.nowhere' })).rejects.toThrow(
      'No element matches the selector ".nowhere".',
    );
  });

  it('returns what the code returns: elements by name, long things cut, errors as text', async () => {
    const imported = importPage(DECK);
    expect(await imported.evaluate('return document.querySelectorAll("section")')).toBe(
      '["<section.current>","<section>","<section>"]',
    );
    expect(
      await imported.evaluate('go(2); return document.querySelector(".counter").textContent'),
    ).toBe('"3 / 3"');
    expect(await imported.evaluate('await new Promise((r) => setTimeout(r, 20)); return 7')).toBe(
      '7',
    );
    expect(await imported.evaluate('document.body.dataset.x = "1"')).toBe('undefined');
    const long = await imported.evaluate('return "x".repeat(5000)');
    expect(long).toMatch(/^"x{2000}… \(5000 characters\)"$/);
    await expect(imported.evaluate('return missing.thing')).rejects.toThrow(
      /ReferenceError: missing is not defined/,
    );
    await expect(imported.evaluate('return (')).rejects.toThrow(/The code does not parse/);
  });

  it('resizes the page the file sees', async () => {
    const imported = importPage(DECK);
    expect(await imported.setViewport({ width: 1280, height: 720 })).toBe(
      'viewport 1280x720; the page is 1280x720',
    );
    expect(await imported.evaluate('return [innerWidth, innerHeight]')).toBe('[1280,720]');
    const outline = await imported.inspect({ selector: '.stage', depth: 0 });
    expect(outline).toMatch(/^div\.stage \[1280x720 @0,0\]/);
  });

  it('pictures the viewport or one element', async () => {
    const imported = importPage(DECK);
    const whole = await imported.screenshot({ maxWidth: 960 });
    expect([whole.width, whole.height]).toEqual([960, 540]);
    expect(whole.png.type).toBe('image/png');
    const one = await imported.screenshot({ selector: 'section.current', maxWidth: 1920 });
    expect([one.width, one.height]).toEqual([1280, 720]);
  });
});

describe('capturing an element as a slide', () => {
  it('brings the slide into view with `before`, converts it, and matches the source', async () => {
    const imported = importPage(DECK);
    await imported.setViewport({ width: 1280, height: 720 });
    const deck = createDeck({ lang: 'he' });
    const taken = ['e_taken001'];
    const captured = await imported.capture({
      js: 'document.querySelectorAll("section")[1]',
      before: 'go(1); document.querySelector(".counter").style.display = "none";',
      deck,
      takenIds: taken,
    });
    expect(Slide.safeParse(captured.slide).error?.issues).toBeUndefined();
    expect(captured.guard).toMatchObject({ faithful: true, exact: true, wholeSlide: false });
    expect(captured.editability).toBe(1);
    expect(captured.textEditability).toBe(1);
    expect(captured.source).toEqual({ width: 1280, height: 720 });
    const texts = captured.slide.elements.flatMap((element) =>
      element.type === 'text'
        ? [element.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')]
        : [],
    );
    expect(texts).toEqual(['יעדים', 'שקף שני']);
    // The slide fills the deck's 1920x1080: a 1280x720 source is drawn one and a half times larger.
    const title = captured.slide.elements.find((element) => element.type === 'text')!;
    expect(title.frame.x + title.frame.w).toBeCloseTo(1920 - 80 * 1.5, 0);
    // The fonts of an imported slide are assets or the system's: nothing goes into slide css.
    expect(captured.slide.css).toBeUndefined();
  });

  it('refuses an element that is hidden, and one that does not fit the viewport', async () => {
    const imported = importPage(DECK);
    const deck = createDeck({ lang: 'he' });
    await expect(
      imported.capture({ js: 'document.querySelectorAll("section")[2]', deck, takenIds: [] }),
    ).rejects.toThrow(/The element has no size \(0x0\): it is hidden or not laid out/);
    await imported.setViewport({ width: 800, height: 600 });
    await expect(
      imported.capture({ selector: 'section.current', deck, takenIds: [] }),
    ).rejects.toThrow(
      /The element is 1280x720 CSS px .* the page's viewport is 800x600: part of it lies outside/,
    );
    await expect(imported.capture({ deck, takenIds: [] })).rejects.toThrow(
      'Give `selector` or `js` for the element.',
    );
    await expect(
      imported.capture({ selector: 'section', before: 'go(', deck, takenIds: [] }),
    ).rejects.toThrow(/The code does not parse/);
  });

  it('scrolls a part of a long page into view before it pictures it', async () => {
    const long = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Arial, sans-serif; }
      .part { height: 720px; padding: 60px; box-sizing: border-box; font-size: 40px; }
      .a { background: #e0f2fe; } .b { background: #fef9c3; } .c { background: #dcfce7; }
    </style></head><body>
      <div class="part a">Opening</div><div class="part b">Middle</div><div class="part c">Closing</div>
    </body></html>`;
    const imported = importPage(long);
    await imported.setViewport({ width: 1280, height: 720 });
    const captured = await imported.capture({
      selector: '.c',
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    expect(captured.guard.faithful).toBe(true);
    expect(await imported.evaluate('return Math.round(scrollY)')).toBe('1440');
    expect(captured.source.height).toBe(720);
    const text = captured.slide.elements.find((element) => element.type === 'text');
    expect(text?.type === 'text' && text.content.paragraphs[0]?.runs[0]?.text).toBe('Closing');
    expect(captured.editability).toBe(1);
  });

  it('says what the page draws over the element without being part of it', async () => {
    const imported = importPage(DECK);
    await imported.setViewport({ width: 1280, height: 720 });
    const deck = createDeck({ lang: 'he' });
    // The page counter is a sibling of the stage, fixed over every slide's corner.
    await expect(
      imported.capture({ selector: 'section.current', deck, takenIds: [] }),
    ).rejects.toThrow(
      /Drawn over the element without being part of it: div\.counter \[\d+x\d+ @\d+,\d+\] "1 \/ 3"\. .* hide it in `before`; if it belongs to the slide, capture an element that contains it\./,
    );
    // Hidden, it is no longer in the way; contained in what is captured, it is part of the slide.
    const hidden = await imported.capture({
      selector: 'section.current',
      before: 'document.querySelector(".counter").style.visibility = "hidden";',
      deck,
      takenIds: [],
    });
    expect(hidden.guard.faithful).toBe(true);
    const whole = await imported.capture({
      selector: 'body',
      before: 'document.querySelector(".counter").style.visibility = "";',
      deck,
      takenIds: hidden.slide.elements.map((element) => element.id),
    });
    expect(whole.guard.faithful).toBe(true);
    expect(JSON.stringify(whole.slide)).toContain('1 / 3');
  });

  it('keeps the end of an entrance animation, and an animation that never ends as it is', async () => {
    const animated = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Arial, sans-serif; }
      .slide { width: 1280px; height: 720px; background: #f8fafc; padding: 60px; box-sizing: border-box; }
      @keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
      @keyframes pulse { 50% { opacity: 0.4; } }
      .card { opacity: 0; animation: rise 0.2s ease-out forwards; background: #fff; border: 2px solid #94a3b8; padding: 24px; width: 500px; }
      .card h2 { margin: 0 0 12px; font-size: 40px; color: #0f172a; }
      .card p { margin: 0; font-size: 24px; color: #334155; }
      .dot { width: 40px; height: 40px; margin-top: 40px; border-radius: 50%; background: #dc2626; animation: pulse 1s infinite; }
    </style></head><body>
      <div class="slide"><div class="card"><h2>Entrance</h2><p>Shown once it has risen.</p></div><div class="dot"></div></div>
    </body></html>`;
    const imported = importPage(animated);
    await imported.setViewport({ width: 1280, height: 720 });
    const captured = await imported.capture({
      selector: '.slide',
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    expect(captured.guard.faithful).toBe(true);
    // The card that rose into place is a box and two texts, not a block of HTML that animates.
    const texts = captured.slide.elements.filter((element) => element.type === 'text');
    expect(texts).toHaveLength(2);
    expect(captured.textEditability).toBe(1);
    const written = JSON.stringify(captured.slide);
    expect(written).not.toMatch(/keyframes rise|[^"]* rise"/);
    expect(written).toContain('"animation":"1s infinite pulse"');
    expect(captured.slide.css).toContain('@keyframes pulse');
  });

  it('takes statements that return the element where an expression was asked for', async () => {
    const imported = importPage(DECK);
    await imported.setViewport({ width: 1280, height: 720 });
    const captured = await imported.capture({
      js: 'document.querySelector(".counter").style.display = "none"; go(1); return document.querySelector("section.current");',
      deck: createDeck({ lang: 'he' }),
      takenIds: [],
    });
    expect(captured.guard.faithful).toBe(true);
    await expect(
      imported.capture({ js: 'go(', deck: createDeck({ lang: 'he' }), takenIds: [] }),
    ).rejects.toThrow(/"js" failed: SyntaxError.* what changes the page belongs in `before`/);
  });
});
