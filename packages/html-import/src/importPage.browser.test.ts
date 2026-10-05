/**
 * The page side of HTML import (SPEC 13.2), in a real browser: a file with scripts runs in a
 * frame, and the calls the agent's tools make are answered from its live DOM.
 */
import { createDeck, Slide } from '@slidr/model';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { mountSlide } from './engine';
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

  it('says what a returned value is when it has no keys to list', async () => {
    const imported = importPage(DECK);
    // The agent that writes `catch (e) { return e }` to learn why its code failed is told.
    const caught = await imported.evaluate('try { null.x } catch (e) { return e }');
    expect(caught).toMatch(/^"TypeError: .*null/);
    expect(
      JSON.parse(
        await imported.evaluate(
          'return { failed: new RangeError("too far"), own: Object.assign(new Error("with a code"), { code: 7 }), dom: (() => { try { document.querySelector("(") } catch (e) { return e } })() }',
        ),
      ),
    ).toEqual({
      failed: 'RangeError: too far',
      own: 'Error: with a code',
      dom: expect.stringMatching(/^SyntaxError: /) as string,
    });
    expect(await imported.evaluate('return new Date(0)')).toBe('"1970-01-01T00:00:00.000Z"');
    expect(await imported.evaluate('return new Date("no day")')).toBe('"Invalid Date"');
    expect(await imported.evaluate('return /sl[i1]de-\\d+/gi')).toBe('"/sl[i1]de-\\\\d+/gi"');
    expect(await imported.evaluate('return [new Number(5), Promise.resolve(1)]')).toBe(
      '["5","[object Promise]"]',
    );
    // What JSON itself knows how to write is written its way; a plain record stays a record.
    expect(await imported.evaluate('return new URL("https://example.com/a?b=1")')).toBe(
      '"https://example.com/a?b=1"',
    );
    expect(
      JSON.parse(await imported.evaluate('return document.body.getBoundingClientRect()')),
    ).toMatchObject({ x: 0, y: 0, width: 1920 });
    expect(await imported.evaluate('return [{}, { name: "Dana", message: "hello" }]')).toBe(
      '[{},{"name":"Dana","message":"hello"}]',
    );
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
    expect(captured.source).toEqual({ width: 1280, height: 720, scale: 1 });
    const texts = captured.slide.elements.flatMap((element) =>
      element.type === 'text'
        ? [element.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')]
        : [],
    );
    // The title and the line under it are the two paragraphs of one text box (ADR-073).
    expect(texts).toEqual(['יעדים\nשקף שני']);
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

  it('refuses a slide the page does not paint, and names what hides it', async () => {
    // The slides that are not current keep their size, and are hidden twice over: faded out,
    // and skipped by the browser. Undoing the first alone leaves an empty picture.
    const stacked = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Arial, sans-serif; }
      .slide { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; padding: 80px; box-sizing: border-box; background: #fff; font-size: 48px; opacity: 0; content-visibility: hidden; }
      .slide.on { opacity: 1; content-visibility: visible; }
    </style></head><body>
      <div class="slide on">First</div><div class="slide" id="second">Second</div>
    </body></html>`;
    const imported = importPage(stacked);
    await imported.setViewport({ width: 1280, height: 720 });
    const deck = createDeck({ lang: 'en' });
    await expect(imported.capture({ selector: '#second', deck, takenIds: [] })).rejects.toThrow(
      /The element is not shown: div#second\.slide \[1280x720 @0,0\].* has `content-visibility: hidden`\. Bring the slide into view in `before`/,
    );
    await expect(
      imported.capture({
        selector: '#second',
        before: 'document.getElementById("second").style.contentVisibility = "visible";',
        deck,
        takenIds: [],
      }),
    ).rejects.toThrow(/The element is not shown: .* has `opacity: 0`/);
    const captured = await imported.capture({
      selector: '#second',
      before:
        'document.querySelector(".on").classList.remove("on"); document.getElementById("second").classList.add("on");',
      deck,
      takenIds: [],
    });
    expect(captured.guard).toMatchObject({ faithful: true, exact: true });
    expect(captured.editability).toBe(1);
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

  it('captures a part that sits on a fraction of a pixel, as the parts of a real page do', async () => {
    // The parts above are not a whole number of pixels tall, so each part below starts on a
    // fraction: after the scroll, a third and two thirds of a pixel above the viewport's edge.
    const long = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Georgia, serif; color: #1f2a24; }
      .part { height: 700.34px; padding: 50px 60px; box-sizing: border-box; background: #fbf7ef; }
      .part + .part { background: #eef6f0; }
      h2 { margin: 0 0 21.3px; font-size: 41px; line-height: 1.15; }
      h3 { margin: 0 0 9.7px; font-size: 23px; line-height: 1.15; }
      p { margin: 0 0 17.9px; font: 17px/1.6 Arial, sans-serif; max-width: 700px; }
    </style></head><body>
      <div class="part">One</div>
      <div class="part two"><h2>Second part</h2><h3>Shared in real time</h3>
        <p>Anyone at home adds an item and it shows up on every phone within a second.</p>
        <h3>Weekly meal plan</h3><p>Drag recipes onto the days of the week.</p></div>
      <div class="part three"><h2>Third part</h2><h3>Sorted by aisle</h3>
        <p>The list reorders itself to match the layout of your usual shop.</p>
        <h3>Pantry memory</h3><p>Larder remembers what you bought and how long it lasts.</p></div>
    </body></html>`;
    const imported = importPage(long);
    await imported.setViewport({ width: 1280, height: 720 });
    for (const selector of ['.two', '.three']) {
      const captured = await imported.capture({
        selector,
        deck: createDeck({ lang: 'en' }),
        takenIds: [],
      });
      expect(captured.guard).toMatchObject({ faithful: true, exact: true, wholeSlide: false });
      expect(captured.editability).toBe(1);
    }
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

  it('finds what a deck built as a component draws over its slide from inside its shadow tree', async () => {
    // The slides are the component's own children; its counter lives in its shadow tree,
    // ignores the pointer, and is nowhere in the document's own tree.
    const component = `<!doctype html><html><head><style>
      body { margin: 0; font-family: Arial, sans-serif; }
      section { width: 1280px; height: 720px; background: #f1f5f9; padding: 80px; box-sizing: border-box; font-size: 48px; }
    </style></head><body>
      <deck-frame><section>Inside a component</section></deck-frame>
      <script>
        customElements.define('deck-frame', class extends HTMLElement {
          connectedCallback() {
            const tree = this.attachShadow({ mode: 'open' });
            tree.innerHTML = '<style>.pager { position: fixed; left: 560px; top: 660px; width: 160px; height: 36px; background: #0f172a; color: #fff; font-size: 16px; pointer-events: none; }</style><slot></slot><div class="pager">1 / 9</div>';
          }
        });
      </script>
    </body></html>`;
    const imported = importPage(component);
    await imported.setViewport({ width: 1280, height: 720 });
    const deck = createDeck({ lang: 'en' });
    await expect(imported.capture({ selector: 'section', deck, takenIds: [] })).rejects.toThrow(
      /Drawn over the element without being part of it: div\.pager \[160x36 @560,660\] "1 \/ 9"/,
    );
    const captured = await imported.capture({
      selector: 'section',
      before:
        'document.querySelector("deck-frame").shadowRoot.querySelector(".pager").style.display = "none";',
      deck,
      takenIds: [],
    });
    expect(captured.guard).toMatchObject({ faithful: true, exact: true });
    expect(captured.editability).toBe(1);
  });

  it('captures a slide a tool wrapped in an svg, with rules that name the wrapping', async () => {
    // The slide is HTML inside `svg > foreignObject`, every rule is anchored to that wrapping,
    // the page behind the slide is black, and the page number is a pseudo-element.
    const wrapped = `<!doctype html><html><head><style>
      body { margin: 0; background: #000; }
      svg { display: block; width: 1280px; height: 720px; }
      svg > foreignObject > section { width: 1280px; height: 720px; box-sizing: border-box; position: relative; padding: 70px; background: #fff; color: #1f2328; font: 30px Arial, sans-serif; }
      svg > foreignObject > section::after { content: attr(data-page); position: absolute; right: 30px; bottom: 24px; font-size: 22px; color: #777; }
      svg > foreignObject > section h2 { margin: 0 0 30px; font-size: 44px; }
      svg > foreignObject > section table { display: block; overflow: auto; border-collapse: collapse; }
      svg > foreignObject > section td { border: 1px solid #d1d9e0; padding: 8px 16px; }
    </style></head><body>
      <svg viewBox="0 0 1280 720"><foreignObject width="1280" height="720">
        <section data-page="4"><h2>Wrapped by a tool</h2><p>Every rule names the wrapping.</p>
          <table><tbody><tr><td>Spring</td><td>2,410</td></tr><tr><td>Summer</td><td>3,980</td></tr></tbody></table>
        </section>
      </foreignObject></svg>
    </body></html>`;
    const imported = importPage(wrapped);
    await imported.setViewport({ width: 1280, height: 720 });
    const captured = await imported.capture({
      selector: 'section',
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    expect(captured.guard).toMatchObject({ faithful: true, exact: true, wholeSlide: false });
    // The slide's own box, which only HTML can draw (the page number), kept its white
    // background outside its document: its shells are not SVG, which shows nothing when empty.
    const [box, words, table, ...rest] = captured.slide.elements;
    expect(box?.type === 'html' && box.markup).toContain('<slidr-foreignobject');
    expect(box?.type === 'html' && box.markup).not.toContain('<svg');
    // The texts on it were not taken away for a background that was the box's to draw: the
    // heading and the line under it, in one text box.
    expect(words?.type === 'text' && words.content.paragraphs).toHaveLength(2);
    // The rows of a table set to `display: block` stay together, as a table or as its HTML;
    // they are not read as so many loose boxes.
    expect(['table', 'html']).toContain(table?.type);
    expect(rest).toEqual([]);
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
    // The card that rose into place is a box with its two texts on it, in a group, not a
    // block of HTML that animates.
    const card = captured.slide.elements.find((element) => element.type === 'group');
    const [, words] = card?.type === 'group' ? card.children : [];
    expect(card?.type === 'group' && card.children.map((child) => child.type)).toEqual([
      'shape',
      'text',
    ]);
    expect(words?.type === 'text' && words.content.paragraphs).toHaveLength(2);
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

describe('what a file made while it ran, in a region that stays html', () => {
  /** A file with one slide of 1920x1080, and a script that runs when it loads. */
  const file = (body: string, script: string, css = '') => `<!doctype html><html><head><style>
    body{margin:0} section{width:1920px;height:1080px;position:relative;background:#fff;overflow:hidden}
    h1{position:absolute;left:200px;top:60px;margin:0;font:700 64px Arial;color:#111}
    ${css}
  </style></head><body><section>${body}</section><script>${script}</script></body></html>`;

  /** What a packed deck does with a picture it carries: unpacks it, and points at an object URL. */
  const unpack = (apply: string) => `
    const c=document.createElement('canvas');c.width=80;c.height=50;const g=c.getContext('2d');g.fillStyle='#dd0000';g.fillRect(0,0,80,50);
    c.toBlob((b)=>{const u=URL.createObjectURL(b);${apply};document.title='ready';});`;
  const HERO = '.hero{position:absolute;left:200px;top:200px;width:800px;height:500px}';

  async function pixels(blob: Blob): Promise<ImageData> {
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  const at = (picture: ImageData, x: number, y: number) => {
    const i = (y * picture.width + x) * 4;
    return [picture.data[i], picture.data[i + 1], picture.data[i + 2]];
  };

  /**
   * Captures the slide, and then draws it the way the editor will: with the real renderer,
   * from the slide and the assets the capture returned, after the file's page is gone and
   * every object URL it made with it.
   */
  async function captureAndDraw(html: string) {
    const host = testHost();
    const imported = importPage(html, { host });
    await imported.setViewport({ width: 1920, height: 1080 });
    const deck = createDeck({ lang: 'en' });
    const source = await pixels((await imported.screenshot({ maxWidth: 1920 })).png);
    const captured = await imported.capture({ selector: 'section', deck, takenIds: [] });
    imported.dispose();
    open = undefined;
    const mounted = await mountSlide(
      { ...deck, assets: Object.fromEntries(captured.assets.map((a) => [a.id, a])) },
      captured.slide,
      host,
      { origin: { x: 0, y: 0 }, viewScale: 1, k: 1, offX: 0, offY: 0 },
    );
    try {
      await new Promise((done) => setTimeout(done, 300));
      const drawn = await pixels(await host.capture({ x: 0, y: 0, width: 1920, height: 1080 }));
      return { captured, source, drawn, written: JSON.stringify(captured.slide) };
    } finally {
      mounted.dispose();
    }
  }

  it('keeps a picture under a gradient, which the file pointed at by an object URL, as an asset', async () => {
    const { captured, source, drawn, written } = await captureAndDraw(
      file(
        '<h1>Title</h1><div class="hero"></div>',
        unpack(
          `document.querySelector('.hero').style.background='linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.2)), url('+u+') center/cover no-repeat'`,
        ),
        HERO,
      ),
    );
    expect(captured.guard.faithful).toBe(true);
    // Two layers are more than a fill holds: the box stays html, and its picture is the deck's.
    expect(captured.slide.elements.map((e) => e.type)).toEqual(['text', 'html']);
    expect(written).not.toContain('blob:');
    const pictures = captured.assets.filter((asset) => asset.kind === 'image');
    expect(pictures).toHaveLength(1);
    expect(written).toContain(`slidr-asset:${pictures[0]!.id}`);
    // Red under the gradient, at the top of the box where the gradient is clear.
    expect(at(source, 600, 220)[0]).toBeGreaterThan(200);
    expect(at(drawn, 600, 220)).toEqual(at(source, 600, 220));
  });

  it('keeps a picture a rule of a stylesheet the file wrote points at', async () => {
    const { captured, source, drawn, written } = await captureAndDraw(
      file(
        '<h1>Title</h1><div class="hero"></div>',
        unpack(
          `const s=document.createElement('style');s.textContent='.hero{background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.2)), url('+u+') center/cover no-repeat}';document.head.append(s)`,
        ),
        HERO,
      ),
    );
    expect(captured.guard.faithful).toBe(true);
    expect(written).not.toContain('blob:');
    const html = captured.slide.elements.find((e) => e.type === 'html');
    expect(html?.type === 'html' && html.styles).toMatch(/url\("slidr-asset:[0-9a-f]{64}"\)/);
    expect(at(drawn, 600, 220)).toEqual(at(source, 600, 220));
  });

  it('makes an image fill of a photo that covers its box, written without no-repeat', async () => {
    const { captured, source, drawn, written } = await captureAndDraw(
      file(
        '<h1>Title</h1><div class="hero"></div>',
        unpack(
          `const h=document.querySelector('.hero');h.style.backgroundImage='url('+u+')';h.style.backgroundSize='cover';h.style.backgroundPosition='center'`,
        ),
        HERO,
      ),
    );
    expect(captured.guard.faithful).toBe(true);
    // A picture that covers the whole box shows one copy of itself whether it may repeat or not.
    const [, hero] = captured.slide.elements;
    expect(hero).toMatchObject({ type: 'shape', fill: { kind: 'image', fit: 'cover' } });
    expect(written).not.toContain('blob:');
    expect(captured.editability).toBe(1);
    expect(at(drawn, 600, 440)).toEqual(at(source, 600, 440));
  });

  it('keeps what a script drew on a canvas, in a card that stays html', async () => {
    const { captured, source, drawn, written } = await captureAndDraw(
      file(
        '<h1>Title</h1><div class="card"><div class="blob"></div><h3>Revenue by quarter</h3><p>Grew in every quarter of the year, and fastest in the last.</p><canvas id="c" width="400" height="120"></canvas></div>',
        `const g=document.getElementById('c').getContext('2d');g.fillStyle='#dd0000';g.fillRect(180,20,80,80);document.title='ready';`,
        `.card{position:absolute;left:200px;top:200px;width:900px;height:520px;background:#fff;border-radius:24px;overflow:hidden;padding:40px;box-sizing:border-box;font:400 30px/1.4 Arial;color:#222;box-shadow:0 0 0 1px #ccd}
         .card .blob{position:absolute;right:-60px;bottom:-60px;width:200px;height:200px;border-radius:50%;background:#e8eef8}
         .card h3{margin:0 0 16px;font:700 44px/1.2 Arial} .card p{margin:0 0 30px} canvas{display:block}`,
      ),
    );
    expect(captured.guard.faithful).toBe(true);
    expect(captured.slide.elements.map((e) => e.type)).toEqual(['text', 'html']);
    // The canvas is still a canvas, for the rules that place it, and shows its picture.
    expect(written).toMatch(/<canvas [^>]*data-asset=\\"[0-9a-f]{64}\\"/);
    expect(captured.assets.filter((asset) => asset.kind === 'image')).toHaveLength(1);
    // A point inside the red square the script drew.
    expect(at(source, 460, 440)).toEqual([221, 0, 0]);
    expect(at(drawn, 460, 440)).toEqual(at(source, 460, 440));
    // And one beside it, on the card.
    expect(at(drawn, 300, 440)).toEqual(at(source, 300, 440));
  });
});
