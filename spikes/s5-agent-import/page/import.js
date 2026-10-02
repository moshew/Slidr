// Spike S5: the in-page half of the import tools. Injected into the isolated page that runs the
// file being imported. Two jobs, both format-agnostic (IMP-04):
//   1. describe the live DOM (outline) so the agent can find its way around;
//   2. "render and measure": turn a rendered element into model elements by reading what the
//      browser reports (rects, computed styles), never by tag names or class names of a format.
// Units: the model is 1920x1080. `k` converts source CSS px to model px.
(() => {
  if (window.__slidrImport) return;
  const W = 1920;
  const H = 1080;
  const state = { nodes: [], baseline: new Map(), baselineDoc: null, ctx: null };

  // ------------------------------------------------------------------------------------ helpers
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const round = (n) => Math.round(n * 100) / 100;

  function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
    const m = color.match(/^rgba?\(([^)]+)\)$/) || color.match(/^color\([a-z0-9-]+\s+([^)]+)\)$/);
    if (!m) return 1; // oklch(...), named colours, ...: assume opaque
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    return parts.length > 3 ? num(parts[3]) : 1;
  }

  /** Children in the composed tree: shadow roots are entered, slots are resolved. */
  function composedChildNodes(el) {
    if (el.shadowRoot) return [...el.shadowRoot.childNodes];
    if (el.tagName === 'SLOT') {
      const assigned = el.assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    return [...el.childNodes];
  }
  const composedChildren = (el) => composedChildNodes(el).filter((n) => n.nodeType === 1);

  const isHidden = (cs) =>
    cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || num(cs.opacity) === 0;

  /** Multiplies every px length inside a CSS value by k ("0px 8px 24px rgba(..)" etc.). */
  const scalePx = (value, k) => value.replace(/(-?\d*\.?\d+)px/g, (_, n) => `${round(parseFloat(n) * k)}px`);

  // ------------------------------------------------------------------------------------ outline
  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (cls.length) s += '.' + cls.slice(0, 4).join('.') + (cls.length > 4 ? '…' : '');
    return s;
  }

  function outline(root, maxDepth, maxNodes) {
    const lines = [];
    let count = 0;
    (function walk(el, depth) {
      if (count >= maxNodes) return;
      count++;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const kids = composedChildren(el);
      const flags = [];
      if (cs.display === 'none') flags.push('display:none');
      else if (cs.visibility === 'hidden') flags.push('visibility:hidden');
      else if (num(cs.opacity) === 0) flags.push('opacity:0');
      if (el.shadowRoot) flags.push('shadow-root');
      if (cs.position === 'fixed' || cs.position === 'absolute') flags.push(cs.position);
      if (cs.transform !== 'none') flags.push('transformed');
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') flags.push('scrolls');
      let own = '';
      for (const n of composedChildNodes(el)) if (n.nodeType === 3) own += n.data;
      own = own.replace(/\s+/g, ' ').trim();
      lines.push(
        `${'  '.repeat(depth)}${describe(el)} [${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}]` +
          (kids.length ? ` children:${kids.length}` : '') +
          (flags.length ? ` (${flags.join(', ')})` : '') +
          (own ? ` "${own.slice(0, 50)}${own.length > 50 ? '…' : ''}"` : ''),
      );
      if (depth >= maxDepth) {
        if (kids.length) lines.push(`${'  '.repeat(depth + 1)}… ${el.querySelectorAll('*').length} descendants not shown`);
        return;
      }
      // Long runs of same-looking siblings are summarised, the agent can ask for a subtree.
      let shown = 0;
      for (const kid of kids) {
        if (shown >= 40) {
          lines.push(`${'  '.repeat(depth + 1)}… ${kids.length - shown} more siblings`);
          break;
        }
        walk(kid, depth + 1);
        shown++;
      }
    })(root, 0);
    if (count >= maxNodes) lines.push(`… outline cut at ${maxNodes} nodes; pass a narrower selector`);
    return lines.join('\n');
  }

  function pageInfo() {
    const sheets = [];
    let rules = 0;
    let fontFaces = 0;
    let keyframes = 0;
    for (const sheet of document.styleSheets) {
      try {
        const count = sheet.cssRules.length;
        rules += count;
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSFontFaceRule) fontFaces++;
          if (rule instanceof CSSKeyframesRule) keyframes++;
        }
        sheets.push(`${sheet.href ? sheet.href.slice(0, 80) : '<style>'} (${count} rules)`);
      } catch {
        sheets.push(`${sheet.href} (not readable)`);
      }
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const vars = [];
    for (const name of rootStyle) if (name.startsWith('--')) vars.push(`${name}: ${rootStyle.getPropertyValue(name).trim().slice(0, 60)}`);
    const fonts = new Map();
    for (const face of document.fonts) fonts.set(`${face.family} ${face.weight} ${face.style}`, face.status);
    const loaded = [...fonts].filter(([, status]) => status === 'loaded').map(([name]) => name);
    return {
      title: document.title,
      lang: document.documentElement.lang || null,
      dir: getComputedStyle(document.body).direction,
      viewport: `${innerWidth}x${innerHeight}`,
      scroll: `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`,
      elements: document.querySelectorAll('*').length,
      scripts: document.scripts.length,
      stylesheets: sheets,
      cssRules: rules,
      fontFaceRules: fontFaces,
      keyframesRules: keyframes,
      fontsLoaded: loaded.slice(0, 30),
      fontsDeclared: fonts.size,
      rootCssVariables: vars.slice(0, 60),
      runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
    };
  }

  // --------------------------------------------------------------------- assets (images, fonts)
  const dataUrlCache = new Map();
  async function toDataUrl(url) {
    if (!url || url.startsWith('data:')) return url;
    if (dataUrlCache.has(url)) return dataUrlCache.get(url);
    const promise = (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return url; // left for the host to resolve (file:// URLs) or to report as missing
      }
    })();
    dataUrlCache.set(url, promise);
    return promise;
  }

  async function inlineCssUrls(value) {
    const urls = [...value.matchAll(/url\((["']?)(.*?)\1\)/g)].map((m) => m[2]);
    let out = value;
    for (const url of new Set(urls)) {
      if (url.startsWith('data:') || url.startsWith('#')) continue;
      const absolute = new URL(url, document.baseURI).href;
      out = out.split(url).join(await toDataUrl(absolute));
    }
    return out;
  }

  function allCssRules() {
    const rules = [];
    const visit = (list) => {
      for (const rule of list) {
        rules.push(rule);
        if (rule.cssRules && !(rule instanceof CSSKeyframesRule) && !(rule instanceof CSSStyleRule)) visit(rule.cssRules);
      }
    };
    const sheets = [...document.styleSheets, ...document.adoptedStyleSheets];
    for (const el of document.querySelectorAll('*')) {
      if (el.shadowRoot) sheets.push(...el.shadowRoot.styleSheets, ...el.shadowRoot.adoptedStyleSheets);
    }
    for (const sheet of sheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        /* cross-origin sheet: not readable */
      }
    }
    return rules;
  }

  /** @font-face rules for the families a capture used, with their sources embedded. */
  async function collectFontFaces(usedFamilies) {
    const out = [];
    const missing = [];
    for (const rule of allCssRules()) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase();
      if (!usedFamilies.has(family)) continue;
      const base = rule.parentStyleSheet?.href || document.baseURI;
      let text = rule.cssText;
      const urls = [...text.matchAll(/url\((["']?)(.*?)\1\)/g)].map((m) => m[2]);
      let ok = true;
      for (const url of new Set(urls)) {
        if (url.startsWith('data:')) continue;
        const resolved = await toDataUrl(new URL(url, base).href);
        if (resolved.startsWith('data:')) text = text.split(url).join(resolved);
        else ok = false;
      }
      (ok ? out : missing).push(ok ? text : family);
    }
    return { rules: out, missing: [...new Set(missing)] };
  }

  function collectKeyframes(names) {
    return allCssRules()
      .filter((rule) => rule instanceof CSSKeyframesRule && names.has(rule.name))
      .map((rule) => rule.cssText);
  }

  // ------------------------------------------------- snapshot: a self-contained copy of a subtree
  // Used for `html` objects. Every node carries its computed style inline (only what differs from
  // a pristine element of the same tag), so the copy does not depend on the source stylesheets or
  // on its ancestors. Pseudo-elements become real spans.
  function baselineFor(tag) {
    if (state.baseline.has(tag)) return state.baseline.get(tag);
    if (!state.baselineDoc) {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
      document.documentElement.appendChild(frame);
      state.baselineDoc = frame.contentDocument;
    }
    const doc = state.baselineDoc;
    const isSvg = ['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'tspan', 'defs', 'use', 'symbol', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask'].includes(tag);
    const el = isSvg ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag);
    doc.body.appendChild(el);
    const cs = doc.defaultView.getComputedStyle(el);
    const map = {};
    for (const prop of cs) map[prop] = cs.getPropertyValue(prop);
    el.remove();
    state.baseline.set(tag, map);
    return map;
  }

  // Properties that describe where a box sits among its siblings. They are dropped on the root of
  // a snapshot: the model frame positions it.
  const ROOT_SKIP = /^(margin|inset|top|right|bottom|left|position|float|grid-(row|column|area)|align-self|justify-self|place-self|order|flex($|-grow|-shrink|-basis))/;
  const NEVER = /^(transition|-webkit-locale|perspective-origin|block-size|inline-size|min-block-size|min-inline-size|-webkit-text-fill-color|caret-color|column-rule-color|text-emphasis-color|-webkit-text-stroke-color|outline-color|text-decoration-color|border-(block|inline)-|margin-(block|inline)-|padding-(block|inline)-|inset-(block|inline))/;

  function styleDiff(cs, tag, isRoot, dropTransform) {
    const base = baselineFor(tag);
    let css = '';
    for (const prop of cs) {
      if (prop.startsWith('--') || NEVER.test(prop)) continue;
      if (isRoot && ROOT_SKIP.test(prop)) continue;
      if (prop === 'transform-origin' && cs.transform === 'none') continue;
      if (dropTransform && (prop === 'transform' || prop === 'transform-origin' || prop === 'translate' || prop === 'scale' || prop === 'rotate')) continue;
      const value = cs.getPropertyValue(prop);
      if (value !== base[prop]) css += `${prop}:${value};`;
    }
    // Colours that default to currentColor compare unequal for no reason; the ones that matter:
    for (const prop of ['-webkit-text-fill-color', '-webkit-text-stroke-color', 'text-decoration-color', 'outline-color']) {
      const value = cs.getPropertyValue(prop);
      if (value && value !== cs.color) css += `${prop}:${value};`;
    }
    return css + 'transition:none;';
  }

  function pseudoSpan(el, which, doc) {
    const cs = getComputedStyle(el, which);
    const content = cs.content;
    if (!content || content === 'none' || content === 'normal') return null;
    const span = doc.createElement('span');
    span.setAttribute('data-pseudo', which.replace(/:/g, ''));
    const literal = content.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (literal) span.textContent = literal[1].replace(/\\(.)/g, '$1');
    else if (!/^url\(|^counter|^attr/.test(content)) span.textContent = '';
    else span.setAttribute('data-lossy', content.slice(0, 40));
    let css = '';
    const base = baselineFor('span');
    for (const prop of cs) {
      if (prop.startsWith('--') || NEVER.test(prop) || prop === 'content') continue;
      const value = cs.getPropertyValue(prop);
      if (value !== base[prop]) css += `${prop}:${value};`;
    }
    span.setAttribute('style', css);
    return span;
  }

  /**
   * @param deep  false = the element's own box only (its paint and pseudo-elements, no children)
   * @returns {{ html: string, animations: Set<string>, families: Set<string>, lossy: string[] }}
   */
  async function snapshot(el, deep) {
    const animations = new Set();
    const families = new Set();
    const lossy = [];
    const doc = document.implementation.createHTMLDocument('');
    const noteStyle = (cs) => {
      if (cs.animationName && cs.animationName !== 'none') cs.animationName.split(',').forEach((n) => animations.add(n.trim()));
      cs.fontFamily.split(',').forEach((f) => families.add(f.replace(/["']/g, '').trim().toLowerCase()));
    };

    async function copy(node, isRoot) {
      if (node.nodeType === 3) return doc.createTextNode(node.data);
      if (node.nodeType !== 1) return null;
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') return null;
      const cs = getComputedStyle(node);
      if (cs.display === 'none') return null;
      noteStyle(cs);

      let out;
      if (tag === 'canvas') {
        // A canvas is drawn by script; the copy is its current picture.
        out = doc.createElement('img');
        try {
          out.setAttribute('src', node.toDataURL('image/png'));
        } catch {
          lossy.push('tainted canvas');
        }
      } else if (node instanceof SVGElement) {
        out = doc.createElementNS('http://www.w3.org/2000/svg', node.tagName);
        for (const attr of node.attributes) out.setAttribute(attr.name, attr.value);
        if (tag === 'use') {
          const href = node.getAttribute('href') || node.getAttribute('xlink:href');
          const target = href && href.startsWith('#') ? node.getRootNode().querySelector(href) : null;
          if (target) {
            // Inline the referenced symbol so the copy does not need the source document.
            const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
            const inner = await copy(target, false);
            if (inner) g.append(...(target.tagName.toLowerCase() === 'symbol' ? inner.childNodes : [inner]));
            for (const name of ['x', 'y', 'transform']) if (node.hasAttribute(name)) g.setAttribute(name === 'x' || name === 'y' ? `data-${name}` : name, node.getAttribute(name));
            const tx = num(node.getAttribute('x'));
            const ty = num(node.getAttribute('y'));
            if (tx || ty) g.setAttribute('transform', `${node.getAttribute('transform') || ''} translate(${tx},${ty})`.trim());
            out = g;
          }
        }
      } else {
        out = doc.createElement(tag === 'html' || tag === 'body' ? 'div' : tag);
        for (const name of ['dir', 'lang', 'alt', 'colspan', 'rowspan', 'value', 'type', 'start', 'reversed', 'poster', 'controls', 'loop', 'muted', 'autoplay', 'href']) {
          if (node.hasAttribute(name)) out.setAttribute(name, node.getAttribute(name));
        }
        if (tag === 'img') out.setAttribute('src', await toDataUrl(node.currentSrc || node.src));
        if (tag === 'video' || tag === 'audio' || tag === 'source') {
          const src = node.currentSrc || node.src;
          if (src) out.setAttribute('src', await toDataUrl(src));
        }
        if (tag === 'iframe') {
          if (node.hasAttribute('srcdoc')) out.setAttribute('srcdoc', node.getAttribute('srcdoc'));
          else lossy.push('iframe with external src');
        }
      }

      let style = styleDiff(cs, tag, isRoot, isRoot && node === state.ctx?.root);
      if (/url\(/.test(style)) style = await inlineCssUrls(style);
      if (isRoot) {
        const r = node.getBoundingClientRect();
        // The root fills the frame the model gives it.
        style += `position:relative;margin:0;width:${cs.width};height:${cs.height};box-sizing:${cs.boxSizing};`;
        void r;
      }
      out.setAttribute('style', style);

      if (!(node instanceof SVGElement) || tag === 'svg' || tag === 'foreignobject') {
        const before = pseudoSpan(node, '::before', doc);
        if (before) {
          if (before.hasAttribute('data-lossy')) lossy.push(`::before content ${before.getAttribute('data-lossy')}`);
          out.appendChild(before);
        }
      }
      if ((deep || node instanceof SVGElement) && tag !== 'canvas' && tag !== 'use') {
        for (const child of composedChildNodes(node)) {
          const copied = await copy(child, false);
          if (copied) out.appendChild(copied);
        }
      }
      if (!(node instanceof SVGElement)) {
        const after = pseudoSpan(node, '::after', doc);
        if (after) {
          if (after.hasAttribute('data-lossy')) lossy.push(`::after content ${after.getAttribute('data-lossy')}`);
          out.appendChild(after);
        }
      }
      return out;
    }

    const root = await copy(el, true);
    return { html: root ? root.outerHTML : '', animations, families, lossy };
  }

  // ----------------------------------------------------------------- render and measure (convert)
  function ownPaint(cs) {
    const borders = ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
      width: num(cs[`border${side}Width`]),
      style: cs[`border${side}Style`],
      color: cs[`border${side}Color`],
    }));
    const hasBorder = borders.some((b) => b.width > 0 && b.style !== 'none' && b.style !== 'hidden' && alphaOf(b.color) > 0);
    const hasBg = alphaOf(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none';
    const hasShadow = cs.boxShadow !== 'none';
    const hasOutline = cs.outlineStyle !== 'none' && num(cs.outlineWidth) > 0;
    const hasBackdrop = cs.backdropFilter && cs.backdropFilter !== 'none';
    return { any: hasBorder || hasBg || hasShadow || hasOutline || hasBackdrop, hasBorder, hasBg, hasShadow, borders };
  }

  /** 'box' when a pseudo-element paints something the model cannot hold as text. */
  function pseudoKind(el, which) {
    const cs = getComputedStyle(el, which);
    if (!cs.content || cs.content === 'none' || cs.content === 'normal') return null;
    const literal = /^"((?:[^"\\]|\\.)*)"$/.test(cs.content);
    const plainInline = cs.display === 'inline' && cs.position === 'static' && literal && !ownPaint(cs).any;
    if (plainInline) return cs.content === '""' ? null : 'text';
    if (cs.display === 'none') return null;
    return 'box';
  }

  // Effects that apply to a whole subtree as one picture. The model has no group-level equivalent
  // in this prototype, so such a subtree stays an `html` object.
  function subtreeEffect(cs, ctx) {
    if (cs.transform !== 'none') {
      const m = cs.transform.match(/^matrix\(([^)]+)\)$/);
      if (!m) return 'transform (3D)';
      if (uniformScale(cs) === null) return 'transform (rotate/skew/stretch)';
    }
    if (cs.filter !== 'none') return 'filter';
    if (cs.clipPath !== 'none') return 'clip-path';
    if (cs.maskImage && cs.maskImage !== 'none') return 'mask';
    if (cs.mixBlendMode !== 'normal') return 'mix-blend-mode';
    if (cs.animationName !== 'none' && ctx.keepAnimations) return 'css animation';
    return null;
  }

  /** The scale factor of a transform that only scales uniformly and translates; null otherwise. */
  function uniformScale(cs) {
    if (cs.transform === 'none') return 1;
    const m = cs.transform.match(/^matrix\(([^)]+)\)$/);
    if (!m) return null;
    const [a, b, c, d] = m[1].split(',').map(Number);
    if (Math.abs(b) > 1e-4 || Math.abs(c) > 1e-4 || Math.abs(a - d) > 1e-3 || a <= 0) return null;
    return a;
  }

  /**
   * How to place an HTML copy of `el`: the copy keeps the element's own transform, so it needs the
   * element's untransformed size, the scale of everything above it, and where the untransformed
   * box sits inside the transformed bounding box.
   */
  function copyGeometry(el) {
    const { root, viewScale, k } = state.ctx;
    let above = 1;
    for (let p = el.parentNode || el.host; p && p !== root; p = p.parentNode || p.host) {
      if (p.nodeType === 1) above *= uniformScale(getComputedStyle(p)) ?? 1;
    }
    const cs = getComputedStyle(el);
    const w = el.offsetWidth ?? num(cs.width);
    const h = el.offsetHeight ?? num(cs.height);
    let minX = 0;
    let minY = 0;
    if (el !== root && cs.transform !== 'none') {
      const m = new DOMMatrix(cs.transform);
      const [ox, oy] = cs.transformOrigin.split(' ').map(num);
      const xs = [];
      const ys = [];
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const p = m.transformPoint(new DOMPoint(x - ox, y - oy));
        xs.push(p.x + ox);
        ys.push(p.y + oy);
      }
      minX = Math.min(...xs);
      minY = Math.min(...ys);
    }
    const toModel = (above * k); // CSS px above the element -> model px
    void viewScale;
    return { natural: { w, h }, scale: toModel, inset: { x: round(-minX * toModel), y: round(-minY * toModel) }, keepsTransform: el !== root && cs.transform !== 'none' };
  }

  function marksOf(cs, k) {
    const marks = {
      font: cs.fontFamily,
      size: round(num(cs.fontSize) * k),
      weight: Number(cs.fontWeight) || 400,
      color: cs.color,
    };
    if (cs.fontStyle !== 'normal') marks.italic = true;
    if (cs.textDecorationLine.includes('underline')) marks.underline = true;
    if (cs.textDecorationLine.includes('line-through')) marks.strike = true;
    if (cs.letterSpacing !== 'normal') marks.letterSpacing = round(num(cs.letterSpacing) * k);
    if (cs.textTransform !== 'none') marks.case = cs.textTransform;
    if (cs.verticalAlign === 'super') marks.script = 'sup';
    if (cs.verticalAlign === 'sub') marks.script = 'sub';
    // What the model has no field for travels in `css` (SPEC 5.9).
    const css = {};
    if (cs.textShadow !== 'none') css['text-shadow'] = scalePx(cs.textShadow, k);
    if (cs.fontStretch !== '100%' && cs.fontStretch !== 'normal') css['font-stretch'] = cs.fontStretch;
    if (cs.fontFeatureSettings !== 'normal') css['font-feature-settings'] = cs.fontFeatureSettings;
    if (cs.fontVariationSettings !== 'normal') css['font-variation-settings'] = cs.fontVariationSettings;
    if (cs.fontVariantNumeric !== 'normal') css['font-variant-numeric'] = cs.fontVariantNumeric;
    if (cs.webkitTextStrokeWidth && num(cs.webkitTextStrokeWidth) > 0) css['-webkit-text-stroke'] = `${round(num(cs.webkitTextStrokeWidth) * k)}px ${cs.webkitTextStrokeColor}`;
    if (Object.keys(css).length) marks.css = css;
    return marks;
  }

  /** True when everything under `el` is inline phrasing content the text model can hold as runs. */
  function isPureInline(el) {
    for (const child of composedChildNodes(el)) {
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br' || tag === 'wbr') continue;
      const cs = getComputedStyle(child);
      if (cs.display === 'none') continue;
      if (cs.display !== 'inline' && cs.display !== 'contents') return false;
      if (child instanceof SVGElement || ['img', 'canvas', 'video', 'iframe', 'input', 'button', 'select', 'textarea', 'picture'].includes(tag)) return false;
      const paint = ownPaint(cs);
      if (paint.hasBorder || paint.hasShadow || cs.backgroundImage !== 'none') return false;
      if (num(cs.paddingLeft) + num(cs.paddingRight) > 0) return false;
      if (pseudoKind(child, '::before') === 'box' || pseudoKind(child, '::after') === 'box') return false;
      if (!isPureInline(child)) return false;
    }
    return true;
  }

  const hasOwnText = (el) => composedChildNodes(el).some((n) => n.nodeType === 3 && n.data.trim() !== '');
  const hasAnyText = (el) => {
    for (const n of composedChildNodes(el)) {
      if (n.nodeType === 3 && n.data.trim() !== '') return true;
      if (n.nodeType === 1 && getComputedStyle(n).display !== 'none' && hasAnyText(n)) return true;
    }
    return false;
  };

  function collectRuns(el, cs, k) {
    const runs = [];
    const pre = /^pre/.test(cs.whiteSpace) || cs.whiteSpaceCollapse === 'preserve';
    const pseudoRun = (node, which) => {
      if (pseudoKind(node, which) !== 'text') return;
      const pcs = getComputedStyle(node, which);
      runs.push({ text: pcs.content.slice(1, -1).replace(/\\(.)/g, '$1'), marks: marksOf(pcs, k) });
    };
    (function walk(node, marks) {
      pseudoRun(node, '::before');
      for (const child of composedChildNodes(node)) {
        if (child.nodeType === 3) {
          runs.push({ text: child.data, marks });
        } else if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (tag === 'br') {
            runs.push({ text: '\n', marks, br: true });
            continue;
          }
          const ccs = getComputedStyle(child);
          if (isHidden(ccs)) continue;
          const childMarks = marksOf(ccs, k);
          if (alphaOf(ccs.backgroundColor) > 0) childMarks.highlight = ccs.backgroundColor;
          // The block's own opacity is on the element; only an inline child's opacity is a mark.
          if (ccs.opacity !== '1') childMarks.css = { ...childMarks.css, opacity: ccs.opacity };
          const link = child.closest('a[href]');
          if (link) childMarks.link = link.getAttribute('href');
          walk(child, childMarks);
        }
      }
      pseudoRun(node, '::after');
    })(el, marksOf(cs, k));

    if (!pre) {
      // Reproduce CSS white-space collapsing, since the renderer lays runs out with pre-wrap.
      let prevSpace = true; // collapses leading space of the block
      for (const run of runs) {
        if (run.br) {
          prevSpace = true;
          continue;
        }
        let text = run.text.replace(/[ \t\n\r\f]+/g, ' ');
        if (prevSpace && text.startsWith(' ')) text = text.slice(1);
        if (text.length) prevSpace = text.endsWith(' ');
        run.text = text;
      }
      for (let i = runs.length - 1; i >= 0; i--) {
        if (runs[i].br) {
          // space before a forced break does not render
          for (let j = i - 1; j >= 0 && !runs[j].br; j--) {
            if (runs[j].text === '') continue;
            runs[j].text = runs[j].text.replace(/ $/, '');
            break;
          }
        }
      }
      for (let i = runs.length - 1; i >= 0; i--) {
        if (runs[i].br) break;
        if (runs[i].text === '') continue;
        runs[i].text = runs[i].text.replace(/ $/, '');
        break;
      }
    }
    return runs.filter((r) => r.text !== '').map(({ br, ...rest }) => rest);
  }

  function capture(root, options) {
    const rootRect = root.getBoundingClientRect();
    const rootCs = getComputedStyle(root);
    // The slide may itself be shown scaled (decks fit themselves to the window with a transform).
    const logicalW = root.offsetWidth || rootRect.width;
    const logicalH = root.offsetHeight || rootRect.height;
    const viewScale = rootRect.width / logicalW; // screen px per source CSS px
    const k = Math.min(W / logicalW, H / logicalH); // source CSS px -> model px
    const offX = (W - logicalW * k) / 2;
    const offY = (H - logicalH * k) / 2;
    const ctx = { k, keepAnimations: Boolean(options.keepAnimations) };
    // Rectangles come from the browser already transformed; lengths read from computed styles
    // (font sizes, borders, radii) do not. Inside a scaled subtree they need the extra factor.
    let kl = k; // CSS px of the element being walked -> model px
    let vl = viewScale; // CSS px of the element being walked -> screen px
    state.nodes = [];
    state.ctx = { root, rootRect, viewScale, k, offX, offY };

    const frameOf = (r) => ({
      x: round(((r.left - rootRect.left) / viewScale) * k + offX),
      y: round(((r.top - rootRect.top) / viewScale) * k + offY),
      w: round((r.width / viewScale) * k),
      h: round((r.height / viewScale) * k),
    });
    const contentRect = (el, cs) => {
      const r = el.getBoundingClientRect();
      const l = (num(cs.borderLeftWidth) + num(cs.paddingLeft)) * vl;
      const t = (num(cs.borderTopWidth) + num(cs.paddingTop)) * vl;
      const rr = (num(cs.borderRightWidth) + num(cs.paddingRight)) * vl;
      const b = (num(cs.borderBottomWidth) + num(cs.paddingBottom)) * vl;
      return { left: r.left + l, top: r.top + t, width: Math.max(0, r.width - l - rr), height: Math.max(0, r.height - t - b) };
    };
    const register = (el, deep) => state.nodes.push({ el, deep }) - 1;

    /**
     * The box an element's borders are painted in. In a table with collapsed borders a cell's
     * border is centred on the cell edge: half of it lies outside the cell's own rectangle.
     */
    /**
     * Where the browser actually paints a box. Outside transforms it snaps box edges to whole
     * pixels; a converted box at the unsnapped position would be drawn half a pixel off.
     */
    function snap(r) {
      if (Math.abs(vl - 1) > 1e-6) return r;
      const left = Math.round(r.left);
      const top = Math.round(r.top);
      const right = Math.round(r.left + r.width);
      const bottom = Math.round(r.top + r.height);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function paintRect(el, cs) {
      const r = snap(el.getBoundingClientRect());
      if (cs.display !== 'table-cell') return r;
      const table = el.closest('table');
      if (!table || getComputedStyle(table).borderCollapse !== 'collapse') return r;
      // Collapsed borders straddle the cell edge. How the halves are split is the browser's
      // choice; `options.collapse` exists to measure which split matches (see ADR-005).
      const mode = options.collapse || 'center';
      if (mode === 'inside') return r;
      const share = mode === 'outside' ? 1 : 0.5;
      const part = (side) => (cs[`border${side}Style`] === 'none' ? 0 : num(cs[`border${side}Width`]) * vl * share);
      const [t, rr, b, l] = ['Top', 'Right', 'Bottom', 'Left'].map(part);
      return { left: r.left - l, top: r.top - t, width: r.width + l + rr, height: r.height + t + b, right: r.right + rr, bottom: r.bottom + b };
    }

    const elements = [];
    const usedFamilies = new Set();
    const stats = { textChars: 0, items: 0 };
    let order = 0;

    const emit = (element, el, zKey, opacity) => {
      if (opacity < 1) element.opacity = round(opacity);
      element._zp = zKey.path;
      element._scaled = Math.abs(kl / k - 1) > 1e-6;
      element._order = zKey.seq;
      element._emit = order++;
      const r = el.getBoundingClientRect();
      element._src = { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
      elements.push(element);
      return element;
    };

    function shapeFrom(el, cs, paint) {
      const shape = { type: 'shape', frame: frameOf(paintRect(el, cs)), name: describe(el) };
      const css = {};
      if (alphaOf(cs.backgroundColor) > 0) shape.fill = { kind: 'solid', color: cs.backgroundColor };
      if (cs.backgroundImage !== 'none') {
        const kind = /gradient\(/.test(cs.backgroundImage) && !/url\(/.test(cs.backgroundImage) ? 'gradient' : 'image';
        shape.fill = { kind, css: scalePx(cs.backgroundImage, kl), under: shape.fill?.color };
        if (cs.backgroundSize !== 'auto') css['background-size'] = scalePx(cs.backgroundSize, kl);
        if (cs.backgroundPosition !== '0% 0%') css['background-position'] = scalePx(cs.backgroundPosition, kl);
        if (cs.backgroundRepeat !== 'repeat') css['background-repeat'] = cs.backgroundRepeat;
        if (cs.backgroundClip !== 'border-box') css['background-clip'] = cs.backgroundClip;
        if (cs.backgroundOrigin !== 'padding-box') css['background-origin'] = cs.backgroundOrigin;
        if (cs.backgroundBlendMode !== 'normal') css['background-blend-mode'] = cs.backgroundBlendMode;
      }
      if (paint.hasBorder) {
        const [t, r, b, l] = paint.borders;
        const same = [r, b, l].every((x) => x.width === t.width && x.style === t.style && x.color === t.color);
        if (same) shape.stroke = { width: round(t.width * kl), style: t.style, color: t.color };
        else {
          for (const [side, bd] of [['top', t], ['right', r], ['bottom', b], ['left', l]]) {
            if (bd.width > 0 && bd.style !== 'none') css[`border-${side}`] = `${round(bd.width * kl)}px ${bd.style} ${bd.color}`;
          }
        }
      }
      const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
      if (radii.some((r) => r !== '0px')) {
        if (radii.every((r) => r === radii[0]) && /^[\d.]+px$/.test(radii[0])) shape.radius = round(num(radii[0]) * kl);
        else css['border-radius'] = radii.map((r) => scalePx(r, kl)).join(' ');
      }
      if (cs.boxShadow !== 'none') shape.shadow = scalePx(cs.boxShadow, kl);
      if (cs.outlineStyle !== 'none' && num(cs.outlineWidth) > 0) css.outline = `${round(num(cs.outlineWidth) * kl)}px ${cs.outlineStyle} ${cs.outlineColor}`;
      if (cs.backdropFilter && cs.backdropFilter !== 'none') css['backdrop-filter'] = scalePx(cs.backdropFilter, kl);
      if (Object.keys(css).length) shape.css = css;
      return shape;
    }

    /** Client rects of a range grouped into lines, relative to the slide root (screen px). */
    function lineBoxes(rects, origin) {
      const lines = [];
      const sorted = rects.filter((r) => r.width > 0.5 && r.height > 0.5).sort((p, q) => p.top - q.top || p.left - q.left);
      for (const r of sorted) {
        const cy = r.top + r.height / 2;
        const line = lines.find((l) => cy > l.top && cy < l.bottom);
        if (line) {
          line.left = Math.min(line.left, r.left);
          line.right = Math.max(line.right, r.right);
          line.top = Math.min(line.top, r.top);
          line.bottom = Math.max(line.bottom, r.bottom);
        } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      return lines.map((l) => ({ left: l.left - origin.left, right: l.right - origin.left, top: l.top - origin.top, bottom: l.bottom - origin.top }));
    }

    function textFrom(el, cs, opacity, zKey) {
      const runs = collectRuns(el, cs, kl);
      if (!runs.length) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const lineRects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!lineRects.length) return;
      const lines = new Set(lineRects.map((r) => Math.round(r.top))).size;
      const isFlexish = /flex|grid/.test(cs.display);
      const inline = cs.display === 'inline';
      let rect;
      let nowrap = false;
      if (isFlexish || inline) {
        // The text is an anonymous item placed by the container: measure the glyph boxes themselves.
        const rr = range.getBoundingClientRect();
        const lh = cs.lineHeight === 'normal' ? lineRects[0].height : num(cs.lineHeight) * vl;
        const halfLeading = (lh - lineRects[0].height) / 2;
        rect = { left: rr.left, top: rr.top - halfLeading, width: rr.width, height: rr.height + 2 * halfLeading };
      } else {
        rect = contentRect(el, cs);
        if (cs.display === 'table-cell') {
          // A cell aligns its content vertically (middle, baseline): the lines do not start at
          // the top of the content box.
          const rr = range.getBoundingClientRect();
          const lh = cs.lineHeight === 'normal' ? lineRects[0].height : num(cs.lineHeight) * vl;
          const halfLeading = (lh - lineRects[0].height) / 2;
          rect = { left: rect.left, top: rr.top - halfLeading, width: rect.width, height: rr.height + 2 * halfLeading };
        }
      }
      nowrap = lines === 1;
      const align = { left: cs.direction === 'rtl' ? 'end' : 'start', right: cs.direction === 'rtl' ? 'start' : 'end', '-webkit-center': 'center', '-webkit-left': 'start', '-webkit-right': 'end' }[cs.textAlign] || cs.textAlign;
      const text = {
        type: 'text',
        frame: frameOf(rect),
        name: describe(el),
        dir: cs.direction,
        align: isFlexish || inline ? 'start' : align,
        lineHeight: cs.lineHeight === 'normal' ? null : round(num(cs.lineHeight) / num(cs.fontSize)),
        // The block's own font: it is the strut that sets the line height, whatever the runs use.
        base: { font: cs.fontFamily, size: round(num(cs.fontSize) * kl), weight: Number(cs.fontWeight) || 400 },
        runs,
      };
      if (nowrap) text.nowrap = true;
      if (/^pre/.test(cs.whiteSpace)) text.whiteSpace = cs.whiteSpace;
      if (cs.display === 'list-item' && cs.listStyleType !== 'none') {
        let index = 1;
        for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (getComputedStyle(s).display === 'list-item') index++;
        const start = el.parentElement?.tagName === 'OL' ? el.parentElement.start : 1;
        text.list = { style: cs.listStyleType, position: cs.listStylePosition, index: index + start - 1 };
      }
      const css = {};
      if (cs.textIndent !== '0px') css['text-indent'] = scalePx(cs.textIndent, kl);
      if (cs.wordSpacing !== '0px') css['word-spacing'] = scalePx(cs.wordSpacing, kl);
      if (cs.wordBreak !== 'normal') css['word-break'] = cs.wordBreak;
      if (cs.overflowWrap !== 'normal') css['overflow-wrap'] = cs.overflowWrap;
      if (cs.textWrap && cs.textWrap !== 'wrap') css['text-wrap'] = cs.textWrap;
      if (cs.hyphens !== 'manual') css.hyphens = cs.hyphens;
      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') {
        css['background-image'] = cs.backgroundImage;
        css['-webkit-background-clip'] = 'text';
        css['background-clip'] = 'text';
        css['-webkit-text-fill-color'] = cs.webkitTextFillColor;
      }
      if (Object.keys(css).length) text.css = css;
      for (const run of runs) run.marks.font.split(',').forEach((f) => usedFamilies.add(f.replace(/["']/g, '').trim().toLowerCase()));
      stats.textChars += runs.reduce((n, r) => n + r.text.length, 0);
      const emitted = emit(text, el, zKey, opacity);
      emitted._node = register(el, true);
      // The comparison with the converted slide uses the glyph boxes of the source: the box they
      // cover, and each line's extent (generated content has no rects, so it cannot be checked).
      const rr = range.getBoundingClientRect();
      emitted._src = { x: rr.left - rootRect.left, y: rr.top - rootRect.top, w: rr.width, h: rr.height };
      const generated = pseudoKind(el, '::before') === 'text' || pseudoKind(el, '::after') === 'text' || el.querySelector('*') && [...el.querySelectorAll('*')].some((c) => pseudoKind(c, '::before') === 'text' || pseudoKind(c, '::after') === 'text');
      emitted._lines = generated ? null : lineBoxes(lineRects, rootRect);
      if (text.list && text.list.position !== 'inside') {
        // The marker hangs outside the box, on the start side: it belongs to this element too.
        const hang = num(cs.fontSize) * vl * 1.8;
        emitted._src.w += hang;
        if (cs.direction !== 'rtl') emitted._src.x -= hang;
      }
    }

    function htmlFrom(el, deep, reason, opacity, zKey) {
      const node = register(el, deep);
      const html = emit({ type: 'html', frame: frameOf(el.getBoundingClientRect()), name: describe(el), reason, deep, node, ...copyGeometry(el) }, el, zKey, opacity);
      html._node = node;
      return html;
    }

    /**
     * Paint order follows CSS stacking: z-index only orders siblings inside the same stacking
     * context. Each element carries the path of [z-index, positioned, visit number] of the
     * positioned or context-forming ancestors between the root and itself.
     */
    let visit = 0;
    function zOf(el, cs, inherited) {
      const seq = visit++;
      const positioned = cs.position !== 'static';
      const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : '';
      const zApplies = positioned || /flex|grid/.test(parentDisplay);
      const context =
        (zApplies && cs.zIndex !== 'auto') ||
        cs.position === 'fixed' ||
        cs.position === 'sticky' ||
        num(cs.opacity) < 1 ||
        cs.transform !== 'none' ||
        cs.filter !== 'none' ||
        cs.perspective !== 'none' ||
        cs.isolation === 'isolate' ||
        cs.mixBlendMode !== 'normal' ||
        cs.clipPath !== 'none' ||
        (cs.backdropFilter && cs.backdropFilter !== 'none') ||
        /transform|opacity/.test(cs.willChange) ||
        /paint|strict|content/.test(cs.contain);
      if (!context && !positioned) return { path: inherited.path, seq };
      const z = zApplies && cs.zIndex !== 'auto' ? Number(cs.zIndex) || 0 : 0;
      return { path: [...inherited.path, [z, positioned ? 1 : 0, seq]], seq };
    }
    function paintOrder(a, b) {
      const A = a._zp;
      const B = b._zp;
      for (let i = 0; i < Math.max(A.length, B.length); i++) {
        // Content that is not inside a further participant paints like z 0, not positioned.
        const x = A[i] || [0, 0, a._order];
        const y = B[i] || [0, 0, b._order];
        if (A[i] && B[i] && x[2] === y[2]) continue; // same ancestor
        if (x[0] !== y[0]) return x[0] - y[0];
        if (x[1] !== y[1]) return x[1] - y[1];
        return x[2] - y[2];
      }
      return a._emit - b._emit;
    }

    function walk(el, opacity, zInherited, isRoot, scale) {
      const cs = isRoot ? rootCs : getComputedStyle(el);
      if (!isRoot && isHidden(cs)) return;
      // A uniformly scaled element scales everything in it, itself included.
      const local = isRoot ? 1 : scale * (uniformScale(cs) ?? 1);
      const saved = [kl, vl];
      kl = k * local;
      vl = viewScale * local;
      try {
        walkBody(el, cs, opacity, zInherited, isRoot, local);
      } finally {
        [kl, vl] = saved;
      }
    }

    function walkBody(el, cs, opacity, zInherited, isRoot, scale) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript' || tag === 'head') return;
      const r = el.getBoundingClientRect();
      const boxless = cs.display === 'contents';
      // Clipped to nothing: content kept for assistive technology, never shown.
      const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || (cs.clip && cs.clip !== 'auto');
      if (!isRoot && clips && (r.width <= 2 || r.height <= 2)) return;
      if (!boxless && (r.width === 0 || r.height === 0) && cs.overflow !== 'visible') return;
      // Entirely outside the slide: not part of the picture.
      if (!boxless && !isRoot && (r.right < rootRect.left || r.left > rootRect.right || r.bottom < rootRect.top || r.top > rootRect.bottom)) return;

      const zKey = isRoot ? { path: [], seq: visit++ } : zOf(el, cs, zInherited);
      const selfOpacity = isRoot ? 1 : opacity * num(cs.opacity);
      const paint = boxless ? { any: false } : ownPaint(cs);

      if (!isRoot) {
        const effect = subtreeEffect(cs, ctx);
        if (effect) {
          stats.items++;
          htmlFrom(el, true, effect, opacity, zKey);
          return;
        }
      }

      if (el instanceof SVGElement) {
        if (tag !== 'svg') return;
        stats.items++;
        const svg = emit({ type: 'svg', frame: frameOf(r), name: describe(el), node: register(el, true), ...copyGeometry(el) }, el, zKey, selfOpacity);
        svg._node = svg.node;
        return;
      }
      if (tag === 'img') {
        stats.items++;
        const image = emit({ type: 'image', frame: frameOf(snap(contentRect(el, cs))), name: el.alt || describe(el), src: el.currentSrc || el.src, fit: cs.objectFit, position: cs.objectPosition }, el, zKey, selfOpacity);
        image._node = register(el, true);
        const css = {};
        const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
        if (radii.some((x) => x !== '0px')) {
          if (radii.every((x) => x === radii[0]) && /^[\d.]+px$/.test(radii[0])) image.radius = round(num(radii[0]) * kl);
          else css['border-radius'] = radii.map((x) => scalePx(x, kl)).join(' ');
        }
        if (cs.boxShadow !== 'none') image.shadow = scalePx(cs.boxShadow, kl);
        if (paint.hasBorder) {
          const b = paint.borders[0];
          image.frame = frameOf(r);
          css.border = `${round(b.width * kl)}px ${b.style} ${b.color}`;
          css['box-sizing'] = 'border-box';
        }
        if (Object.keys(css).length) image.css = css;
        if (alt(el)) image.alt = el.alt;
        return;
      }
      if (['canvas', 'video', 'audio', 'iframe', 'object', 'embed', 'input', 'select', 'textarea', 'button', 'math', 'progress', 'meter'].includes(tag)) {
        stats.items++;
        htmlFrom(el, true, `<${tag}>`, opacity, zKey);
        return;
      }

      const pseudoBox = !boxless && (pseudoKind(el, '::before') === 'box' || pseudoKind(el, '::after') === 'box');
      const textBlock = !boxless && hasAnyText(el) && isPureInline(el) && (hasOwnText(el) || composedChildren(el).every((c) => getComputedStyle(c).display === 'inline' || getComputedStyle(c).display === 'none'));

      // The root's own paint is the slide background when it simply fills the slide (see below);
      // otherwise it is a shape like any other, drawn over whatever is behind the slide.
      if ((!isRoot || !rootIsBackground) && (paint.any || pseudoBox)) {
        stats.items++;
        if (pseudoBox) {
          // Pseudo-elements have no rect to measure: the element's own box stays HTML, its content
          // is still converted.
          htmlFrom(el, false, 'pseudo-element', selfOpacity, zKey);
        } else {
          const shape = emit(shapeFrom(el, cs, paint), el, zKey, selfOpacity);
          const pr = paintRect(el, cs);
          shape._src = { x: pr.left - rootRect.left, y: pr.top - rootRect.top, w: pr.width, h: pr.height };
          shape._node = register(el, false);
        }
      }

      if (textBlock) {
        stats.items++;
        textFrom(el, cs, selfOpacity, zKey);
        return;
      }

      // A container that mixes its own text with block children: each text node becomes a box.
      if (hasOwnText(el)) {
        for (const child of composedChildNodes(el)) {
          if (child.nodeType !== 3 || child.data.trim() === '') continue;
          stats.items++;
          const range = document.createRange();
          range.selectNode(child);
          const rects = [...range.getClientRects()].filter((x) => x.width > 0);
          if (!rects.length) continue;
          const rr = range.getBoundingClientRect();
          const lh = cs.lineHeight === 'normal' ? rects[0].height : num(cs.lineHeight) * vl;
          const half = (lh - rects[0].height) / 2;
          const oneLine = new Set(rects.map((x) => Math.round(x.top))).size === 1;
          const text = emit(
            {
              type: 'text',
              frame: frameOf({ left: rr.left, top: rr.top - half, width: rr.width, height: rr.height + 2 * half }),
              name: `${describe(el)} (text)`,
              dir: cs.direction,
              align: 'start',
              lineHeight: cs.lineHeight === 'normal' ? null : round(num(cs.lineHeight) / num(cs.fontSize)),
              base: { font: cs.fontFamily, size: round(num(cs.fontSize) * kl), weight: Number(cs.fontWeight) || 400 },
              runs: [{ text: child.data.replace(/\s+/g, ' ').trim(), marks: marksOf(cs, kl) }],
              nowrap: oneLine,
            },
            el,
            zKey,
            selfOpacity,
          );
          text._src = { x: rr.left - rootRect.left, y: rr.top - rootRect.top, w: rr.width, h: rr.height };
          text._lines = lineBoxes(rects, rootRect);
          text._node = register(el, true);
          cs.fontFamily.split(',').forEach((f) => usedFamilies.add(f.replace(/["']/g, '').trim().toLowerCase()));
          stats.textChars += child.data.trim().length;
        }
      }
      for (const child of composedChildren(el)) walk(child, selfOpacity, zKey, false, scale);
    }
    const alt = (el) => el.hasAttribute('alt') && el.alt !== '';

    const rootPaint = ownPaint(rootCs);
    const rootRadius = [rootCs.borderTopLeftRadius, rootCs.borderTopRightRadius, rootCs.borderBottomRightRadius, rootCs.borderBottomLeftRadius].some((x) => x !== '0px');
    const rootPseudo = pseudoKind(root, '::before') === 'box' || pseudoKind(root, '::after') === 'box';
    // An opaque colour or a background image that fills the slide is the slide background. With an
    // image over a non-opaque colour, the host still looks at what is behind (`needsBackdrop`).
    const rootIsBackground = (alphaOf(rootCs.backgroundColor) === 1 || rootCs.backgroundImage !== 'none') && !rootPaint.hasBorder && !rootRadius && !rootPseudo;

    walk(root, 1, { path: [], seq: 0 }, true, 1);

    elements.sort(paintOrder);

    const background = rootIsBackground
      ? { color: alphaOf(rootCs.backgroundColor) > 0 ? rootCs.backgroundColor : null, needsBackdrop: alphaOf(rootCs.backgroundColor) < 1, image: rootCs.backgroundImage !== 'none' ? scalePx(rootCs.backgroundImage, k) : null, size: scalePx(rootCs.backgroundSize, k), position: scalePx(rootCs.backgroundPosition, k), repeat: rootCs.backgroundRepeat }
      : null;

    return {
      source: { width: logicalW, height: logicalH, viewScale, rect: { x: rootRect.left, y: rootRect.top, w: rootRect.width, h: rootRect.height } },
      // Scale factors are kept exact: rounding 0.902083 to 0.9 shifts a 1920px slide by 4px.
      k,
      dir: rootCs.direction,
      lang: root.closest('[lang]')?.lang || document.documentElement.lang || null,
      background,
      elements,
      usedFamilies: [...usedFamilies],
      stats,
    };
  }

  /** Counts the leaf items (text blocks, pictures, painted boxes) inside a subtree. */
  function countItems(el) {
    let items = 0;
    let chars = 0;
    (function walk(node) {
      const cs = getComputedStyle(node);
      if (isHidden(cs)) return;
      const tag = node.tagName.toLowerCase();
      if (node instanceof SVGElement || ['img', 'canvas', 'video', 'iframe'].includes(tag)) {
        items++;
        return;
      }
      if (ownPaint(cs).any) items++;
      if (hasAnyText(node) && isPureInline(node)) {
        items++;
        chars += node.textContent.replace(/\s+/g, ' ').trim().length;
        return;
      }
      for (const child of composedChildren(node)) walk(child);
    })(el);
    return { items: Math.max(1, items), chars };
  }

  // ------------------------------------------------------------------------- finishing a capture
  /** Resolves everything that needs async work: image sources, html/svg markup, fonts. */
  async function captureSlide(root, options) {
    return finalize(capture(root, options || {}));
  }

  async function finalize(model) {
    const animations = new Set();
    const families = new Set(model.usedFamilies);
    for (const element of model.elements) {
      if (element.type === 'image') element.src = await toDataUrl(element.src);
      if (element.type === 'shape' && element.fill?.css && /url\(/.test(element.fill.css)) element.fill.css = await inlineCssUrls(element.fill.css);
      if (element.type === 'html' || element.type === 'svg') await fillMarkup(element, animations, families);
    }
    if (model.background?.image && /url\(/.test(model.background.image)) model.background.image = await inlineCssUrls(model.background.image);
    const fonts = await collectFontFaces(families);
    model.fontFaces = fonts.rules;
    model.fontsMissing = fonts.missing;
    model.keyframes = collectKeyframes(animations);
    return model;
  }

  async function fillMarkup(element, animations, families) {
    const { el, deep } = state.nodes[element.node];
    const snap = await snapshot(el, deep);
    element.markup = snap.html;
    if (snap.lossy.length) element.lossy = snap.lossy;
    snap.animations.forEach((n) => animations.add(n));
    snap.families.forEach((f) => families.add(f));
    if (element.type === 'html') {
      const counted = deep ? countItems(el) : { items: 1, chars: 0 };
      element.swallowed = counted;
    }
  }

  /** Fidelity guard: replace converted elements by an `html` copy of their source node. */
  async function fallback(nodeIndex, deep, reason) {
    const { el } = state.nodes[nodeIndex];
    const { rootRect, viewScale, k, offX, offY } = state.ctx;
    const r = el.getBoundingClientRect();
    const node = state.nodes.push({ el, deep }) - 1;
    const html = {
      type: 'html',
      frame: {
        x: round(((r.left - rootRect.left) / viewScale) * k + offX),
        y: round(((r.top - rootRect.top) / viewScale) * k + offY),
        w: round((r.width / viewScale) * k),
        h: round((r.height / viewScale) * k),
      },
      name: describe(el),
      reason,
      deep,
      node,
      ...copyGeometry(el),
      _node: node,
      _src: { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height },
    };
    html._scaled = Math.abs(html.scale / k - 1) > 1e-6;
    const animations = new Set();
    const families = new Set();
    await fillMarkup(html, animations, families);
    const fonts = await collectFontFaces(families);
    return { html, fontFaces: fonts.rules, keyframes: collectKeyframes(animations) };
  }

  /** Which of the given registered nodes sit inside (or are) the registered container. */
  function inside(nodeIndexes, containerIndex) {
    const container = state.nodes[containerIndex].el;
    return nodeIndexes.map((i) => {
      for (let n = state.nodes[i].el; n; n = n.parentNode || n.host) if (n === container) return true;
      return false;
    });
  }

  /** Finite animations and transitions jump to their end; endless ones freeze where they are. */
  function settle() {
    let finished = 0;
    let paused = 0;
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming?.();
      if (timing && timing.endTime === Infinity) {
        animation.pause();
        paused++;
      } else {
        try {
          animation.finish();
          finished++;
        } catch {
          animation.pause();
          paused++;
        }
      }
    }
    return { finished, paused };
  }

  /** Smallest element under the captured root whose box contains the given source-space rect. */
  function smallestContainer(rect) {
    const { rootRect, root } = state.ctx;
    const abs = { left: rect.x + rootRect.left, top: rect.y + rootRect.top, right: rect.x + rect.w + rootRect.left, bottom: rect.y + rect.h + rootRect.top };
    let best = root;
    (function walk(el) {
      for (const child of composedChildren(el)) {
        const cs = getComputedStyle(child);
        if (isHidden(cs)) continue;
        const r = child.getBoundingClientRect();
        if (r.left <= abs.left + 1 && r.top <= abs.top + 1 && r.right >= abs.right - 1 && r.bottom >= abs.bottom - 1) {
          best = child;
          walk(child);
          return;
        }
      }
    })(root);
    return state.nodes.push({ el: best, deep: true }) - 1;
  }

  window.__slidrImport = { outline, pageInfo, captureSlide, fallback, inside, smallestContainer, settle, state, describe };
})();
