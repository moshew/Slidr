// Spike S5: a minimal renderer, model -> HTML, used to check a converted slide against its source.
// (In the product this is `packages/renderer`.) The model is 1920x1080; `view` says how to show
// it at the pixel size of the source so the two pictures can be compared pixel by pixel.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssOf = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}:${v};`).join('');
const box = (f) => `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;`;

function runHtml(run) {
  const m = run.marks;
  let style = `font-family:${m.font};font-size:${m.size}px;font-weight:${m.weight};color:${m.color};`;
  if (m.italic) style += 'font-style:italic;';
  const deco = [m.underline && 'underline', m.strike && 'line-through'].filter(Boolean).join(' ');
  if (deco) style += `text-decoration-line:${deco};`;
  if (m.letterSpacing !== undefined) style += `letter-spacing:${m.letterSpacing}px;`;
  if (m.case) style += `text-transform:${m.case};`;
  if (m.script) style += `vertical-align:${m.script === 'sup' ? 'super' : 'sub'};`;
  if (m.highlight) style += `background-color:${m.highlight};`;
  style += cssOf(m.css);
  return `<span style="${esc(style)}">${esc(run.text)}</span>`;
}

function elementHtml(e, k, i, mode) {
  const common = `position:absolute;box-sizing:border-box;margin:0;${box(e.frame)}${e.opacity !== undefined ? `opacity:${e.opacity};` : ''}`;
  switch (e.type) {
    case 'shape': {
      let style = common;
      if (e.fill?.kind === 'solid') style += `background-color:${e.fill.color};`;
      if (e.fill?.css) style += `${e.fill.under ? `background-color:${e.fill.under};` : ''}background-image:${e.fill.css};`;
      // Solid strokes are drawn as inset shadows. A CSS border is snapped to whole device pixels,
      // so a 1.44px line of a scaled source would come out 1px; a shadow keeps the fraction.
      const shadows = [];
      const css = { ...(e.css || {}) };
      if (e.stroke?.style === 'solid') shadows.push(`inset 0 0 0 ${e.stroke.width}px ${e.stroke.color}`);
      else if (e.stroke) style += `border:${e.stroke.width}px ${e.stroke.style} ${e.stroke.color};`;
      for (const [side, x, y] of [['top', 0, 1], ['right', -1, 0], ['bottom', 0, -1], ['left', 1, 0]]) {
        const m = css[`border-${side}`]?.match(/^([\d.]+)px solid (.+)$/);
        if (!m) continue;
        shadows.push(`inset ${x * m[1]}px ${y * m[1]}px 0 0 ${m[2]}`);
        delete css[`border-${side}`];
      }
      if (e.shadow) shadows.push(e.shadow);
      if (e.radius !== undefined) style += `border-radius:${e.radius}px;`;
      if (shadows.length) style += `box-shadow:${shadows.join(',')};`;
      return `<div data-type="shape" data-i="${i}" style="${esc(style + cssOf(css))}"></div>`;
    }
    case 'image': {
      let style = `${common}object-fit:${e.fit};object-position:${e.position};`;
      if (e.radius !== undefined) style += `border-radius:${e.radius}px;`;
      if (e.shadow) style += `box-shadow:${e.shadow};`;
      return `<img data-type="image" data-i="${i}" alt="${esc(e.alt || '')}" src="${esc(e.src)}" style="${esc(style + cssOf(e.css))}">`;
    }
    case 'text': {
      let style = `${common}direction:${e.dir};text-align:${e.align};overflow:visible;`;
      style += `font-family:${e.base.font};font-size:${e.base.size}px;font-weight:${e.base.weight};`;
      style += `line-height:${e.lineHeight ?? 'normal'};`;
      // pre-line: runs are already collapsed like the source; forced breaks are newlines. Unlike
      // pre-wrap, a space at a soft wrap takes no room, as in normal flow.
      style += `white-space:${e.nowrap ? 'pre' : e.whiteSpace || 'pre-line'};`;
      const runs = e.runs.map(runHtml).join('');
      const body = e.list
        ? `<div style="display:list-item;list-style:${e.list.style} ${e.list.position};counter-set:list-item ${e.list.index};">${runs}</div>`
        : runs;
      return `<div data-type="text" data-i="${i}" style="${esc(style + cssOf(e.css))}">${body}</div>`;
    }
    case 'svg':
    case 'html': {
      // A copy is in the CSS px of its source and keeps its own transform. The wrapper applies the
      // scale of everything that was above it and puts its untransformed box where it belongs
      // inside the transformed bounding box (the frame).
      const scale = e.scale ?? k;
      const natural = e.natural ?? { w: e.frame.w / k, h: e.frame.h / k };
      const inset = e.inset ?? { x: 0, y: 0 };
      // `all` leaves `direction` alone, and an inherited rtl would push the copy to the other side.
      const open = `<div data-type="${e.type}" data-i="${i}" style="all:initial;direction:ltr;${esc(common)}">`;
      if (mode === 'layout') {
        // The slide is zoomed to source units. The copy undoes that zoom, so it is laid out at its
        // natural size exactly as in the source, and keeps only the scale its ancestors gave it.
        const above = scale / k;
        const transform = Math.abs(above - 1) > 1e-6 ? `transform:scale(${above});transform-origin:0 0;` : '';
        return `${open}<div style="position:absolute;left:${inset.x}px;top:${inset.y}px;"><div style="zoom:${k};width:${natural.w}px;height:${natural.h}px;${transform}">${e.markup}</div></div></div>`;
      }
      const inner = `position:absolute;left:${inset.x}px;top:${inset.y}px;width:${natural.w}px;height:${natural.h}px;transform:scale(${scale});transform-origin:0 0;`;
      return `${open}<div style="${inner}">${e.markup}</div></div>`;
    }
    default:
      return '';
  }
}

