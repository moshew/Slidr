// In-page half of the spike. Builds a slide into a 1920x1080 container that is displayed
// scaled down with CSS transform (as the editor does), and exposes method A (html-to-image)
// plus a few helpers on window.s3. Method B (CDP) is driven from Node.

const q = new URLSearchParams(location.search);
const slideName = q.get('slide') ?? 'baseline';
const scale = Number(q.get('scale') ?? 0.5);
const x = Number(q.get('x') ?? 0);
const y = Number(q.get('y') ?? 0);

// html-to-image is loaded from node_modules as shipped. '?lib=patched' loads a copy with one
// line changed (see server.mjs), used only to attribute a difference to its cause.
await new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = q.get('lib') === 'patched' ? '/patched/html-to-image.js' : '/node_modules/html-to-image/dist/html-to-image.js';
  s.onload = resolve;
  s.onerror = reject;
  document.head.appendChild(s);
});

const stage = document.getElementById('stage');
const scaler = document.getElementById('scaler');
const slide = document.getElementById('slide');

stage.style.left = `${x}px`;
stage.style.top = `${y}px`;
stage.style.width = `${1920 * scale}px`;
stage.style.height = `${1080 * scale}px`;
scaler.style.transform = `scale(${scale})`;
// '?layer=1' promotes the slide wrapper to its own compositor layer (see the LCD text test).
if (q.get('layer')) scaler.style.willChange = 'transform';

const now = () => performance.now();
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// requestAnimationFrame never fires in a hidden (background) page, so always race it.
const raf = () => Promise.race([new Promise((resolve) => requestAnimationFrame(() => resolve())), timeout(250)]);

async function settle(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
  // Fonts load lazily (unicode-range), only once layout has asked for them.
  root.getBoundingClientRect();
  await document.fonts.ready;
  await raf();
  await document.fonts.ready;
  await raf();
}

async function buildInto(root, name) {
  const mod = await import(`./slides/${name}.js`);
  root.replaceChildren();
  await mod.build(root);
  await settle(root);
}

function selectionOverlay() {
  const o = document.createElement('div');
  o.id = 'overlay';
  o.style.left = `${x + 300 * scale}px`;
  o.style.top = `${y + 200 * scale}px`;
  o.style.width = `${700 * scale}px`;
  o.style.height = `${400 * scale}px`;
  for (const [l, t] of [
    [0, 0],
    [50, 0],
    [100, 0],
    [0, 50],
    [100, 50],
    [0, 100],
    [50, 100],
    [100, 100],
  ]) {
    const h = document.createElement('i');
    h.style.left = `calc(${l}% - 6px)`;
    h.style.top = `calc(${t}% - 6px)`;
    o.appendChild(h);
  }
  document.body.appendChild(o);
}

const blobToB64 = (blob) =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.readAsDataURL(blob);
  });

const fontCSS = {};

// html-to-image rejects with a bare DOM Event when an embedded resource fails; make that readable.
async function describeFailure(run) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Event) {
      const t = e.target;
      throw new Error(`html-to-image rejected with an '${e.type}' event on <${t?.tagName?.toLowerCase() ?? '?'}> (src starts "${String(t?.src ?? '').slice(0, 40)}")`);
    }
    throw e;
  }
}

function targetNode(target) {
  if (!target || target === 'slide') return slide;
  return window.__offscreen?.[target] ?? document.getElementById(target);
}

function aOptions(o = {}) {
  const opts = {
    width: 1920,
    height: 1080,
    pixelRatio: o.pixelRatio ?? 1,
    cacheBust: !!o.cacheBust,
  };
  if (o.font === 'skip') opts.skipFonts = true;
  else if (o.font === 'precomputed') opts.fontEmbedCSS = fontCSS.all;
  else if (o.font === 'precomputed-woff2') opts.fontEmbedCSS = fontCSS.woff2;
  else if (o.font === 'woff2') opts.preferredFontFormat = 'woff2';
  return opts;
}

