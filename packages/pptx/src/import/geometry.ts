import { extraShapes, shapePresets } from '@slidr/renderer';
import { drawingPathToSegments, evaluateGuides, type Guide, type PathCommand } from '../path';
import { attr, child, children, intAttr, type XmlElement } from '../xml';

/*
 * The outline of a shape: a preset of PowerPoint as the preset of Slidr that draws it, with its
 * adjustments turned from one scale to the other; custom geometry as path data.
 */

export type Geometry =
  | { kind: 'preset'; preset: string; adjust?: number[] }
  | { kind: 'path'; d: string; viewBox: { w: number; h: number } };

/** The presets of PowerPoint the shapes of Slidr draw as they are, by name. */
const SAME = [
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'diamond',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'heptagon',
  'octagon',
  'decagon',
  'plus',
  'chevron',
  'homePlate',
  'wedgeRectCallout',
  'wedgeRoundRectCallout',
  'donut',
  'frame',
  'heart',
  'leftBracket',
  'rightBracket',
  'leftBrace',
  'rightBrace',
];

const RENAMED: Record<string, string> = {
  rtTriangle: 'rightTriangle',
  rightArrow: 'arrowRight',
  leftArrow: 'arrowLeft',
  upArrow: 'arrowUp',
  downArrow: 'arrowDown',
  leftRightArrow: 'arrowLeftRight',
  dodecagon: 'polygon12',
  flowChartProcess: 'rect',
  flowChartAlternateProcess: 'roundRect',
  flowChartDecision: 'diamond',
  flowChartConnector: 'ellipse',
  flowChartTerminator: 'roundRect',
  flowChartPreparation: 'hexagon',
  flowChartManualOperation: 'trapezoid',
  flowChartInputOutput: 'parallelogram',
  flowChartOffpageConnector: 'homePlate',
  snip1Rect: 'rect',
  snip2SameRect: 'rect',
  round1Rect: 'roundRect',
  round2SameRect: 'roundRect',
  round2DiagRect: 'roundRect',
  plaque: 'roundRect',
  wedgeEllipseCallout: 'wedgeRoundRectCallout',
  cloudCallout: 'wedgeRoundRectCallout',
  ellipseRibbon: 'rect',
  textBox: 'rect',
};

/** The presets drawn as a rectangle of Slidr while they are something else in PowerPoint. */
const NEAR = new Set([
  'snip1Rect',
  'snip2SameRect',
  'round1Rect',
  'round2SameRect',
  'round2DiagRect',
  'plaque',
  'wedgeEllipseCallout',
  'cloudCallout',
  'ellipseRibbon',
]);

/** The adjustments of a preset, by guide name, in DrawingML's units. */
function adjustments(prstGeom: XmlElement): Record<string, number> {
  const out: Record<string, number> = {};
  for (const gd of children(child(prstGeom, 'a:avLst'), 'a:gd')) {
    const name = attr(gd, 'name');
    const m = /^val\s+(-?[\d.]+)$/.exec(attr(gd, 'fmla') ?? '');
    if (name && m) out[name] = Number(m[1]);
  }
  return out;
}

