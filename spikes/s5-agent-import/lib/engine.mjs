// Spike S5: the import environment. Runs the file in an isolated page (scripts on, network off),
// answers the agent's explore requests, and captures elements as slides: measure -> convert ->
// render -> compare with the source -> fall back to HTML where the pictures differ.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { slideDocument } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE_SCRIPT = readFileSync(join(here, '..', 'page', 'import.js'), 'utf8');

const MAX_ROUNDS = Number(process.env.S5_ROUNDS || 6);
/** An element is "different" when more than this share of the pixels it owns differ. */
const BAD_SHARE = 0.004;
const BAD_MIN_PX = 6;
/** Text and HTML copies are judged on a coarser picture: see compare(). */
const COARSE = 4;
const COARSE_SHARE = Number(process.env.S5_COARSE_SHARE || 0.02);
/** Text laid out at 1920 and scaled back rasterises differently from the source although every
 * line sits in the same place (measured: 2.6-3.9% of coarse pixels). A wrong colour, weight or
 * missing text changes most of the ink, far above this. Layout is checked by line geometry. */
const TEXT_SHARE = 0.1;
const COARSE_MIN_PX = 4;
const COLOR_THRESHOLD = 0.1;
/** Boxes and pictures have no glyph noise, so they are compared much more strictly than text:
 * at 0.1 a light-grey card on white could move 4px unnoticed (see dev-guard-check.mjs). */
const STRICT_THRESHOLD = Number(process.env.S5_STRICT || 0.03);
/** Device pixels per CSS pixel for both pages. 2 was tried: it does not reduce the text noise
 * (same share of differing pixels) and makes box edges noisier. */
const DSF = Number(process.env.S5_DSF || 1);
/** Source pixels per compared pixel (see compare()). */
const DOWN = 2;
const CLUSTER_CELL = 12;
const CLUSTER_MIN_PX = 12;

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

