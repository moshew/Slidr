import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  walkElements,
  type Element,
  type Frame,
} from '@slidr/model';
import { expect, it } from 'vitest';
import { lintSlide } from './lint';
import type { ElementMeasure, SlideMeasurements, TextSpanMeasure } from './measure';

/*
 * The rules on slides nobody would draw: sizes of zero, positions far off the slide, rotation,
 * groups inside groups, empty text, measurements that are missing or make no sense. 600 slides
 * from a seeded generator, so a failure names its seed. What has to hold on every one of them:
 * no rule throws, two runs agree, every fix is a change the model accepts and that changes
 * something, and no fix changes an element the user locked (ARR-04).
 */

/** A small seeded generator: the same slides on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The elements of a slide that are locked, or inside a locked group, by id. */
function lockedIn(elements: readonly Element[], inside = false, out = new Map<string, Element>()) {
  for (const element of elements) {
    const held = inside || !!element.locked;
    if (held) out.set(element.id, element);
    if (element.type === 'group') lockedIn(element.children, held, out);
  }
  return out;
}

it('no rule throws, every fix applies, and none changes a locked element, on 600 odd slides', () => {
  const problems = new Map<string, string>();
  let fixes = 0;
  let locked = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const random = seeded(seed);
    const pick = <T>(options: readonly T[]): T => options[Math.floor(random() * options.length)]!;
    const position = () =>
      pick([0, 0, 1, 2, 24, 96, 100, 103, 400, 960, 1920, 2400, -50, -3000, 0.5, 1e6, 96.0004]);
    const size = () => pick([0, 0, 1, 3, 24, 60, 260, 400, 404, 1080, 1920, 5000, 0.001]);
    const frame = (): Frame => ({ x: position(), y: position(), w: size(), h: size() });
    const words = () =>
      pick([
        '',
        ' ',
        'Q1',
        'Hello world.',
        'שלום עולם.',
        'ה-API של המערכת (v2).',
        '100%',
        '.',
        'a'.repeat(400),
      ]);
    const rich = () =>
      richText(words(), {
        dir: pick(['rtl', 'ltr', 'auto'] as const),
        align: pick(['start', 'center', 'end', 'justify'] as const),
        ...(random() < 0.3
          ? {
              marks: {
                color: { value: pick(['#ff7a00', 'red', '#fff', 'rgb(1,2,3)']) },
                size: pick([8, 24, 300]),
              },
            }
          : {}),
      });
    const base = (i: number) => ({
      id: `e_${seed}_${i}`,
      frame: frame(),
      rotation: pick([0, 0, 0, 45, 90, 180, -30, 359.9]),
      ...(random() < 0.15 ? { locked: true } : {}),
      ...(random() < 0.1 ? { flipH: true } : {}),
      ...(random() < 0.1 ? { opacity: pick([0, 0.5]) } : {}),
    });
    const make = (i: number, depth = 0): Element => {
      const kind = pick([
        'text',
        'text',
        'shape',
        'shape',
        'image',
        'line',
        'group',
        'table',
        'chart',
      ] as const);
      if (kind === 'text') {
        return createElement.text({
          ...base(i),
          content: rich(),
          vAlign: pick(['top', 'middle', 'bottom'] as const),
          autoFit: pick(['none', 'shrink', 'growHeight'] as const),
          ...(random() < 0.2 ? { wrap: false } : {}),
        });
      }
      if (kind === 'shape') {
        return createElement.shape({ ...base(i), ...(random() < 0.5 ? { content: rich() } : {}) });
      }
      if (kind === 'image') return createElement.image({ ...base(i) });
      if (kind === 'line') {
        return createElement.line({
          ...base(i),
          points: [
            { x: 0, y: 0 },
            { x: size(), y: size() },
          ],
        });
      }
      if (kind === 'group' && depth < 2) {
        return createElement.group({
          ...base(i),
          opacity: 1,
          children: [1, 2, 3].map((n) => make(i * 10 + n, depth + 1)),
        });
      }
      if (kind === 'table') {
        return createElement.table({
          ...base(i),
          rows: [40, 40],
          cols: [100, 100],
          dir: 'rtl',
          cells: [0, 1].map(() => [0, 1].map(() => ({ content: rich() }))),
        });
      }
      return createElement.chart({
        ...base(i),
        chartType: 'column',
        data: { categories: [], series: [] },
      });
    };
    const elements = Array.from({ length: 1 + Math.floor(random() * 9) }, (_, i) => make(i + 1));
    const slide = createSlide({ id: `s_${seed}`, elements });
    const deck = createDeck({ lang: pick(['he', 'en']), slides: [slide] });

    // What a render might have measured, and what it might have missed.
    const measured: Record<string, ElementMeasure> = {};
    const span = (): TextSpanMeasure => ({
      color: pick([
        [0, 0, 0],
        [255, 255, 255],
        [200, 200, 200],
      ] as const),
      alpha: pick([1, 1, 0.5, 0.01, 0]),
      fontSize: pick([0, 8, 23.94, 24, 30, 48, 300]),
      backdrop: pick([
        [],
        [[255, 255, 255]],
        [
          [0, 0, 0],
          [255, 255, 255],
          [128, 128, 128],
        ],
      ] as const),
    });
    const measure = (list: readonly Element[], dx: number, dy: number) => {
      for (const element of list) {
        // Not rendered.
        if (random() < 0.05) continue;
        const { x, y, w, h } = element.frame;
        const box = { x: x + dx, y: y + dy, w, h };
        const ink =
          random() < 0.5 ? box : { x: box.x + position() / 10, y: box.y - 4, w: size(), h: size() };
        measured[element.id] =
          random() < 0.7
            ? {
                box,
                text: {
                  ink,
                  overflow: { x: pick([0, 0, 0.9, 1.1, 40]), y: pick([0, 0, 0.9, 1.1, 40, 4000]) },
                  scale: pick([1, 1, 0.6, 0.25]),
                  spans: random() < 0.9 ? [span(), span()] : [],
                },
              }
            : { box };
        if (element.type === 'group') measure(element.children, box.x, box.y);
      }
    };
    measure(elements, 0, 0);
    const measurements: SlideMeasurements = { elements: measured };

    const findings = lintSlide(deck, slide, measurements, 'all');
    expect(lintSlide(deck, slide, measurements, 'all'), `seed ${seed}`).toEqual(findings);
    const held = lockedIn(slide.elements);
    locked += held.size;
    for (const finding of findings) {
      if (!finding.fix) continue;
      fixes++;
      const said = JSON.stringify(finding.fix, (_, value: unknown) =>
        typeof value === 'number' && !Number.isFinite(value) ? 'NOT_FINITE' : value,
      );
      const where = `seed ${seed}: ${said.slice(0, 240)}`;
      if (said.includes('NOT_FINITE'))
        problems.set(`${finding.rule}: a number that is not one`, where);
      const bus = new CommandBus(deck, { validate: true });
      try {
        bus.batch(finding.fix);
      } catch (error) {
        problems.set(`${finding.rule}: the fix was refused: ${String(error).slice(0, 200)}`, where);
        continue;
      }
      if (bus.undoStack.length === 0)
        problems.set(`${finding.rule}: a fix that changes nothing`, where);
      for (const after of walkElements(bus.deck.slides[0]!.elements)) {
        // The model keeps the identity of what a command did not touch.
        const before = held.get(after.id);
        if (before && after !== before) {
          problems.set(`${finding.rule}: a fix changed a locked element`, where);
        }
      }
    }
  }
  expect([...problems]).toEqual([]);
  // The slides did hold what this is about.
  expect(fixes).toBeGreaterThan(1000);
  expect(locked).toBeGreaterThan(300);
});
