import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Element,
  type Frame,
  type Layout,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { lintSlide } from '../lint';
import { check, fixed, measure, span, text } from '../testing';
import { readingDirection } from './direction';

/** The rules of the user's design check that judge the slide as a picture, and their fixes. */

const card = (id: string, frame: Frame) => createElement.shape({ id, frame });
const words = (id: string, frame: Frame, content = 'Three goals for the quarter') =>
  createElement.text({ id, frame, content: richText(content) });

describe('L08: the centre of gravity', () => {
  it('reports content that sits in one corner, with the distance and the direction', () => {
    const [finding, ...rest] = check('L08', [card('e_a', { x: 96, y: 80, w: 500, h: 300 })]);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'info', elementIds: [] });
    expect(finding?.message).toMatch(
      /^The content's centre of gravity is 614px to the left of and 310px above the centre of the slide/,
    );
    expect(finding).not.toHaveProperty('fix');
  });

  it('accepts content that is balanced by a counter-element', () => {
    expect(
      check('L08', [
        card('e_a', { x: 96, y: 200, w: 500, h: 600 }),
        card('e_b', { x: 1324, y: 200, w: 500, h: 600 }),
      ]),
    ).toEqual([]);
  });

  it('weighs what the layout draws: a colour field balances the text beside it', () => {
    const title = words('e_title', { x: 900, y: 400, w: 900, h: 200 });
    const lone = createSlide({ id: 's_1', elements: [title] });
    const layout: Layout = {
      id: 'l_field',
      name: 'Field',
      archetype: 'section',
      placeholders: [],
      decorations: [card('d_field', { x: 0, y: 0, w: 720, h: 1080 })],
    };
    const deck = createDeck({ lang: 'en', slides: [lone] });
    const on = { ...lone, layoutId: 'l_field' };
    const withLayout = { ...deck, layouts: [layout], slides: [on] };
    const l08 = (d: typeof deck, s: typeof lone) =>
      lintSlide(d, s, measure(s)).filter((f) => f.rule === 'L08');
    expect(l08(deck, lone)).toHaveLength(1);
    expect(l08(withLayout, on)).toEqual([]);
  });

  it('says nothing of an empty slide, or of a slide over a photograph', () => {
    expect(check('L08', [])).toEqual([]);
    const photo = 'a'.repeat(64);
    expect(
      check(
        'L08',
        [card('e_a', { x: 96, y: 80, w: 300, h: 200 })],
        {},
        {
          slide: { background: { fill: { kind: 'image', assetId: photo, fit: 'cover' } } },
        },
      ),
    ).toEqual([]);
  });
});