export class ImportEnv {
  static async open(sourcePath, outDir) {
    const env = new ImportEnv();
    env.outDir = outDir;
    mkdirSync(outDir, { recursive: true });
    // Grayscale text anti-aliasing everywhere: a transformed layer never gets LCD text, so with LCD
    // on, the source and the converted slide would differ in every glyph edge for no real reason.
    env.browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-lcd-text'] });
    env.blocked = [];
    env.consoleErrors = [];
    const context = await env.browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
    const sourceDir = pathToFileURL(dirname(sourcePath)).href;
    // IMP-08: nothing leaves the machine, and nothing outside the session folder is read.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(sourceDir) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return route.continue();
      env.blocked.push(url);
      return route.abort();
    });
    env.page = await context.newPage();
    env.page.on('console', (m) => m.type() === 'error' && env.consoleErrors.push(m.text().slice(0, 200)));
    env.page.on('pageerror', (e) => env.consoleErrors.push(String(e).slice(0, 200)));
    await env.page.goto(pathToFileURL(sourcePath).href, { waitUntil: 'load' });
    await env.page.waitForTimeout(800);
    await env.ready();
    env.cdp = await context.newCDPSession(env.page);

    const renderContext = await env.browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
    await renderContext.route('**/*', (route) => (/^(data|blob|about):/.test(route.request().url()) ? route.continue() : route.abort()));
    env.renderPage = await renderContext.newPage();

    env.deck = { title: null, lang: null, dir: null, theme: null, slides: [] };
    env.nextId = 1;
    return env;
  }

  async close() {
    await this.browser.close();
  }

  /** Injects the in-page script (idempotent) and waits for fonts. */
  async ready() {
    await this.page.evaluate(PAGE_SCRIPT);
    await this.page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  }

  // ---------------------------------------------------------------------------------- explore
  async resolveTarget({ selector, js }) {
    await this.ready();
    const handle = js
      ? await this.page.evaluateHandle((code) => new Function(`return (${code});`)(), js)
      : await this.page.evaluateHandle((sel) => {
          // querySelector that also looks inside open shadow roots
          const search = (root) => {
            const hit = root.querySelector(sel);
            if (hit) return hit;
            for (const el of root.querySelectorAll('*')) {
              if (el.shadowRoot) {
                const inner = search(el.shadowRoot);
                if (inner) return inner;
              }
            }
            return null;
          };
          return search(document);
        }, selector);
    const element = handle.asElement();
    if (!element) throw new Error(js ? `"js" did not evaluate to an Element` : `no element matches selector ${selector}`);
    return element;
  }

  async inspect({ selector, js, depth = 4, maxNodes = 160 }) {
    await this.ready();
    const root = selector || js ? await this.resolveTarget({ selector, js }) : await this.page.evaluateHandle(() => document.body);
    const outline = await root.evaluate((el, [d, n]) => window.__slidrImport.outline(el, d, n), [depth, maxNodes]);
    if (selector || js) return outline;
    const info = await this.page.evaluate(() => window.__slidrImport.pageInfo());
    info.blockedNetworkRequests = [...new Set(this.blocked)].slice(0, 20);
    info.consoleErrors = this.consoleErrors.slice(-8);
    return `PAGE\n${JSON.stringify(info, null, 1)}\n\nDOM OUTLINE (tag#id.classes [width x height @x,y] children:n (flags) "own text")\n${outline}`;
  }

  async evaluate(code) {
    await this.ready();
    const result = await this.page.evaluate(async (body) => {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const value = await new AsyncFunction(body)();
      const seen = new WeakSet();
      return JSON.stringify(
        value === undefined ? null : value,
        (_, v) => {
          if (v instanceof Element) return `<${window.__slidrImport.describe(v)}>`;
          if (v instanceof Node) return `[${v.nodeName}]`;
          if (typeof v === 'function') return '[function]';
          if (v && typeof v === 'object') {
            if (seen.has(v)) return '[circular]';
            seen.add(v);
          }
          return v;
        },
        1,
      );
    }, code);
    await this.page.waitForTimeout(50);
    return result.length > 9000 ? `${result.slice(0, 9000)}\n… (${result.length} chars, cut)` : result;
  }

  /** JPEG for the agent's eyes, at most `maxWidth` wide. */
  async screenshot({ selector, js, maxWidth = 1024 }) {
    let clip;
    if (selector || js) {
      const el = await this.resolveTarget({ selector, js });
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const box = await el.boundingBox();
      if (!box || box.width === 0 || box.height === 0) throw new Error('element has no visible box (hidden or zero-sized)');
      clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    } else {
      const size = this.page.viewportSize();
      clip = { x: 0, y: 0, width: size.width, height: size.height };
    }
    const scale = Math.min(1, maxWidth / clip.width) / DSF;
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { ...clip, scale }, captureBeyondViewport: true });
    return { data, mimeType: 'image/jpeg', width: Math.round(clip.width * scale), height: Math.round(clip.height * scale) };
  }

  /** Resizes the isolated page, e.g. to the deck's design size so that it stops scaling itself. */
  async setViewport({ width, height }) {
    await this.page.setViewportSize({ width: Math.round(width), height: Math.round(height) });
    await this.page.waitForTimeout(300);
    const size = this.page.viewportSize();
    return `viewport is now ${size.width}x${size.height}`;
  }

  // ---------------------------------------------------------------------------------- capture
  async capture({ selector, js, before, name, notes, waitMs = 250 }) {
    const started = Date.now();
    await this.ready();
    if (before) {
      await this.evaluate(before);
      await this.ready();
    }
    await this.page.waitForTimeout(waitMs);
    const settled = await this.page.evaluate(() => window.__slidrImport.settle());
    await this.page.waitForTimeout(60);

    const root = await this.resolveTarget({ selector, js });
    await root.scrollIntoViewIfNeeded().catch(() => {});
    const box = await root.boundingBox();
    if (!box || box.width < 50 || box.height < 50) throw new Error('target has no visible box: it is hidden, zero-sized or not in its shown state. Bring the slide into view first (use "before").');

    // The picture is cut on whole pixels; where the slide starts inside it is kept (`origin`).
    const viewport = this.page.viewportSize();
    const clip = { x: Math.floor(box.x), y: Math.floor(box.y) };
    clip.width = Math.ceil(box.x + box.width) - clip.x;
    clip.height = Math.ceil(box.y + box.height) - clip.y;
    const inView = clip.x >= 0 && clip.y >= 0 && clip.x + clip.width <= viewport.width && clip.y + clip.height <= viewport.height;
    const sourcePng = inView ? await this.page.screenshot({ clip, caret: 'hide' }) : await root.screenshot({ animations: 'allow', caret: 'hide' });
    const origin = inView
      ? { fx: box.x - clip.x, fy: box.y - clip.y, width: clip.width, height: clip.height }
      : { fx: 0, fy: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) };
    const model = await root.evaluate((el, options) => window.__slidrImport.captureSlide(el, options), { collapse: process.env.S5_COLLAPSE || 'center' });
    await this.resolveFileUrls(model);

    // What is behind the slide element (ancestor backgrounds, separate background layers).
    const backdropClip = inView ? clip : box;
    if (!model.background) model.background = await this.backdrop(root, backdropClip, model, origin);
    else if (model.background.needsBackdrop) {
      const under = await this.backdrop(root, backdropClip, model, origin);
      if (under.color && !model.background.color) model.background.color = under.color;
      else if (under.raster) Object.assign(model.background, under);
      delete model.background.needsBackdrop;
    }

    const id = `s${this.nextId++}`;
    const slide = {
      id,
      name: name || null,
      notes: notes || null,
      k: model.k,
      dir: model.dir,
      background: model.background,
      elements: model.elements,
      fontFaces: model.fontFaces,
      keyframes: model.keyframes,
      fontsMissing: model.fontsMissing,
      source: model.source,
      origin,
      settled,
    };
    const guard = await this.guard(slide, sourcePng);
    const approximate = Math.abs(slide.source.viewScale - 1) > 1e-6 || slide.elements.some((e) => e._scaled);
    slide.metrics = { ...this.measure(slide), ...guard, exactComparison: !approximate, shownAtPercent: Math.round(slide.source.viewScale * 100), ms: Date.now() - started };
    writeFileSync(join(this.outDir, `${id}-source.png`), sourcePng);
    writeFileSync(join(this.outDir, `${id}-converted.png`), guard.finalPng);
    writeFileSync(join(this.outDir, `${id}-diff.png`), guard.diffPng);
    delete slide.metrics.finalPng;
    delete slide.metrics.diffPng;
    this.deck.slides.push(slide);
    return slide;
  }

  /** file:// sources cannot be fetched from inside the page; read them here. */
  async resolveFileUrls(model) {
    for (const e of model.elements) {
      if (e.type === 'image' && e.src?.startsWith('file:')) {
        try {
          const path = fileURLToPath(e.src);
          const ext = path.split('.').pop().toLowerCase();
          const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
          e.src = `data:${mime};base64,${readFileSync(path).toString('base64')}`;
        } catch {
          e.missing = true;
        }
      }
    }
  }

  async backdrop(root, box, model, origin) {
    // Opacity, not visibility: a child with `visibility: visible` stays visible under a hidden
    // parent, and the "backdrop" would then contain the slide's own content.
    const saved = await root.evaluate((el) => {
      const before = el.getAttribute('style');
      el.style.setProperty('transition', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
      return before;
    });
    await this.page.waitForTimeout(40);
    const png = await this.page.screenshot({ clip: box });
    await root.evaluate((el, before) => {
      if (before === null) el.removeAttribute('style');
      else el.setAttribute('style', before);
    }, saved);
    if (process.env.S5_DEBUG) writeFileSync(join(this.outDir, `backdrop-${this.nextId}.png`), png);
    const img = PNG.sync.read(png);
    const d = img.data;
    let uniform = true;
    for (let i = 4; i < d.length; i += 4) {
      if (Math.abs(d[i] - d[0]) > 2 || Math.abs(d[i + 1] - d[1]) > 2 || Math.abs(d[i + 2] - d[2]) > 2) {
        uniform = false;
        break;
      }
    }
    if (uniform) return { color: `rgb(${d[0]}, ${d[1]}, ${d[2]})`, from: 'backdrop' };
    // Not a flat colour: kept as a picture. Faithful, but not an editable gradient.
    const toModel = model.k / model.source.viewScale; // screen px -> model px
    const w = model.source.width * model.k;
    const h = model.source.height * model.k;
    return {
      raster: dataUrl(png),
      rasterSize: `${box.width * toModel}px ${box.height * toModel}px`,
      rasterPosition: `${(1920 - w) / 2 - origin.fx * toModel}px ${(1080 - h) / 2 - origin.fy * toModel}px`,
      from: 'backdrop',
    };
  }

  // ---------------------------------------------------------------------------- fidelity guard
  async renderSlide(slide, mode = 'transform', shot = true) {
    const atSourceSize = true;
    const src = slide.source;
    const view = { viewScale: src.viewScale, offX: (1920 - src.width * slide.k) / 2, offY: (1080 - src.height * slide.k) / 2, fx: slide.origin.fx, fy: slide.origin.fy };
    const width = atSourceSize ? slide.origin.width : 1920;
    const height = atSourceSize ? slide.origin.height : 1080;
    await this.renderPage.setViewportSize({ width: Math.max(width, 200), height: Math.max(height, 200) });
    await this.renderPage.setContent(slideDocument(slide, slide.fontFaces || [], view, mode), { waitUntil: 'load' });
    await this.renderPage.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
      for (const a of document.getAnimations()) {
        try {
          if (a.effect?.getComputedTiming?.().endTime === Infinity) a.pause();
          else a.finish();
        } catch {
          a.pause();
        }
      }
    });
    return shot ? this.renderPage.screenshot({ clip: { x: 0, y: 0, width, height }, caret: 'hide' }) : null;
  }

  /**
   * Source and converted pictures, compared at two resolutions.
   *
   * The converted slide is laid out at 1920 and shown through a transform, so it never gets the
   * same glyph hinting and sub-pixel edges as the source. `fine` (2x2 average) removes the edge
   * noise of boxes and pictures. Text needs more: `coarse` (4x4 average) still shows a wrong
   * colour, weight or missing text, while its layout is checked by geometry (see textLines()).
   */
  compare(sourcePng, convertedPng) {
    const a = PNG.sync.read(sourcePng);
    const b = PNG.sync.read(convertedPng);
    const w = Math.min(a.width, b.width);
    const h = Math.min(a.height, b.height);
    const crop = (img) => {
      if (img.width === w && img.height === h) return img.data;
      const out = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) img.data.copy(out, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
      return out;
    };
    const down = (data, f) => {
      const dw = Math.floor(w / f);
      const dh = Math.floor(h / f);
      const out = Buffer.alloc(dw * dh * 4);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) sum += data[((y * f + j) * w + x * f + i) * 4 + c];
            out[(y * dw + x) * 4 + c] = Math.round(sum / (f * f));
          }
        }
      }
      return { data: out, w: dw, h: dh };
    };
    const at = (f, threshold) => {
      const A = down(crop(a), f);
      const B = down(crop(b), f);
      const mask = new PNG({ width: A.w, height: A.h });
      const count = pixelmatch(A.data, B.data, mask.data, A.w, A.h, { threshold, includeAA: false, diffMask: true });
      return { f, w: A.w, h: A.h, count, mask: mask.data, A: A.data, B: B.data };
    };
    return { w, h, fine: at(DOWN, COLOR_THRESHOLD), strict: at(DOWN, STRICT_THRESHOLD), coarse: at(COARSE, COLOR_THRESHOLD) };
  }

  diffPicture(result) {
    const { fine } = result;
    const view = new PNG({ width: fine.w, height: fine.h });
    pixelmatch(fine.A, fine.B, view.data, fine.w, fine.h, { threshold: COLOR_THRESHOLD, includeAA: false });
    return PNG.sync.write(view);
  }

  /** Line boxes of every text element in the converted render, keyed by element index. */
  async textLines(origin) {
    return this.renderPage.evaluate(({ fx, fy }) => {
      const out = {};
      for (const el of document.querySelectorAll('[data-type="text"]')) {
        const range = document.createRange();
        // A list item is rendered as an inner block; selecting the outer box would add that block's
        // own rectangle to the glyph boxes.
        const inner = el.firstElementChild;
        range.selectNodeContents(inner && getComputedStyle(inner).display === 'list-item' ? inner : el);
        const lines = [];
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).sort((p, q) => p.top - q.top || p.left - q.left);
        for (const r of rects) {
          const cy = r.top + r.height / 2;
          const line = lines.find((l) => cy > l.top && cy < l.bottom);
          if (line) {
            line.left = Math.min(line.left, r.left);
            line.right = Math.max(line.right, r.right);
            line.top = Math.min(line.top, r.top);
            line.bottom = Math.max(line.bottom, r.bottom);
          } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        }
        out[el.dataset.i] = lines.map((l) => ({ left: l.left - fx, right: l.right - fx, top: l.top - fy, bottom: l.bottom - fy }));
      }
      return out;
    }, origin);
  }

  async guard(slide, sourcePng) {
    const fallbacks = [];
    let result;
    let convertedPng;
    let round = 0;
    let faithful = false;
    let wholeSlide = false;

    for (round = 1; round <= MAX_ROUNDS; round++) {
      // Wraps and line positions are checked on the real 1920 layout; pictures are compared on a
      // render that went through the same raster path as the source (see slideDocument).
      await this.renderSlide(slide, 'transform', false);
      const convertedLines = await this.textLines(slide.origin);
      convertedPng = await this.renderSlide(slide, 'layout');
      result = this.compare(sourcePng, convertedPng);
      const { w, h } = result;
      if (process.env.S5_DEBUG) {
        writeFileSync(join(this.outDir, `${slide.id}-round${round}.png`), convertedPng);
        writeFileSync(join(this.outDir, `${slide.id}-round${round}-diff.png`), this.diffPicture(result));
      }

      // Who owns each pixel: the topmost element whose source box covers it.
      const ownership = (map) => {
        const owner = new Int32Array(map.w * map.h).fill(-1);
        slide.elements.forEach((e, index) => {
          const pad = e.type === 'text' ? 3 : e.shadow ? shadowExtent(e.shadow) / (slide.k / slide.source.viewScale) : 0;
          const { fx, fy } = slide.origin;
          const x0 = Math.max(0, Math.floor(((e._src.x + fx - pad) * DSF) / map.f));
          const y0 = Math.max(0, Math.floor(((e._src.y + fy - pad) * DSF) / map.f));
          const x1 = Math.min(map.w, Math.ceil(((e._src.x + fx + e._src.w + pad) * DSF) / map.f));
          const y1 = Math.min(map.h, Math.ceil(((e._src.y + fy + e._src.h + pad) * DSF) / map.f));
          for (let y = y0; y < y1; y++) owner.fill(index, y * map.w + x0, y * map.w + x1);
        });
        const owned = new Int32Array(slide.elements.length);
        const differing = new Int32Array(slide.elements.length);
        const loose = [];
        for (let i = 0; i < map.w * map.h; i++) {
          // The outermost ring is not judged: the slide rect is rarely on whole pixels, so the edge
          // row mixes the slide with whatever is outside it.
          const x = i % map.w;
          const y = (i - x) / map.w;
          if (x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1) continue;
          const o = owner[i];
          if (o >= 0) owned[o]++;
          if (map.mask[i * 4 + 3] === 0) continue;
          if (o >= 0) differing[o]++;
          else loose.push(i);
        }
        return { owned, differing, loose };
      };
      const fine = ownership(result.fine);
      const coarse = ownership(result.coarse);
      const strict = ownership(result.strict);

      // A source that is itself shown through a scale (a stage fitted to the window) cannot be
      // reproduced pixel for pixel: the two pictures go through different raster paths whatever
      // the converter does (the HTML copy of the same element differs by the same amount). Such
      // slides, and elements under a nested scale, are judged with the tolerant rules; everything
      // else is compared strictly.
      const rootScaled = Math.abs(slide.source.viewScale - 1) > 1e-6;
      const bad = [];
      slide.elements.forEach((e, index) => {
        let why = null;
        const coarseBad = coarse.differing[index] > Math.max(COARSE_MIN_PX, COARSE_SHARE * coarse.owned[index]);
        if (e.type === 'text') why = lineMismatch(e._lines, convertedLines[index]);
        if (why) {
          // wraps or sits elsewhere at 1920
        } else if (e._scaled || rootScaled) {
          // The source drew this element through a nested scale that the model cannot reproduce
          // step for step, so its pixels carry raster noise: judged on the coarse picture.
          if (e.type === 'text' || e.type === 'html') {
            const share = e.type === 'text' ? TEXT_SHARE : COARSE_SHARE;
            if (coarse.differing[index] > Math.max(COARSE_MIN_PX, share * coarse.owned[index])) why = `looks different (${coarse.differing[index]} of ${coarse.owned[index]} coarse px)`;
          } else if (fine.differing[index] > Math.max(BAD_MIN_PX, BAD_SHARE * fine.owned[index])) {
            why = `looks different (${fine.differing[index]} of ${fine.owned[index]} px, lenient)`;
          }
        } else if (strict.differing[index] > Math.max(e.type === 'text' ? 2 * BAD_MIN_PX : BAD_MIN_PX, BAD_SHARE * strict.owned[index])) {
          why = `looks different (${strict.differing[index]} of ${strict.owned[index]} px)`;
        }
        if (process.env.S5_DEBUG) {
          if (e.type === 'text' && e._lines && convertedLines[index]) {
            const d = e._lines.map((l, n) => { const c = convertedLines[index][n]; return c ? `[L${(c.left - l.left).toFixed(2)} R${(c.right - l.right).toFixed(2)} T${(c.top - l.top).toFixed(2)} B${(c.bottom - l.bottom).toFixed(2)}]` : '[missing]'; });
            console.log(`      line deltas (converted - source, px): ${d.join(' ')}`);
          }
          console.log(
            `   r${round} ${e.type.padEnd(5)} ${e.name.slice(0, 26).padEnd(26)} strict ${strict.differing[index]}/${strict.owned[index]} fine ${fine.differing[index]}/${fine.owned[index]} coarse ${coarse.differing[index]}/${coarse.owned[index]} ${why ? `BAD: ${why}` : 'ok'}`,
          );
        }
        if (why) bad.push({ index, element: e, why });
      });
      const cells = new Map();
      for (const i of rootScaled ? fine.loose : strict.loose) {
        const key = `${Math.floor((i % result.fine.w) / CLUSTER_CELL)},${Math.floor(i / result.fine.w / CLUSTER_CELL)}`;
        cells.set(key, (cells.get(key) || 0) + 1);
      }
      const clusters = clusterCells(cells)
        .filter((c) => c.px >= CLUSTER_MIN_PX)
        .map((c) => ({ px: c.px, rect: { x: (c.rect.x * DOWN) / DSF, y: (c.rect.y * DOWN) / DSF, w: (c.rect.w * DOWN) / DSF, h: (c.rect.h * DOWN) / DSF } }));
      if (process.env.S5_DEBUG) console.log(`   r${round} loose px ${strict.loose.length}, clusters ${clusters.length}`);

      if (!bad.length && !clusters.length) {
        faithful = true;
        break;
      }
      if (round === MAX_ROUNDS || wholeSlide) break;

      // Last resort before giving up: the whole slide as one HTML object.
      const lastChance = round === MAX_ROUNDS - 1;
      const requests = [];
      if (lastChance) {
        requests.push({ container: true, rect: { x: 0, y: 0, w: w / DSF, h: h / DSF }, reason: 'whole slide: could not match the source element by element', root: true });
        wholeSlide = true;
      } else {
        for (const { element, why } of bad) {
          if (element.type === 'html' && element.deep) {
            // An HTML copy that itself differs: widen to its container.
            requests.push({ container: true, rect: grow(element._src, 4, w / DSF, h / DSF), reason: `html copy of ${element.name}: ${why}` });
          } else if (element.type === 'html' || element.type === 'shape') {
            requests.push({ node: element._node, deep: element.type === 'html', element, reason: `${element.type} ${element.name}: ${why}` });
          } else {
            requests.push({ node: element._node, deep: true, element, reason: `${element.type} ${element.name}: ${why}` });
          }
        }
        for (const c of clusters) requests.push({ container: true, rect: c.rect, reason: `unexplained difference (${c.px}px) outside any element` });
      }

      for (const request of requests) {
        let nodeIndex = request.node;
        if (request.container) {
          nodeIndex = request.root
            ? await this.page.evaluate(() => window.__slidrImport.state.nodes.push({ el: window.__slidrImport.state.ctx.root, deep: true }) - 1)
            : await this.page.evaluate((rect) => window.__slidrImport.smallestContainer(rect), request.rect);
        }
        const deep = request.container ? true : request.deep;
        const { html, fontFaces, keyframes } = await this.page.evaluate(([n, d, reason]) => window.__slidrImport.fallback(n, d, reason), [nodeIndex, deep, request.reason]);
        slide.fontFaces = [...new Set([...(slide.fontFaces || []), ...fontFaces])];
        slide.keyframes = [...new Set([...(slide.keyframes || []), ...keyframes])];
        if (request.container || deep) {
          // The copy replaces everything that came from inside that node.
          const indexes = slide.elements.map((e) => e._node);
          const inside = await this.page.evaluate(([list, c]) => window.__slidrImport.inside(list, c), [indexes, nodeIndex]);
          const first = inside.indexOf(true);
          const kept = slide.elements.filter((_, i) => !inside[i]);
          const at = first < 0 ? kept.length : slide.elements.slice(0, first).filter((_, i) => !inside[i]).length;
          kept.splice(at, 0, html);
          slide.elements = kept;
        } else {
          const at = slide.elements.indexOf(request.element);
          if (at >= 0) slide.elements[at] = html;
        }
        fallbacks.push({ reason: request.reason, as: html.name, deep });
      }
    }

    return {
      faithful,
      rounds: round > MAX_ROUNDS ? MAX_ROUNDS : round,
      // Raw pixel difference at half resolution, text included. It is never exactly zero for a
      // rescaled slide (glyph edges land on other sub-pixels); the verdict is `faithful`.
      diffPx: result.fine.count,
      diffPct: +((100 * result.fine.count) / (result.fine.w * result.fine.h)).toFixed(3),
      wholeSlideHtml: wholeSlide,
      fallbacks,
      finalPng: convertedPng,
      diffPng: this.diffPicture(result),
    };
  }

  /** Editability: how much of the content became regular objects (SPEC 11.5 "editability rate"). */
  measure(slide) {
    const counts = { text: 0, shape: 0, image: 0, svg: 0, html: 0 };
    let htmlItems = 0;
    let textChars = 0;
    let htmlChars = 0;
    let bytes = 0;
    for (const e of slide.elements) {
      counts[e.type]++;
      if (e.type === 'html') {
        htmlItems += e.swallowed?.items ?? 1;
        htmlChars += e.swallowed?.chars ?? 0;
        bytes += e.markup.length;
      }
      if (e.type === 'text') textChars += e.runs.reduce((n, r) => n + r.text.length, 0);
    }
    const regular = counts.text + counts.shape + counts.image + counts.svg;
    return {
      counts,
      editability: regular + htmlItems === 0 ? 0 : +((100 * regular) / (regular + htmlItems)).toFixed(1),
      textEditability: textChars + htmlChars === 0 ? 100 : +((100 * textChars) / (textChars + htmlChars)).toFixed(1),
      htmlBytes: bytes,
    };
  }

  /** PNG pair for the agent: source next to converted. */
  async slideImages(id) {
    const slide = this.deck.slides.find((s) => s.id === id);
    if (!slide) throw new Error(`no slide ${id}`);
    return {
      source: readFileSync(join(this.outDir, `${id}-source.png`)),
      converted: await this.renderSlide(slide, 'transform'),
    };
  }

  save() {
    const fonts = new Set();
    for (const slide of this.deck.slides) (slide.fontFaces || []).forEach((f) => fonts.add(f));
    writeFileSync(join(this.outDir, 'deck.json'), JSON.stringify({ ...this.deck, fonts: fonts.size }, (key, value) => (key.startsWith('_') ? undefined : value)));
  }
}

