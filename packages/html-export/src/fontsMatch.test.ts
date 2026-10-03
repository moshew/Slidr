import { describe, expect, it } from 'vitest';
import {
  assignText,
  faceKey,
  fontFaceCss,
  fontUrl,
  groupKey,
  inRanges,
  parseFamilies,
  parseUnicodeRange,
  parseWeightRange,
  shapedCodePoints,
  type Face,
  type TextUse,
} from './fontsMatch';

// The part of font embedding that needs no browser: reading descriptors, matching text to faces,
// and the rule that is written. Real fonts are cut in fonts.browser.test.ts.

const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122';
const HEBREW_ONLY = 'U+0590-05FF,U+20AA,U+FB1D-FB4F';

function face(family: string, unicodeRange: string, rest: Partial<Face> = {}): Face {
  return {
    family,
    style: 'normal',
    weight: '400',
    stretch: '',
    unicodeRange,
    src: `url("${family}.woff2") format("woff2")`,
    base: 'http://localhost/',
    rest: [],
    ...rest,
  };
}

const codePoints = (text: string) => new Set(Array.from(text, (c) => Number(c.codePointAt(0))));

function use(text: string, families: string[], rest: Partial<TextUse> = {}): TextUse {
  return {
    families,
    style: 'normal',
    weight: 400,
    features: false,
    variations: false,
    codePoints: codePoints(text),
    ...rest,
  };
}

const drawn = (assigned: ReturnType<typeof assignText>, of: Face) =>
  String.fromCodePoint(...Array.from(assigned.get(of)?.codePoints ?? []).sort((a, b) => a - b));

describe('parseUnicodeRange', () => {
  it('reads single code points, ranges and wildcards', () => {
    expect(parseUnicodeRange('U+26')).toEqual([[0x26, 0x26]]);
    expect(parseUnicodeRange('U+0590-05FF, u+20aa')).toEqual([
      [0x590, 0x5ff],
      [0x20aa, 0x20aa],
    ]);
    expect(parseUnicodeRange('U+4??')).toEqual([[0x400, 0x4ff]]);
  });

  it('sorts the ranges and joins those that touch', () => {
    expect(parseUnicodeRange('U+30-39, U+20, U+21-2F, U+100')).toEqual([
      [0x20, 0x39],
      [0x100, 0x100],
    ]);
  });

  it('takes a face without a range to cover everything', () => {
    expect(parseUnicodeRange('')).toEqual([[0, 0x10ffff]]);
    expect(parseUnicodeRange('nonsense')).toEqual([]);
  });

  it('finds a code point in the ranges', () => {
    const ranges = parseUnicodeRange(HEBREW);
    expect(inRanges(ranges, 0x5d0)).toBe(true);
    expect(inRanges(ranges, 0x20aa)).toBe(true);
    expect(inRanges(ranges, 0x41)).toBe(false);
    expect(inRanges(ranges, 0x2011)).toBe(false);
  });
});

describe('descriptors', () => {
  it('reads a family list, quoted or not', () => {
    expect(parseFamilies('"Heebo::hebrew", Inter, "Noto Sans Hebrew", sans-serif')).toEqual([
      'Heebo::hebrew',
      'Inter',
      'Noto Sans Hebrew',
      'sans-serif',
    ]);
    expect(parseFamilies(`'It\\'s',  Open   Sans`)).toEqual(["It's", 'Open Sans']);
  });

  it('reads one weight or the range of a variable font', () => {
    expect(parseWeightRange('400')).toEqual([400, 400]);
    expect(parseWeightRange('100 900')).toEqual([100, 900]);
    expect(parseWeightRange('normal')).toEqual([400, 400]);
    expect(parseWeightRange('bold')).toEqual([700, 700]);
    expect(parseWeightRange('')).toEqual([400, 400]);
  });

  it('tells that a rule and a loaded face are the same, however each is spelled', () => {
    const rule = { family: 'Heebo', style: '', weight: '100 900', unicodeRange: HEBREW };
    // The spelling of a `FontFace` object in Chromium.
    const loaded = {
      family: 'Heebo',
      style: 'normal',
      weight: '100 900',
      unicodeRange: 'U+307-308, U+590-5FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F',
    };
    expect(faceKey(rule)).toBe(faceKey(loaded));
    expect(faceKey({ ...rule, unicodeRange: '' })).toBe(
      faceKey({ ...loaded, unicodeRange: 'U+0-10FFFF' }),
    );
    expect(faceKey(rule)).not.toBe(faceKey({ ...loaded, weight: '400' }));
  });

  it('groups the faces a browser draws as one', () => {
    const hebrew = face('Heebo', HEBREW, { weight: '100 900' });
    const latin = face('Heebo', LATIN, { weight: '100 900' });
    expect(groupKey(hebrew)).toBe(groupKey(latin));
    expect(groupKey(hebrew)).not.toBe(groupKey({ ...latin, style: 'italic' }));
    expect(groupKey(hebrew)).not.toBe(groupKey({ ...latin, weight: '700' }));
  });

  it('finds the font file of a face', () => {
    expect(fontUrl('url("/fonts/a.woff2") format("woff2")', 'http://localhost:1420/dev/')).toBe(
      'http://localhost:1420/fonts/a.woff2',
    );
    expect(fontUrl('local("Arial"), url(a.woff) format("woff")', 'http://host/css/')).toBe(
      'http://host/css/a.woff',
    );
    expect(
      fontUrl(
        'url(a.eot) format("embedded-opentype"), url(a.ttf) format("truetype")',
        'http://host/',
      ),
    ).toBe('http://host/a.ttf');
    expect(fontUrl('url("data:font/woff2;base64,AAAA")', 'http://host/')).toBe(
      'data:font/woff2;base64,AAAA',
    );
    expect(fontUrl('local("Arial")', 'http://host/')).toBeUndefined();
  });
});