describe("L11: fonts and colours that are not the template's", () => {
  const frame = { x: 160, y: 300, w: 800, h: 200 };

  it("reports a third font family, and the fix takes the text back to the template's fonts", () => {
    const elements = [
      createElement.text({
        id: 'e_title',
        frame: { x: 160, y: 100, w: 800, h: 120 },
        content: richText('Title', { styleRef: 'title' }),
      }),
      createElement.text({
        id: 'e_body',
        frame,
        content: {
          paragraphs: [
            {
              dir: 'ltr',
              align: 'start',
              runs: [
                { text: 'Body, and ' },
                { text: 'a word in another face', marks: { font: 'Comic Sans MS', weight: 700 } },
              ],
            },
          ],
        },
      }),
    ];
    const [finding, ...rest] = check('L11', elements);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'info', elementIds: ['e_body'] });
    expect(finding?.message).toMatch(
      /^The slide is set in 3 font families: the template's, and "Comic Sans MS"/,
    );
    const body = fixed(elements, finding).elements[1]!;
    expect(body.type === 'text' && body.content.paragraphs[0]!.runs).toEqual([
      { text: 'Body, and ' },
      { text: 'a word in another face', marks: { weight: 700 } },
    ]);
  });

  it("accepts one font of its own beside one of the template's: two families", () => {
    expect(
      check('L11', [
        createElement.text({
          id: 'e_body',
          frame,
          content: {
            paragraphs: [
              {
                dir: 'ltr',
                align: 'start',
                runs: [{ text: 'Body ' }, { text: 'code', marks: { font: 'JetBrains Mono' } }],
              },
            ],
          },
        }),
      ]),
    ).toEqual([]);
  });

  it('reports colours the theme does not hold, and maps each to the nearest token', () => {
    const elements: Element[] = [
      createElement.shape({
        id: 'e_card',
        frame,
        fill: { kind: 'solid', color: { value: '#3060e0', alpha: 0.4 } },
        stroke: { color: { value: '#E03030' }, width: 2 },
      }),
      createElement.text({
        id: 'e_text',
        frame: { x: 160, y: 600, w: 800, h: 100 },
        content: richText('Orange words', { marks: { color: { value: '#ff7a00' } } }),
      }),
    ];
    const [finding, ...rest] = check('L11', elements);
    expect(rest).toEqual([]);
    expect(finding?.elementIds).toEqual(['e_card', 'e_text']);
    expect(finding?.message).toMatch(
      /^3 colours here are not the template's: #3060e0 \(nearest: primary\)/,
    );
    const [shape, label] = fixed(elements, finding).elements;
    // The base theme: primary #2f5bea. The alpha a colour had stays with it.
    expect(shape).toMatchObject({
      fill: { kind: 'solid', color: { token: 'primary', alpha: 0.4 } },
    });
    expect(shape).toHaveProperty('stroke.color.token');
    expect(label).toHaveProperty('content.paragraphs.0.runs.0.marks.color.token');
    expect(check('L11', fixed(elements, finding).elements)).toEqual([]);
  });

  it("accepts tokens, the theme's own colours written out, greys, and colours it cannot read", () => {
    const fills = ['#2f5bea', '#ffffff', '#000000', '#7a7a7a', 'rgb(200 40 40)', 'tomato'];
    expect(
      check(
        'L11',
        fills.map((value, i) =>
          createElement.shape({
            id: `e_${i}`,
            frame: { x: 96 + i * 300, y: 300, w: 200, h: 200 },
            fill: { kind: 'solid', color: { value } },
          }),
        ),
      ),
    ).toEqual([]);
    expect(check('L11', [createElement.shape({ id: 'e_token', frame })])).toEqual([]);
  });

  // A glow as the conversion keeps it: the CSS the browser computed, with a clear end.
  const glow = (colour: string) =>
    createElement.shape({
      id: 'e_glow',
      frame,
      fill: {
        kind: 'css',
        value: `radial-gradient(circle, ${colour} 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat`,
      },
    });

  it('reads the colours inside a fill kept as CSS, and hands them to the theme', () => {
    // The purple of another template, as a deck keeps it that was switched away from it.
    const elements = [glow('color(srgb 0.615686 0.482353 1 / 0.35)')];
    const [finding, ...rest] = check('L11', elements);
    expect(rest).toEqual([]);
    expect(finding?.elementIds).toEqual(['e_glow']);
    expect(finding?.message).toMatch(/^1 colour here is not the template's: #9d7bff \(nearest: /);
    const [shape] = fixed(elements, finding).elements;
    // The theme's variable, as translucent as the colour was; the rest of the CSS to the letter.
    expect(shape).toHaveProperty(
      'fill.value',
      expect.stringMatching(
        /^radial-gradient\(circle, color-mix\(in srgb, var\(--color-\w+\) 35%, transparent\) 0%, rgba\(0, 0, 0, 0\) 70%\) 0% 0% \/ auto repeat$/,
      ),
    );
    expect(check('L11', [shape!])).toEqual([]);
  });

  it("accepts a CSS fill in the theme's own colours, in greys and in the theme's variables", () => {
    for (const colour of [
      'rgb(47, 91, 234)',
      'rgba(255, 255, 255, 0.4)',
      'color-mix(in srgb, var(--color-primary) 30%, transparent)',
    ]) {
      expect(check('L11', [glow(colour)])).toEqual([]);
    }
  });
});