function shadowExtent(shadow) {
  const first = shadow.split(/,(?![^(]*\))/)[0];
  const lengths = [...first.matchAll(/(-?[\d.]+)px/g)].map((m) => Math.abs(parseFloat(m[1])));
  return lengths.slice(0, 4).reduce((a, b) => a + b, 0) + 2;
}

function grow(r, by, w, h) {
  const x = Math.max(0, r.x - by);
  const y = Math.max(0, r.y - by);
  return { x, y, w: Math.min(w - x, r.w + 2 * by), h: Math.min(h - y, r.h + 2 * by) };
}

/** Groups neighbouring grid cells that contain differing pixels. */
function clusterCells(cells) {
  const seen = new Set();
  const clusters = [];
  for (const key of cells.keys()) {
    if (seen.has(key)) continue;
    const stack = [key];
    seen.add(key);
    let px = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    while (stack.length) {
      const current = stack.pop();
      const [cx, cy] = current.split(',').map(Number);
      px += cells.get(current);
      minX = Math.min(minX, cx); minY = Math.min(minY, cy); maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const next = `${cx + dx},${cy + dy}`;
        if (cells.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    clusters.push({ px, rect: { x: minX * CLUSTER_CELL, y: minY * CLUSTER_CELL, w: (maxX - minX + 1) * CLUSTER_CELL, h: (maxY - minY + 1) * CLUSTER_CELL } });
  }
  return clusters;
}

/** Compares the line boxes of a text element in the source and in the converted render. */
function lineMismatch(source, converted) {
  if (!source || !converted) return null;
  if (source.length !== converted.length) return `wraps differently (${source.length} lines in the source, ${converted.length} converted)`;
  for (let i = 0; i < source.length; i++) {
    const s = source[i];
    const c = converted[i];
    // Measured on correct conversions: lines land within 0.5px. Text advances scale linearly.
    const tolX = Math.max(1.5, 0.004 * (s.right - s.left));
    const tolY = 1.5;
    const dx = Math.max(Math.abs(s.left - c.left), Math.abs(s.right - c.right));
    const dy = Math.max(Math.abs(s.top - c.top), Math.abs(s.bottom - c.bottom));
    if (dx > tolX || dy > tolY) return `line ${i + 1} is off by ${dx.toFixed(1)}px horizontally, ${dy.toFixed(1)}px vertically`;
  }
  return null;
}