export function backgroundCss(bg) {
  if (!bg) return '';
  let style = '';
  if (bg.color) style += `background-color:${bg.color};`;
  // Layers, top first: the slide's own image, then the picture of what was behind it.
  const layers = [];
  if (bg.image) layers.push({ image: bg.image, size: bg.size || 'auto', position: bg.position || '0% 0%', repeat: bg.repeat || 'repeat' });
  if (bg.raster) layers.push({ image: `url(${bg.raster})`, size: bg.rasterSize, position: bg.rasterPosition, repeat: 'no-repeat' });
  if (layers.length) {
    style += `background-image:${layers.map((l) => l.image).join(',')};background-size:${layers.map((l) => l.size).join(',')};`;
    style += `background-position:${layers.map((l) => l.position).join(',')};background-repeat:${layers.map((l) => l.repeat).join(',')};`;
  }
  return style;
}

/**
 * @param slide  converted slide (model units)
 * @param view   { viewScale, offX, offY }: show the slide's source area at source pixel size
 * @param mode   'transform': the 1920 layout shown through a scale transform, the way Slidr shows
 *               a slide. 'layout': the same model zoomed into the source's own CSS px and shown
 *               through the source's own view transform only, i.e. rasterised the way the source
 *               was. Pictures are compared in 'layout'; wraps are checked in 'transform'.
 */
export function slideDocument(slide, fonts, view, mode = 'transform') {
  const elements = slide.elements.map((e, i) => elementHtml(e, slide.k, i, mode)).join('\n');
  const head = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#fff;overflow:hidden}
${fonts.join('\n')}
${(slide.keyframes || []).join('\n')}
</style></head>`;
  if (mode === 'layout') {
    // No transform at all when the source had none: a transform, even an identity one, changes
    // how text is anti-aliased.
    const outer = Math.abs(view.viewScale - 1) > 1e-6 ? `transform:scale(${view.viewScale});transform-origin:0 0;` : '';
    return `${head}
<body><div style="position:absolute;left:${view.fx || 0}px;top:${view.fy || 0}px;${outer}"><div id="slide" dir="${slide.dir || 'ltr'}" style="position:absolute;zoom:${1 / slide.k};left:${-view.offX}px;top:${-view.offY}px;width:1920px;height:1080px;overflow:hidden;${esc(backgroundCss(slide.background))}">
${elements}
</div></div></body></html>`;
  }
  const transform = view ? `transform:scale(${view.viewScale / slide.k}) translate(${-view.offX}px, ${-view.offY}px);transform-origin:0 0;` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#fff;overflow:hidden}
${fonts.join('\n')}
${(slide.keyframes || []).join('\n')}
</style></head>
<body><div id="slide" dir="${slide.dir || 'ltr'}" style="position:absolute;left:${view?.fx || 0}px;top:${view?.fy || 0}px;width:1920px;height:1080px;overflow:hidden;${transform}${esc(backgroundCss(slide.background))}">
${elements}
</div></body></html>`;
}