describe('assignText', () => {
  const alias = face('Heebo::hebrew', HEBREW_ONLY, { weight: '100 900' });
  const inter = face('Inter', LATIN, { weight: '100 900' });
  const heeboHebrew = face('Heebo', HEBREW, { weight: '100 900' });
  const heeboLatin = face('Heebo', LATIN, { weight: '100 900' });
  const pair = ['Heebo::hebrew', 'Inter', 'Heebo', 'sans-serif'];
  const shalom = String.fromCodePoint(0x5e9, 0x5dc, 0x5d5, 0x5dd);

  it('gives each character to the faces whose range holds it', () => {
    const assigned = assignText(
      [alias, inter, heeboHebrew, heeboLatin],
      [use(`${shalom} AB`, pair)],
    );
    expect(drawn(assigned, alias)).toBe(drawn(assigned, heeboHebrew));
    expect(assigned.get(alias)?.codePoints).toEqual(codePoints(shalom));
    // Every family of the list takes the character: only the font file knows which one draws.
    expect(drawn(assigned, inter)).toBe(' 0AB');
    expect(drawn(assigned, heeboLatin)).toBe(' 0AB');
  });

  it('gives the space and the zero to the font that sets the height of the lines', () => {
    const assigned = assignText([alias, inter], [use(shalom, pair)]);
    // No Latin letter is drawn, but Inter is the first font of the list with a space.
    expect(drawn(assigned, inter)).toBe(' 0');
    expect(assigned.get(alias)?.codePoints.has(0x20)).toBe(false);
  });

  it('leaves out a family the text does not name, and a face that covers none of it', () => {
    const rubik = face('Rubik', LATIN);
    const assigned = assignText([rubik, heeboHebrew], [use('AB', ['Heebo'])]);
    expect(assigned.has(rubik)).toBe(false);
    expect(assigned.has(heeboHebrew)).toBe(false);
  });

  it('takes the italic face for italic text, and the upright one where there is no italic', () => {
    const upright = face('Rubik', LATIN);
    const italic = face('Rubik', LATIN, { style: 'italic' });
    const only = face('Alef', LATIN);
    const assigned = assignText(
      [upright, italic, only],
      [use('ab', ['Rubik', 'Alef'], { style: 'italic' }), use('cd', ['Rubik'])],
    );
    expect(drawn(assigned, italic)).toBe(' 0ab');
    expect(drawn(assigned, upright)).toBe(' 0cd');
    expect(drawn(assigned, only)).toBe(' 0ab');
  });

  it('matches a weight as a browser does', () => {
    const weights = ['300', '400', '700'].map((weight) => face('Plex', LATIN, { weight }));
    const pick = (weight: number) => {
      const assigned = assignText(weights, [use('a', ['Plex'], { weight })]);
      return weights.filter((f) => assigned.has(f)).map((f) => f.weight);
    };
    expect(pick(400)).toEqual(['400']);
    // Between 400 and 500 a browser looks up to 500, then down; never straight to the bold.
    expect(pick(500)).toEqual(['400']);
    expect(pick(450)).toEqual(['400']);
    expect(pick(600)).toEqual(['700']);
    expect(pick(900)).toEqual(['700']);
    expect(pick(350)).toEqual(['300']);
    expect(pick(100)).toEqual(['300']);
    const medium = face('Plex', LATIN, { weight: '500' });
    const assigned = assignText([...weights, medium], [use('a', ['Plex'], { weight: 450 })]);
    expect(assigned.has(medium)).toBe(true);
  });

  /** What a face draws at each weight, as text. */
  const byWeight = (assigned: ReturnType<typeof assignText>, of: Face) =>
    Object.fromEntries(
      Array.from(assigned.get(of)?.byWeight ?? [], ([weight, drawnAt]) => [
        weight,
        String.fromCodePoint(...Array.from(drawnAt).sort((a, b) => a - b)),
      ]),
    );

  it('keeps apart what a variable font draws at each weight', () => {
    const variable = face('Rubik', LATIN, { weight: '300 900' });
    const assigned = assignText(
      [variable],
      [
        use('ab', ['Rubik'], { weight: 700 }),
        use('cd', ['Rubik'], { weight: 400 }),
        use('e', ['Rubik'], { weight: 700 }),
        use('f', ['Rubik'], { weight: 100 }),
      ],
    );
    // A weight outside the range is drawn at its nearest end. Each weight has its own space:
    // it will be a font of its own, and the first of its list.
    expect(byWeight(assigned, variable)).toEqual({ 300: ' 0f', 400: ' 0cd', 700: ' 0abe' });
    expect(drawn(assigned, variable)).toBe(' 0abcdef');
  });

  it('does not count a weight for a face that draws nothing at it', () => {
    const assigned = assignText(
      [alias, inter],
      [use(shalom, pair), use('AB', pair, { weight: 700 })],
    );
    expect(Object.keys(byWeight(assigned, alias))).toEqual(['400']);
    expect(byWeight(assigned, inter)).toEqual({ 400: ' 0', 700: ' 0AB' });
  });

  it('remembers that text asks for features or sets the axes itself', () => {
    const assigned = assignText(
      [inter, heeboHebrew],
      [use('AB', ['Inter'], { features: true, variations: true }), use(shalom, ['Heebo'])],
    );
    expect(assigned.get(inter)).toMatchObject({ features: true, variations: true });
    expect(assigned.get(heeboHebrew)).toMatchObject({ features: false, variations: false });
  });
});