describe('L12: a picture enlarged or stretched', () => {
  const PHOTO = 'b'.repeat(64);
  const asset = (width: number, height: number, mime = 'image/webp'): AssetMeta => ({
    id: PHOTO,
    file: `${PHOTO}.webp`,
    mime,
    kind: 'image',
    bytes: 1,
    origin: 'upload',
    width,
    height,
  });
  const l12 = (element: Element | undefined, picture: AssetMeta, slideInit = {}) => {
    const slide = createSlide({ id: 's_1', ...slideInit, elements: element ? [element] : [] });
    const deck = createDeck({ lang: 'en', slides: [slide] });
    deck.assets[PHOTO] = picture;
    return lintSlide(deck, slide, measure(slide)).filter((f) => f.rule === 'L12');
  };
  const image = (frame: Frame, rest: object = {}) =>
    createElement.image({ id: 'e_photo', frame, assetId: PHOTO, ...rest });

  it('reports a small picture in a large frame, with both sizes', () => {
    const [finding, ...rest] = l12(image({ x: 0, y: 0, w: 1920, h: 1080 }), asset(640, 360));
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'warning', elementIds: ['e_photo'] });
    expect(finding?.message).toBe(
      'The picture is drawn at 300% of its resolution (a 640x360px picture in a 1920x1080 frame; up to 150% holds), so it looks soft. Use a larger picture or a smaller frame.',
    );
  });

  it('draws the line at 150%, and counts the crop: a part of a picture has fewer pixels', () => {
    const frame = { x: 0, y: 0, w: 900, h: 600 };
    expect(l12(image(frame), asset(600, 400))).toEqual([]);
    expect(l12(image(frame), asset(590, 400))).toHaveLength(1);
    const half = { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    expect(l12(image(frame, half), asset(1200, 800))).toEqual([]);
    expect(l12(image(frame, half), asset(1100, 800))).toHaveLength(1);
  });

  it('takes "cover" by the side that is enlarged more, and "contain" by the other', () => {
    // A wide picture in a tall frame: cover fills the height, contain the width.
    const frame = { x: 0, y: 0, w: 400, h: 800 };
    expect(l12(image(frame), asset(800, 400))).toHaveLength(1);
    expect(l12(image(frame, { fit: 'contain' }), asset(800, 400))).toEqual([]);
  });

  it('reports a picture stretched out of its proportions', () => {
    const [finding] = l12(image({ x: 0, y: 0, w: 800, h: 800 }, { fit: 'fill' }), asset(1600, 800));
    expect(finding?.message).toMatch(
      /^The picture is stretched: its width is drawn at 50% and its height at 100%/,
    );
  });

  it('says nothing of a drawing, of a picture of unknown size, or of a frame that waits', () => {
    const frame = { x: 0, y: 0, w: 1920, h: 1080 };
    expect(l12(image(frame), asset(24, 24, 'image/svg+xml'))).toEqual([]);
    expect(l12(image(frame), { ...asset(1, 1), width: undefined, height: undefined })).toEqual([]);
    expect(
      l12(createElement.image({ id: 'e_wait', frame, prompt: 'a ridge' }), asset(1, 1)),
    ).toEqual([]);
  });

  it('judges the picture behind the slide as well', () => {
    const background = { fill: { kind: 'image', assetId: PHOTO, fit: 'cover' } };
    const [finding] = l12(undefined, asset(960, 540), { background });
    expect(finding?.elementIds).toEqual([]);
    expect(finding?.message).toMatch(
      /^The slide's background picture is drawn at 200% of its resolution/,
    );
  });
});

describe('L14: three slides of one kind in a row', () => {
  const deckOf = (archetypes: (string | undefined)[], hidden: number[] = []) =>
    createDeck({
      lang: 'en',
      slides: archetypes.map((archetype, i) =>
        createSlide({
          id: `s_${i + 1}`,
          ...(archetype ? { archetype: archetype as 'cards' } : {}),
          ...(hidden.includes(i) ? { hidden: true } : {}),
          elements: [card(`e_${i}`, { x: 96, y: 80, w: 1728, h: 920 })],
        }),
      ),
    });
  const l14 = (deck: ReturnType<typeof deckOf>) =>
    deck.slides.map(
      (slide) => lintSlide(deck, slide, measure(slide)).filter((f) => f.rule === 'L14').length,
    );

  it('reports the third in a row, and every one after it', () => {
    const deck = deckOf(['cards', 'cards', 'cards', 'cards', 'quote', 'cards']);
    expect(l14(deck)).toEqual([0, 0, 1, 1, 0, 0]);
    const third = lintSlide(deck, deck.slides[2]!, measure(deck.slides[2]!)).find(
      (f) => f.rule === 'L14',
    );
    expect(third).toMatchObject({ severity: 'info', slideId: 's_3', elementIds: [] });
    expect(third?.message).toMatch(/^This is the third slide in a row of the "cards" archetype/);
  });

  it('says nothing of slides without an archetype, and looks past hidden slides', () => {
    expect(l14(deckOf([undefined, undefined, undefined]))).toEqual([0, 0, 0]);
    // The hidden slide is not shown: the three around it are in a row.
    expect(l14(deckOf(['cards', 'cards', 'quote', 'cards'], [2]))).toEqual([0, 0, 0, 1]);
  });
});

