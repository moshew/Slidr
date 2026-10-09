import { elementSchemas } from '@slidr/model';
import { extraShapes, presetPath, shapePresets } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import { en, he } from './messages';
import {
  centredFrame,
  GLYPH_BOX,
  isOpenPreset,
  LINE_GLYPHS,
  LINE_KINDS,
  newLine,
  newShape,
  SHAPE_GROUPS,
  shapeGlyph,
  shapeLibrary,
} from './shapes';

const slide = { w: 1920, h: 1080 };

describe('the shape library', () => {
  it('shows every preset the renderer draws, each once', () => {
    const shown = shapeLibrary().flatMap((entry) => entry.presets);
    expect([...shown].sort()).toEqual([...shapePresets].sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('adds exactly 150 new editable outlines', () => {
    expect(Object.keys(extraShapes)).toHaveLength(150);
    const outlines = new Set<string>();
    for (const preset of Object.keys(extraShapes)) {
      expect(shapePresets).toContain(preset);
      expect(newShape(preset, slide).geometry).toEqual({ kind: 'preset', preset });
      const outline = presetPath(preset, 360, 360)?.d;
      expect(outline, preset).toBeDefined();
      outlines.add(outline!);
    }
    expect(outlines.size).toBe(150);
  });

  it('names every preset and every group in both languages', () => {
    for (const preset of shapePresets) {
      if (extraShapes[preset]) {
        expect(extraShapes[preset].he, preset).not.toBe('');
        expect(extraShapes[preset].en, preset).not.toBe('');
      } else {
        expect(he.shape, preset).toHaveProperty(preset);
        expect(en.shape, preset).toHaveProperty(preset);
      }
    }
    for (const group of SHAPE_GROUPS) {
      expect(he.library).toHaveProperty(group);
      expect(en.library).toHaveProperty(group);
    }
    for (const kind of LINE_KINDS) {
      expect(he.line).toHaveProperty(kind);
      expect(LINE_GLYPHS).toHaveProperty(kind);
    }
  });

  it('keeps a preset it does not know yet, at the end of the basic group', () => {
    const library = shapeLibrary([...shapePresets, 'futureShape']);
    const basic = library.find((entry) => entry.group === 'basic');
    expect(basic?.presets.at(-1)).toBe('futureShape');
    expect(newShape('futureShape', slide).frame).toMatchObject({ w: 360, h: 360 });
  });

  it('draws a glyph for every preset inside the glyph box', () => {
    for (const preset of shapePresets) {
      const glyph = shapeGlyph(preset);
      expect(glyph, preset).toBeDefined();
      expect(glyph!.x, preset).toBeGreaterThanOrEqual(0);
      expect(glyph!.y, preset).toBeGreaterThanOrEqual(0);
      expect(glyph!.x, preset).toBeLessThan(GLYPH_BOX / 2);
      expect(glyph!.closed, preset).toBe(!isOpenPreset(preset));
    }
  });
});

describe('newShape', () => {
  it('gives a valid shape in the middle of the slide for every preset', () => {
    for (const preset of shapePresets) {
      const shape = newShape(preset, slide);
      expect(elementSchemas.shape.safeParse(shape).success, preset).toBe(true);
      expect(shape.geometry).toEqual({ kind: 'preset', preset });
      const { x, y, w, h } = shape.frame;
      // Frames are whole pixels, so an odd size sits half a pixel off the middle.
      expect(Math.abs(x + w / 2 - 960), preset).toBeLessThanOrEqual(0.5);
      expect(Math.abs(y + h / 2 - 540), preset).toBeLessThanOrEqual(0.5);
      expect(w, preset).toBeGreaterThanOrEqual(80);
      expect(h, preset).toBeLessThanOrEqual(540);
    }
  });

  it('fills a closed shape with the theme primary, and leaves it without an outline', () => {
    const rect = newShape('rect', slide);
    expect(rect.fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
    expect(rect.stroke).toBeUndefined();
    expect(rect).toMatchObject({ rotation: 0, opacity: 1 });
  });

  it('strokes an open outline with the theme text colour instead of filling it', () => {
    for (const preset of ['leftBracket', 'rightBracket', 'leftBrace', 'rightBrace']) {
      expect(isOpenPreset(preset), preset).toBe(true);
      const shape = newShape(preset, slide);
      expect(shape.fill).toEqual({ kind: 'none' });
      expect(shape.stroke).toEqual({ color: { token: 'text' }, width: 4 });
    }
    expect(isOpenPreset('rect')).toBe(false);
    expect(isOpenPreset('donut')).toBe(false);
  });

  it('inserts regular polygons with equal sides', () => {
    // A hexagon standing on a vertex is taller than wide by 2 : sqrt(3).
    const { w, h } = newShape('hexagon', slide).frame;
    expect(h / w).toBeCloseTo(2 / Math.sqrt(3), 2);
    expect(newShape('octagon', slide).frame).toMatchObject({ w: 360, h: 360 });
  });
});

describe('centredFrame', () => {
  it('centres, and steps aside from an element that starts at the same spot', () => {
    const first = centredFrame({ w: 400, h: 200 }, slide);
    expect(first).toEqual({ x: 760, y: 440, w: 400, h: 200 });
    const second = centredFrame({ w: 400, h: 200 }, slide, [first]);
    expect(second).toEqual({ x: 784, y: 464, w: 400, h: 200 });
    const third = centredFrame({ w: 400, h: 200 }, slide, [first, second]);
    expect(third).toMatchObject({ x: 808, y: 488 });
    // An element elsewhere is not in the way.
    expect(centredFrame({ w: 400, h: 200 }, slide, [{ x: 0, y: 0, w: 10, h: 10 }])).toEqual(first);
  });
});

describe('newLine', () => {
  it('gives a valid line for every kind', () => {
    for (const kind of LINE_KINDS) {
      const line = newLine(kind, slide);
      expect(elementSchemas.line.safeParse(line).success, kind).toBe(true);
      expect(line.stroke).toEqual({ color: { token: 'text' }, width: 4 });
      expect(line.points).toHaveLength(2);
    }
  });

  it('sets heads and curve by kind', () => {
    const of = (kind: (typeof LINE_KINDS)[number]) => {
      const { startHead, endHead, curve } = newLine(kind, slide);
      return { startHead, endHead, curve };
    };
    expect(of('line')).toEqual({ startHead: 'none', endHead: 'none', curve: 'straight' });
    expect(of('arrow')).toEqual({ startHead: 'none', endHead: 'triangle', curve: 'straight' });
    expect(of('doubleArrow')).toEqual({
      startHead: 'triangle',
      endHead: 'triangle',
      curve: 'straight',
    });
    expect(of('elbow')).toEqual({ startHead: 'none', endHead: 'none', curve: 'elbow' });
    expect(of('curved')).toEqual({ startHead: 'none', endHead: 'none', curve: 'curved' });
  });

  it('draws straight lines level, and bent ones across a box', () => {
    expect(newLine('arrow', slide).frame).toEqual({ x: 720, y: 540, w: 480, h: 0 });
    expect(newLine('elbow', slide).frame).toEqual({ x: 780, y: 420, w: 360, h: 240 });
  });

  it('runs in the reading direction of the deck', () => {
    expect(newLine('arrow', slide, [], 'ltr').points).toEqual([
      { x: 0, y: 0 },
      { x: 480, y: 0 },
    ]);
    // In a right-to-left deck the arrow points left: its end is at x = 0.
    expect(newLine('arrow', slide, [], 'rtl').points).toEqual([
      { x: 480, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(newLine('curved', slide, [], 'rtl').points).toEqual([
      { x: 360, y: 0 },
      { x: 0, y: 240 },
    ]);
  });
});
