// Development probe: for the first text the guard calls different, the line boxes of the source
// and of the converted text, and how the converted text is styled.
import { connect } from './cdp.mjs';
const [selector, before] = process.argv.slice(2);
const { browser, importPage } = await connect();
const page = importPage();
const ROOT = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';
const out = await page.evaluate(
  async ({ selector, before, ROOT }) => {
    const { startConversion, mountSlide } = await import(`${ROOT}/html-import/src/engine.ts`);
    const { createDeck } = await import(`${ROOT}/model/src/index.ts`);
    const { host, page } = window.__slidrImport;
    if (!document.querySelector('iframe[data-slidr-import]')) await page.load();
    const frame = document.querySelector('iframe[data-slidr-import]');
    if (before) await new frame.contentWindow.Function(`return (async () => {${before}})()`)();
    await new Promise((r) => setTimeout(r, 400));
    const root = frame.contentDocument.querySelector(selector);
    const deck = createDeck({ lang: 'en' });
    const conversion = await startConversion(root, {
      deck,
      host,
      foreign: true,
      behind: 'page',
      fontFaces: false,
    });
    const verdict = await conversion.judge();
    const bad = verdict.bad.find((b) => b.item.element.type === 'text');
    if (!bad) return { none: true };
    const rects = (node) => {
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects()).map((r) =>
        [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100),
      );
    };
    const slide = conversion.result({
      faithful: false,
      rounds: 0,
      diffPixels: 0,
      exact: true,
      fallbacks: [],
      wholeSlide: false,
    }).slide;
    const mounted = await mountSlide(deck, slide, host, {
      origin: { x: 0, y: 0 },
      viewScale: 1,
      k: 1,
      offX: 0,
      offY: 0,
    });
    mounted.likeSource();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dom = mounted.root.querySelector(`[data-element-id="${bad.item.element.id}"]`);
    const chain = [];
    for (
      let el = dom.querySelector('span') ?? dom;
      el && el !== mounted.root;
      el = el.parentElement
    ) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName,
        cls: el.className?.slice?.(0, 40),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        family: cs.fontFamily.slice(0, 60),
        top: Math.round(el.getBoundingClientRect().top * 100) / 100,
        h: Math.round(el.getBoundingClientRect().height * 100) / 100,
        display: cs.display,
        weight: cs.fontWeight,
      });
    }
    const srcChain = [];
    for (let el = bad.item.node, i = 0; el && i < 3; el = el.parentElement, i++) {
      const cs = frame.contentWindow.getComputedStyle(el);
      srcChain.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 40),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        top: Math.round(el.getBoundingClientRect().top * 100) / 100,
        h: Math.round(el.getBoundingClientRect().height * 100) / 100,
        display: cs.display,
      });
    }
    const result = {
      why: bad.why,
      source: rects(bad.item.node),
      converted: rects(dom),
      itemLines: bad.item.lines,
      paragraph: bad.item.element.content.paragraphs[0],
      frame: bad.item.element.frame,
      chain,
      srcChain,
      html: dom.outerHTML.slice(0, 700),
    };
    mounted.dispose();
    conversion.dispose();
    return result;
  },
  { selector, before, ROOT },
);
console.log(JSON.stringify(out, null, 1));
await browser.close();