describe('L15: a paragraph laid out against its text', () => {
  const frame = { x: 160, y: 300, w: 1200, h: 200 };
  const para = (content: string, dir: 'rtl' | 'ltr' | 'auto') =>
    createElement.text({ id: 'e_text', frame, content: richText(content, { dir }) });

  it('tells the direction a text reads in by its letters', () => {
    // In a Hebrew deck a sentence with Hebrew in it is a Hebrew sentence, whatever else it holds.
    expect(readingDirection('ה-API של המערכת החדשה', 'rtl')).toBe('rtl');
    expect(readingDirection('Kafka Streams ו-Flink SQL על Kubernetes', 'rtl')).toBe('rtl');
    expect(readingDirection('The new system API', 'rtl')).toBe('ltr');
    // And in an English deck, the other way round.
    expect(readingDirection('Go-live ב-42', 'ltr')).toBe('ltr');
    expect(readingDirection('שלום עולם', 'ltr')).toBe('rtl');
    expect(readingDirection('42%', 'rtl')).toBeUndefined();
  });

  it('reports Hebrew set left to right, and the fix states its direction', () => {
    const element = para('שלוש המטרות של הרבעון הבא.', 'ltr');
    const [finding, ...rest] = check('L15', [element], {}, { deck: { lang: 'he' } });
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'warning', elementIds: ['e_text'] });
    expect(finding?.message).toBe(
      'A paragraph here is laid out left to right while the text reads right to left ("שלוש המטרות של הרבעון הבא."). Set the direction of the paragraph to "rtl".',
    );
    const after = fixed([element], finding, { deck: { lang: 'he' } }).elements[0]!;
    // The direction was stated, so the text was put on that side: it stays there.
    expect(after.type === 'text' && after.content.paragraphs[0]).toMatchObject({
      dir: 'rtl',
      align: 'end',
    });
  });

  it('leaves alone a bare word or phrase, which is drawn the same in either direction', () => {
    const he = { deck: { lang: 'he' } };
    // What an agent writes in a Hebrew deck: every paragraph right to left, Latin labels too.
    expect(check('L15', [para('Q1', 'rtl')], {}, he)).toEqual([]);
    expect(check('L15', [para('API Gateway', 'rtl')], {}, he)).toEqual([]);
    expect(check('L15', [para('שלוש המטרות של הרבעון הבא', 'ltr')], {}, he)).toEqual([]);
    // A full stop or a leading figure lands on the wrong side, and that shows.
    const stop = para('Ships in the second quarter.', 'rtl');
    const [finding] = check('L15', [stop], {}, he);
    expect(finding?.message).toContain('laid out right to left while the text reads left to right');
    const after = fixed([stop], finding, he).elements[0]!;
    expect(after.type === 'text' && after.content.paragraphs[0]).toMatchObject({
      dir: 'ltr',
      align: 'end',
    });
    expect(check('L15', [para('2027 roadmap', 'rtl')], {}, he)).toHaveLength(1);
  });

  it('reports a Hebrew sentence that opens with an English term and follows its first letter', () => {
    const element = para('API חדש לכל הלקוחות של המערכת', 'auto');
    expect(check('L15', [element], {}, { deck: { lang: 'he' } })).toHaveLength(1);
    expect(
      check('L15', [para('לכל הלקוחות יש API חדש', 'auto')], {}, { deck: { lang: 'he' } }),
    ).toEqual([]);
  });

  it('accepts text in its own direction, mixed text, figures, and an English line in a Hebrew deck', () => {
    const he = { deck: { lang: 'he' } };
    expect(check('L15', [para('Three goals', 'ltr')], {}, he)).toEqual([]);
    expect(check('L15', [para('Three goals', 'auto')], {}, he)).toEqual([]);
    expect(check('L15', [para('ARR של ₪130M', 'rtl')], {}, he)).toEqual([]);
    expect(check('L15', [para('+31%', 'ltr')], {}, he)).toEqual([]);
  });
});