describe('shapedCodePoints', () => {
  const E_ACUTE = 0xe9;
  const ACUTE = 0x301;
  const BET = 0x5d1;
  const DAGESH = 0x5bc;
  const BET_WITH_DAGESH = 0xfb31;

  it('adds the parts of a composed character', () => {
    expect(shapedCodePoints([E_ACUTE])).toEqual(new Set([E_ACUTE, 0x65, ACUTE]));
  });

  it('adds the composed character of a letter and its mark', () => {
    expect(shapedCodePoints([0x65, ACUTE]).has(E_ACUTE)).toBe(true);
    // A Hebrew letter with a dagesh is one presentation form in a font without mark positioning.
    expect(shapedCodePoints([BET, DAGESH]).has(BET_WITH_DAGESH)).toBe(true);
    expect(shapedCodePoints([BET]).has(BET_WITH_DAGESH)).toBe(false);
  });

  it('adds the mirror image of a bracket, which a right-to-left line draws', () => {
    expect(shapedCodePoints(codePoints('(['))).toEqual(codePoints('()[]'));
    expect(shapedCodePoints(codePoints('ab'))).toEqual(codePoints('ab'));
  });
});

describe('fontFaceCss', () => {
  it('writes the descriptors of the face around the font', () => {
    const heebo = face('Heebo::hebrew', 'U+590-5FF, U+20AA', {
      weight: '100 900',
      rest: [['ascent-override', '90%']],
    });
    expect(fontFaceCss(heebo, { uri: 'data:font/woff2;base64,AAAA', format: 'woff2' })).toBe(
      '@font-face { font-family: "Heebo::hebrew"; font-style: normal; font-weight: 100 900; ' +
        'ascent-override: 90%; font-feature-settings: "kern"; font-display: block; ' +
        'src: url("data:font/woff2;base64,AAAA") format("woff2"); ' +
        'unicode-range: U+590-5FF, U+20AA; }',
    );
  });

  it('writes the weight a variable font was pinned to', () => {
    const css = fontFaceCss(face('Inter', LATIN, { weight: '100 900', style: 'italic' }), {
      uri: 'data:font/woff2;base64,AAAA',
      format: 'woff2',
      weight: '400',
    });
    expect(css).toContain('font-style: italic; font-weight: 400;');
  });

  it('leaves out what the face does not say', () => {
    const css = fontFaceCss(face('My "Font"', '', { weight: '', style: '' }), {
      uri: 'data:application/octet-stream;base64,AAAA',
    });
    expect(css).toBe(
      '@font-face { font-family: "My \\"Font\\""; font-style: normal; font-weight: normal; ' +
        'font-feature-settings: "kern"; font-display: block; ' +
        'src: url("data:application/octet-stream;base64,AAAA"); }',
    );
  });

  it('asks for kerning by name, next to the features the rule sets itself', () => {
    const features = (own: string) =>
      /font-feature-settings: ([^;]+);/.exec(
        fontFaceCss(face('Inter', LATIN, { rest: [['font-feature-settings', own]] }), { uri: '' }),
      )?.[1];
    expect(features('"ss01"')).toBe('"ss01", "kern"');
    // A rule that turns kerning off keeps it off, and it is written once.
    expect(features('"kern" 0')).toBe('"kern" 0');
  });
});