/** A preset of PowerPoint as Slidr's geometry; undefined for a line or one it has no outline for. */
export function presetGeometry(
  prstGeom: XmlElement,
  box: { w: number; h: number },
): { geometry: Geometry; approximated: boolean } | undefined {
  const prst = attr(prstGeom, 'prst') ?? 'rect';
  const adj = adjustments(prstGeom);
  const ss = Math.max(1, Math.min(box.w, box.h));
  const frac = (v: number | undefined, fallback: number) => (v ?? fallback) / 100000;
  if (/^star(\d+)$/.test(prst)) {
    const name = prst;
    if (shapePresets.includes(name))
      return { geometry: { kind: 'preset', preset: name }, approximated: false };
  }
  const name = RENAMED[prst] ?? (SAME.includes(prst) ? prst : undefined);
  if (!name || !(shapePresets.includes(name) || name in extraShapes)) return undefined;
  let adjust: number[] | undefined;
  switch (prst) {
    case 'roundRect':
    case 'round1Rect':
    case 'round2SameRect':
    case 'round2DiagRect':
    case 'plaque':
      adjust = [frac(adj.adj ?? adj.adj1, 16667)];
      break;
    case 'flowChartTerminator':
      adjust = [0.5];
      break;
    case 'triangle':
      adjust = [frac(adj.adj, 50000)];
      break;
    case 'parallelogram':
    case 'trapezoid':
      // DrawingML measures the slant against the shorter side; Slidr against the width.
      adjust = [
        Math.min(prst === 'trapezoid' ? 0.5 : 1, (frac(adj.adj, 25000) * ss) / Math.max(1, box.w)),
      ];
      break;
    case 'chevron':
    case 'homePlate':
      adjust = [Math.min(1, frac(adj.adj, 50000) * 2)];
      break;
    case 'rightArrow':
    case 'leftArrow':
    case 'upArrow':
    case 'downArrow':
    case 'leftRightArrow':
      adjust = [frac(adj.adj1, 50000), frac(adj.adj2, 50000)];
      break;
  }
  return {
    geometry: { kind: 'preset', preset: name, ...(adjust ? { adjust } : {}) },
    approximated: NEAR.has(prst),
  };
}

/** The presets that are lines: a connector or a line, not a shape with an inside. */
export const LINE_PRESETS = new Set([
  'line',
  'lineInv',
  'straightConnector1',
  'bentConnector2',
  'bentConnector3',
  'bentConnector4',
  'bentConnector5',
  'curvedConnector2',
  'curvedConnector3',
  'curvedConnector4',
  'curvedConnector5',
]);

function guides(el: XmlElement | undefined): Guide[] {
  return children(el, 'a:gd').map((gd) => ({
    name: attr(gd, 'name') ?? '',
    fmla: attr(gd, 'fmla') ?? 'val 0',
  }));
}

/**
 * Custom geometry as path data in a box of the shape's size in slide pixels (`box` is in EMU,
 * `pxPerEmu` the scale), and whether it is closed: an outline whose paths are all left unfilled
 * is a line.
 */
export function customGeometry(
  custGeom: XmlElement,
  box: { w: number; h: number },
  pxPerEmu: number,
): { geometry: Geometry; closed: boolean } | undefined {
  const values = evaluateGuides(
    box.w,
    box.h,
    guides(child(custGeom, 'a:avLst')),
    guides(child(custGeom, 'a:gdLst')),
  );
  const svg: string[] = [];
  let filled = false;
  for (const p of children(child(custGeom, 'a:pathLst'), 'a:path')) {
    const pw = intAttr(p, 'w') || box.w;
    const ph = intAttr(p, 'h') || box.h;
    const commands: PathCommand[] = children(p).map((c) => {
      const pts = children(c, 'a:pt').map((pt) => ({
        x: attr(pt, 'x') ?? '0',
        y: attr(pt, 'y') ?? '0',
      }));
      const name = c.name.replace(/^a:/, '') as PathCommand['name'];
      return name === 'arcTo'
        ? {
            name,
            pts,
            arc: {
              wR: attr(c, 'wR') ?? '0',
              hR: attr(c, 'hR') ?? '0',
              stAng: attr(c, 'stAng') ?? '0',
              swAng: attr(c, 'swAng') ?? '0',
            },
          }
        : { name, pts };
    });
    const { svg: d } = drawingPathToSegments(
      commands,
      values,
      (box.w / pw) * pxPerEmu,
      (box.h / ph) * pxPerEmu,
    );
    if (!d.trim()) continue;
    svg.push(d);
    if (attr(p, 'fill') !== 'none') filled = true;
  }
  if (svg.length === 0 || box.w <= 0 || box.h <= 0) return undefined;
  let d = svg.join(' ');
  // An open outline in the model is one whose data does not end by closing it.
  if (!filled) d = d.replace(/\s*Z\s*$/i, '');
  else if (!/z\s*$/i.test(d)) d += ' Z';
  const viewBox = {
    w: Math.max(0.01, Math.round(box.w * pxPerEmu * 100) / 100),
    h: Math.max(0.01, Math.round(box.h * pxPerEmu * 100) / 100),
  };
  return { geometry: { kind: 'path', d, viewBox }, closed: filled };
}