describe('L17: an empty band at the bottom', () => {
  const title = words('e_title', { x: 96, y: 80, w: 1728, h: 100 });
  const footer = createElement.text({
    id: 'e_footer',
    role: 'footer',
    frame: { x: 96, y: 958, w: 900, h: 34 },
    content: richText('ACME · 2026'),
  });

  it('reports content that ends high above the bottom margin, though a footer stretches the box', () => {
    const elements = [title, card('e_cards', { x: 96, y: 220, w: 1728, h: 420 }), footer];
    // The bounding box reaches the footer, so the coverage rule is content.
    expect(check('L07', elements)).toEqual([]);
    const [finding, ...rest] = check('L17', elements);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'warning', elementIds: [] });
    expect(finding?.message).toBe(
      'The bottom 360px of the content area is empty: nothing between y 640 and the bottom margin at 1000, while the content begins 0px from the top margin. Spread the content down the slide, enlarge it, or centre it.',
    );
  });

  it('draws the line at a quarter of the content area', () => {
    const until = (bottom: number) => [
      title,
      card('e_cards', { x: 96, y: 220, w: 1728, h: bottom - 220 }),
    ];
    expect(check('L17', until(771))).toEqual([]);
    expect(check('L17', until(769))).toHaveLength(1);
  });

  it('accepts content that is centred: as much room above it as below', () => {
    expect(check('L17', [card('e_quote', { x: 300, y: 330, w: 1320, h: 380 })])).toEqual([]);
  });

  it('counts what the layout draws down to the foot, and nothing of the foot itself', () => {
    const slide = createSlide({ id: 's_1', layoutId: 'l_cards', elements: [title] });
    const layout = (decorations: Element[]): Layout => ({
      id: 'l_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [],
      decorations,
    });
    const l17 = (decorations: Element[]) => {
      const deck = {
        ...createDeck({ lang: 'en', slides: [slide] }),
        layouts: [layout(decorations)],
      };
      return lintSlide(deck, slide, measure(slide)).filter((f) => f.rule === 'L17');
    };
    expect(l17([card('d_cards', { x: 96, y: 260, w: 1200, h: 640 })])).toEqual([]);
    expect(l17([card('d_mark', { x: 96, y: 950, w: 40, h: 40 })])).toHaveLength(1);
  });

  it('says nothing of an empty slide, or of a slide over a photograph', () => {
    expect(check('L17', [footer])).toEqual([]);
    const photo = 'a'.repeat(64);
    expect(
      check(
        'L17',
        [title],
        {},
        {
          slide: { background: { fill: { kind: 'image', assetId: photo, fit: 'cover' } } },
        },
      ),
    ).toEqual([]);
  });
});

describe('inside a chart: the text it draws, for the user alone', () => {
  const frame = { x: 200, y: 300, w: 900, h: 500 };
  const chart = (at: Frame = frame) =>
    createElement.chart({
      id: 'e_chart',
      frame: at,
      chartType: 'column',
      data: { categories: ['Q1', 'Q2'], series: [{ name: 'Revenue', values: [3, 5] }] },
    });
  const drawn = (at: Frame, ink: Frame, spans = [span()]) => ({
    e_chart: { box: at, text: text(ink, { spans }) },
  });
  const all = (elements: Element[], overrides = {}) => {
    const slide = createSlide({ id: 's_1', elements });
    const deck = createDeck({ lang: 'en', slides: [slide] });
    const measured = measure(slide, overrides);
    // Only the rules that read the chart's text: a lone chart is also a slide half empty.
    const rulesOf = (set: 'all' | 'agent') =>
      lintSlide(deck, slide, measured, set)
        .map((f) => f.rule)
        .filter((rule) => ['L03', 'L04', 'L05'].includes(rule));
    return { user: rulesOf('all'), agent: rulesOf('agent') };
  };

  it('reports small labels, labels in the margin and labels that do not read, to the user only', () => {
    const edge = { x: 40, y: 300, w: 900, h: 500 };
    const faint = span({ fontSize: 18, color: [200, 200, 200] });
    const { user, agent } = all(
      [chart(edge)],
      drawn(edge, { x: 44, y: 310, w: 880, h: 480 }, [faint]),
    );
    expect(user).toEqual(['L03', 'L04', 'L05']);
    expect(agent).toEqual([]);
  });

  it("words each finding as the chart's", () => {
    const faint = span({ fontSize: 18, color: [200, 200, 200] });
    const overrides = drawn(frame, frame, [faint]);
    expect(check('L04', [chart()], overrides)[0]?.message).toBe(
      "The smallest text of the chart is drawn at 18px; the minimum readable size is 24px. A chart takes its text size from the theme's caption style.",
    );
    expect(check('L05', [chart()], overrides)[0]).toMatchObject({ severity: 'error' });
    expect(check('L05', [chart()], overrides)[0]?.message).toMatch(/^Text of the chart in #c8c8c8/);
    expect(check('L05', [chart()], overrides)[0]).not.toHaveProperty('fix');
  });

  it('reports a chart too small to hold what it draws', () => {
    const small = { x: 200, y: 300, w: 400, h: 240 };
    const [finding] = check('L04', [chart(small)]);
    expect(finding?.message).toMatch(/^The chart is drawn at 400x240px\. Under 480x300/);
    expect(check('L04', [chart()])).toEqual([]);
  });

  it('leaves a chart whose text reads, at a readable size, inside the margins', () => {
    expect(all([chart()], drawn(frame, frame)).user).toEqual([]);
  });
});
