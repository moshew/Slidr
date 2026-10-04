import { createElement, richText, type Element, type Frame } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import type { Rgb } from '../measure';
import { check, fixed, span, text, WHITE } from '../testing';

/** The automatic fixes of the rules that go back to the agent (SPEC 9.2): L01 to L05. */

const byId = (slide: { elements: Element[] }, id: string) =>
  slide.elements.find((element) => element.id === id)!;

describe('L01: a larger box, or a smaller text', () => {
  const frame = { x: 160, y: 340, w: 800, h: 300 };
  const body = (init: Partial<Parameters<typeof createElement.text>[0]> = {}) =>
    createElement.text({ id: 'e_body', frame, content: richText('Three goals'), ...init });
  const over = (y: number, x = 0) => ({
    e_body: { box: frame, text: text(frame, { overflow: { x, y } }) },
  });

  it('makes the box as tall as its text where there is room', () => {
    const [finding] = check('L01', [body()], over(86));
    expect(byId(fixed([body()], finding), 'e_body').frame).toEqual({ ...frame, h: 386 });
  });

  it('shrinks the text where a taller box would leave the safe area', () => {
    const [finding] = check('L01', [body()], over(400));
    const after = byId(fixed([body()], finding), 'e_body');
    expect(after.frame).toEqual(frame);
    expect(after).toMatchObject({ autoFit: 'shrink' });
  });

  it('shrinks the text where a taller box would run into other text', () => {
    const note = createElement.text({
      id: 'e_note',
      frame: { x: 160, y: 660, w: 800, h: 60 },
      content: richText('A note under the body'),
    });
    const [finding] = check('L01', [body(), note], over(86));
    expect(byId(fixed([body(), note], finding), 'e_body')).toMatchObject({ autoFit: 'shrink' });
  });

  it('lets a line that was kept whole wrap', () => {
    const [finding] = check('L01', [body({ wrap: false })], over(0, 120));
    expect(byId(fixed([body({ wrap: false })], finding), 'e_body')).not.toHaveProperty('wrap');
  });

  it('has no fix once shrink has gone as far as it goes', () => {
    const [finding] = check('L01', [body({ autoFit: 'shrink' })], over(40));
    expect(finding).toBeDefined();
    expect(finding).not.toHaveProperty('fix');
  });

  it('makes the frame of a table as tall as its rows', () => {
    const table = createElement.table({
      id: 'e_body',
      frame,
      rows: [150, 150],
      cols: [400, 400],
      dir: 'ltr',
      cells: [
        [{ content: richText('a') }, { content: richText('b') }],
        [{ content: richText('c') }, { content: richText('d') }],
      ],
    });
    const [finding] = check('L01', [table], over(60));
    expect(byId(fixed([table], finding), 'e_body').frame.h).toBe(360);
  });
});

describe('L02 and L03: the element moved in', () => {
  const title = (frame: Frame) =>
    createElement.text({ id: 'e_title', frame, content: richText('Plan', { styleRef: 'title' }) });

  it('moves text that is cut by the edge back onto the slide, and no further', () => {
    const frame = { x: 1400, y: 1000, w: 554, h: 92 };
    const [finding] = check('L02', [title(frame)]);
    const after = fixed([title(frame)], finding);
    expect(byId(after, 'e_title').frame).toEqual({ x: 1366, y: 988, w: 554, h: 92 });
  });

  it('brings back an element that is entirely off the slide', () => {
    const lost = createElement.shape({ id: 'e_lost', frame: { x: 2400, y: -300, w: 200, h: 100 } });
    const [finding] = check('L02', [lost]);
    expect(byId(fixed([lost], finding), 'e_lost').frame).toEqual({ x: 1720, y: 0, w: 200, h: 100 });
  });

  it('moves text out of the margins by its glyphs, not by its frame', () => {
    const frame = { x: 0, y: 300, w: 900, h: 120 };
    const ink = { x: 50, y: 310, w: 400, h: 90 };
    const measured = { e_title: { box: frame, text: text(ink) } };
    const [finding] = check('L03', [title(frame)], measured);
    // The glyphs were 46px into the margin; the frame may stay there.
    expect(byId(fixed([title(frame)], finding), 'e_title').frame.x).toBe(46);
  });

  it('has no fix for text wider than the area it has to stay in', () => {
    const frame = { x: -100, y: 300, w: 2200, h: 120 };
    const [finding] = check('L02', [title(frame)]);
    expect(finding).toBeDefined();
    expect(finding).not.toHaveProperty('fix');
  });

  it('has no fix for an element inside a group that is turned', () => {
    const child = title({ x: 1500, y: 0, w: 600, h: 90 });
    const group = createElement.group({
      id: 'e_group',
      frame: { x: 0, y: 500, w: 1920, h: 200 },
      rotation: 12,
      children: [child],
    });
    const measured = {
      e_title: { box: child.frame, text: text({ x: 1500, y: 500, w: 600, h: 90 }) },
    };
    const [finding] = check('L02', [group], measured);
    expect(finding?.elementIds).toEqual(['e_title']);
    expect(finding).not.toHaveProperty('fix');
  });
});