window.s3 = {
  ready: null,

  info() {
    const r = stage.getBoundingClientRect();
    const sr = slide.getBoundingClientRect();
    const features = [...slide.querySelectorAll('[data-feature]')].map((el) => {
      const b = el.getBoundingClientRect();
      const cell = el.closest('.cell');
      const c = (el.dataset.crop === 'self' ? el : (cell ?? el)).getBoundingClientRect();
      const toSlide = (rect) => ({
        x: (rect.left - sr.left) / scale,
        y: (rect.top - sr.top) / scale,
        w: rect.width / scale,
        h: rect.height / scale,
      });
      return { name: el.dataset.feature, region: toSlide(b), crop: toSlide(c) };
    });
    return {
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      features,
      dpr: window.devicePixelRatio,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      nodes: slide.querySelectorAll('*').length,
      fontsLoaded: [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => `${f.family} ${f.weight} ${f.unicodeRange.slice(0, 16)}`),
      fontFacesDeclared: document.fonts.size,
      computedCssTextLength: getComputedStyle(slide).cssText.length,
      notes: window.__slideNotes ?? {},
    };
  },

  /** Precompute the font embed CSS once (what you would cache across captures). */
  async fontEmbed(kind = 'all') {
    const t0 = now();
    fontCSS[kind] = await htmlToImage.getFontEmbedCSS(
      slide,
      kind === 'woff2' ? { preferredFontFormat: 'woff2' } : {},
    );
    return { ms: now() - t0, length: fontCSS[kind].length };
  },

  /** One capture with method A. Timed around the library call only (DOM -> PNG Blob). */
  async captureA(o = {}) {
    const node = targetNode(o.target);
    const opts = aOptions(o);
    const t0 = now();
    const blob = await describeFailure(() => htmlToImage.toBlob(node, opts));
    const ms = now() - t0;
    return { ms, b64: await blobToB64(blob), bytes: blob.size };
  },

  /** n captures in a row; returns each duration and the last image. */
  async benchA(o = {}, n = 20) {
    const node = targetNode(o.target);
    const opts = aOptions(o);
    const times = [];
    let blob = null;
    for (let i = 0; i < n; i++) {
      const t0 = now();
      blob = await htmlToImage.toBlob(node, opts);
      times.push(now() - t0);
    }
    return { times, b64: await blobToB64(blob), bytes: blob.size };
  },

  /** Phase breakdown of method A: clone+embed+serialise, SVG decode, draw + PNG encode. */
  async phasesA(o = {}, n = 5) {
    const node = targetNode(o.target);
    const opts = aOptions(o);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t0 = now();
      const svg = await htmlToImage.toSvg(node, opts);
      const t1 = now();
      const img = new Image();
      img.src = svg;
      await img.decode();
      const t2 = now();
      const canvas = document.createElement('canvas');
      canvas.width = 1920 * opts.pixelRatio;
      canvas.height = 1080 * opts.pixelRatio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const t3 = now();
      await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const t4 = now();
      out.push({ toSvg: t1 - t0, decode: t2 - t1, draw: t3 - t2, encode: t4 - t3, svgChars: svg.length });
    }
    return out;
  },

  /**
   * Render another slide (one the user is not looking at) into a container that is not visible,
   * so it can be captured. Returns the time to build it and have fonts/images ready.
   */
  async renderOffscreen(name, mode) {
    const host = document.createElement('div');
    const root = document.createElement('div');
    root.className = 'slide';
    host.appendChild(root);
    if (mode === 'left') host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;';
    else if (mode === 'below') host.style.cssText = 'position:absolute;left:0;top:2000px;width:1920px;height:1080px;';
    else if (mode === 'none') host.style.cssText = 'display:none;';
    else if (mode === 'hidden') host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;';
    else if (mode === 'detached') host.style.cssText = '';
    const t0 = now();
    if (mode !== 'detached') document.body.appendChild(host);
    await buildInto(root, name);
    const ms = now() - t0;
    window.__offscreen = { ...(window.__offscreen ?? {}), [mode]: root };
    const r = root.getBoundingClientRect();
    return { ms, rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
  },

  removeOffscreen(mode) {
    const root = window.__offscreen?.[mode];
    root?.parentElement?.remove();
    if (window.__offscreen) delete window.__offscreen[mode];
  },

  /** Replace the displayed slide (what a kept-alive capture page would do per request). */
  async swapSlide(name) {
    const t0 = now();
    await buildInto(slide, name);
    return { ms: now() - t0 };
  },
};

window.s3.ready = (async () => {
  await buildInto(slide, slideName);
  if (q.get('overlay')) selectionOverlay();
  await raf();
  return true;
})();