describe('L04: text set at the smallest readable size', () => {
  const frame = { x: 160, y: 700, w: 800, h: 100 };
  const at = (fontSize: number, scale = 1) => ({
    e_note: { box: frame, text: text(frame, { scale, spans: [span({ fontSize })] }) },
  });

  it('sets the runs that are smaller at 24px, and leaves the others', () => {
    const note = createElement.text({
      id: 'e_note',
      frame,
      content: {
        paragraphs: [
          {
            dir: 'ltr',
            align: 'start',
            styleRef: 'caption',
            runs: [
              { text: 'Source: ' },
              { text: 'survey', marks: { size: 40 } },
              { text: '1', marks: { script: 'sup' } },
            ],
          },
        ],
      },
    });
    const [finding] = check('L04', [note], at(22));
    const after = byId(fixed([note], finding), 'e_note');
    expect(after.type === 'text' && after.content.paragraphs[0]!.runs).toEqual([
      { text: 'Source: ', marks: { size: 24 } },
      { text: 'survey', marks: { size: 40 } },
      { text: '1', marks: { script: 'sup' } },
    ]);
  });

  it('has no fix for text that shrink scaled down', () => {
    const note = createElement.text({ id: 'e_note', frame, content: richText('A long note') });
    const [finding] = check('L04', [note], at(18, 0.6));
    expect(finding).toBeDefined();
    expect(finding).not.toHaveProperty('fix');
  });
});

describe('L05: a colour that reads, or a veil under the text', () => {
  const frame = { x: 160, y: 340, w: 800, h: 100 };
  const label = (marks?: Parameters<typeof richText>[1]) =>
    createElement.text({ id: 'e_label', frame, content: richText('Hello world', marks) });
  const drawn = (color: Rgb, backdrop: Rgb[]) => ({
    e_label: { box: frame, text: text(frame, { spans: [span({ color, backdrop })] }) },
  });
  const grey = (v: number): Rgb => [v, v, v];
  const colours = (element: Element) =>
    element.type === 'text'
      ? element.content.paragraphs.flatMap((p) => p.runs.map((run) => run.marks?.color))
      : [];

  it('turns pale text on a pale ground to the theme text colour', () => {
    const pale = label({ marks: { color: { value: '#bbbbbb' } } });
    const [finding] = check('L05', [pale], drawn(grey(0xbb), [WHITE]));
    const after = fixed([pale], finding);
    expect(after.elements).toHaveLength(1);
    expect(colours(byId(after, 'e_label'))).toEqual([{ token: 'text' }]);
  });

  it('turns dark text on a dark ground to the first theme colour that reads there', () => {
    const [finding] = check('L05', [label()], drawn([21, 23, 26], [grey(30)]));
    // The base theme's background is white: the first of text, bg and surface that reads.
    expect(colours(byId(fixed([label()], finding), 'e_label'))).toEqual([{ token: 'bg' }]);
  });

  it('changes only the runs drawn in the colour that fails', () => {
    const mixed = createElement.text({
      id: 'e_label',
      frame,
      content: {
        paragraphs: [
          {
            dir: 'ltr',
            align: 'start',
            runs: [
              { text: 'Pale ', marks: { color: { value: '#cccccc' } } },
              { text: 'and blue', marks: { color: { value: '#0000aa' } } },
            ],
          },
        ],
      },
    });
    const [finding] = check('L05', [mixed], drawn(grey(0xcc), [WHITE]));
    expect(colours(byId(fixed([mixed], finding), 'e_label'))).toEqual([
      { token: 'text' },
      { value: '#0000aa' },
    ]);
  });

  it('puts a veil under text on a busy picture, where no single colour reads', () => {
    // Half of what is under the text is bright and half is dark.
    const busy = Array.from({ length: 20 }, (_, i) => (i % 2 ? grey(245) : grey(15)));
    const white = label({ marks: { color: { value: '#ffffff' } } });
    const picture = createElement.image({ id: 'e_photo', frame: { x: 0, y: 0, w: 1920, h: 1080 } });
    const [finding] = check('L05', [picture, white], drawn(WHITE, busy));
    const after = fixed([picture, white], finding);
    // Between the picture and the text, around the glyphs, inside the slide.
    expect(after.elements.map((e) => e.id)).toEqual(['e_photo', 'e_label_veil', 'e_label']);
    const veil = byId(after, 'e_label_veil');
    expect(veil.frame).toEqual({ x: 136, y: 316, w: 848, h: 148 });
    expect(veil).toMatchObject({ type: 'shape', fill: { kind: 'solid' } });
    expect(colours(byId(after, 'e_label'))).toEqual([{ value: '#ffffff' }]);
  });
});

describe('L05: text that is faint by its own opacity', () => {
  it('takes an opaque colour that reads: the faintness goes with the colour that had it', () => {
    const frame = { x: 160, y: 340, w: 800, h: 100 };
    const faint = createElement.text({
      id: 'e_label',
      frame,
      content: richText('Hello world', { marks: { color: { token: 'text', alpha: 0.35 } } }),
    });
    const blue: Rgb = [47, 91, 234];
    const measured = {
      e_label: {
        box: frame,
        text: text(frame, {
          spans: [span({ color: [21, 23, 26], alpha: 0.35, backdrop: [blue] })],
        }),
      },
    };
    const [finding] = check('L05', [faint], measured);
    const after = fixed([faint], finding).elements[0]!;
    // Dark text does not read on this blue even when opaque; the theme's background does.
    expect(after.type === 'text' && after.content.paragraphs[0]!.runs[0]!.marks?.color).toEqual({
      token: 'bg',
    });
  });
});
