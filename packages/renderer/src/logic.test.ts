// @vitest-environment happy-dom
import { Deck, type Paragraph } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { cssPropertyName, passthroughStyle, scopeSlideCss, splitStatements } from './css';
import { imagePlacement, linePath } from './elements';
import { referenceDeck } from './fixtures/referenceDeck';
import { pathBounds, presetPath, scalePath, shapePresets, transformPath } from './geometry';
import { normalizeColor, prepareSvg } from './markup';
import { sanitizeMarkup } from './sanitize';
import { firstStrong, listMarkers, paragraphDirection, readsAsNumber } from './text';
import {
  colorCss,
  familyCss,
  fontStack,
  hebrewFace,
  hebrewFaces,
  runFontStack,
  themeVariables,
} from './theme';

describe('css', () => {
  it('maps CSS property names to React style keys', () => {
    expect(cssPropertyName('clip-path')).toBe('clipPath');
    expect(cssPropertyName('-webkit-text-stroke')).toBe('WebkitTextStroke');
    expect(cssPropertyName('-ms-filter')).toBe('msFilter');
    expect(cssPropertyName('--brand')).toBe('--brand');
  });

  it('passes element css through without !important', () => {
    expect(
      passthroughStyle({ 'mix-blend-mode': 'multiply', 'text-shadow': '0 1px red !important' }),
    ).toEqual({
      mixBlendMode: 'multiply',
      textShadow: '0 1px red',
    });
  });

  it('splits a stylesheet into statements, respecting strings, comments and url()', () => {
    const css = `@import "a.css";
.a { background: url(data:image/svg+xml;utf8,<svg>{}</svg>); }
/* } { */ .b::after { content: "}"; }
@media (min-width: 1px) { .c { color: red } }`;
    expect(splitStatements(css)).toEqual([
      '@import "a.css";',
      '.a { background: url(data:image/svg+xml;utf8,<svg>{}</svg>); }',
      '/* } { */ .b::after { content: "}"; }',
      '@media (min-width: 1px) { .c { color: red } }',
    ]);
  });

  it('scopes slide css and leaves global definitions outside the scope', () => {
    const out = scopeSlideCss(
      '@keyframes k { to { opacity: 0 } } .x { color: red } @font-face { font-family: F; src: url(f.woff2) }',
      '[data-slide-id="s_1"]',
    );
    expect(out).toBe(
      '@keyframes k { to { opacity: 0 } }\n@font-face { font-family: F; src: url(f.woff2) }\n@scope ([data-slide-id="s_1"]) {\n.x { color: red }\n}',
    );
  });
});

describe('theme', () => {
  it('resolves tokens to variables and applies alpha', () => {
    expect(colorCss({ token: 'primary' })).toBe('var(--color-primary)');
    expect(colorCss({ value: '#000', alpha: 0.25 })).toBe(
      'color-mix(in srgb, #000 25%, transparent)',
    );
    expect(colorCss({ token: 'text', alpha: 0 })).toBe('transparent');
  });

  it('gives each script its face: the Hebrew-only face, the Latin family, the Hebrew family', () => {
    expect(fontStack({ he: 'Heebo', latin: 'Inter' })).toBe(
      '"Heebo::hebrew", "Inter", "Heebo", sans-serif',
    );
    expect(fontStack({ he: 'Rubik', latin: 'Rubik' })).toBe('"Rubik", sans-serif');
  });

  it('writes a generic family as the keyword it is, and any other family in quotes', () => {
    expect(familyCss('monospace')).toBe('monospace');
    expect(familyCss(' Sans-Serif ')).toBe('sans-serif');
    expect(familyCss('system-ui')).toBe('system-ui');
    expect(familyCss('Courier New')).toBe('"Courier New"');
    // A family that only starts like a keyword is a name.
    expect(familyCss('Serif Pro')).toBe('"Serif Pro"');
    expect(runFontStack('monospace', 'body')).toBe('monospace, var(--font-body)');
    expect(runFontStack('Inter', 'heading')).toBe('"Inter", var(--font-heading)');
    expect(fontStack({ he: 'Heebo', latin: 'serif' })).toBe(
      '"Heebo::hebrew", serif, "Heebo", sans-serif',
    );
  });

  it('names the Hebrew subsets of the registered faces as Hebrew-only faces', () => {
    const faces = [
      {
        family: 'Heebo',
        weight: '100 900',
        url: 'he.woff2',
        unicodeRange: 'U+0590-05FF,U+200C-2010',
      },
      { family: 'Heebo', weight: '100 900', url: 'latin.woff2', unicodeRange: 'U+0000-00FF' },
      { family: 'Whole', weight: '400', url: 'whole.woff2' },
    ];
    // Narrowed to the Hebrew letters, so the face takes nothing a Latin family should draw.
    expect(hebrewFaces(faces)).toEqual([
      {
        family: hebrewFace('Heebo'),
        weight: '100 900',
        url: 'he.woff2',
        unicodeRange: 'U+0590-05FF,U+20AA,U+FB1D-FB4F',
      },
    ]);
  });

  it('exposes the theme as the variables HTML is written against', () => {
    const vars = themeVariables(referenceDeck().theme);
    expect(vars['--color-primary']).toBe('#2f5bea');
    expect(vars['--color-chart-1']).toBe('#2f5bea');
    expect(vars['--font-heading']).toContain('"Heebo"');
    expect(vars['--radius']).toBe('16px');
  });
});

describe('geometry', () => {
  it('draws every preset at any size', () => {
    for (const preset of shapePresets) {
      const path = presetPath(preset, 300, 200, []);
      expect(path?.d, preset).toMatch(/^M/);
      expect(path?.d, preset).not.toContain('NaN');
    }
    expect(presetPath('nope', 10, 10)).toBeUndefined();
  });

  it('scales and moves path data, relative commands included', () => {
    expect(scalePath('M0 0 L10 10 h5 v5 Z', 2, 3)).toBe('M0 0 L20 30 h10 v15 Z');
    expect(transformPath('M0 0 l10 10 A5 5 0 0 1 20 20', 1, 1, 5, 7)).toBe(
      'M5 7 l10 10 A5 5 0 0 1 25 27',
    );
  });

  it('finds the bounds of a path, including a tail past the frame', () => {
    expect(pathBounds('M0 0 L100 0 L100 50 L20 80 L0 50 Z')).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(pathBounds('m10 10 h20 v20 h-20 z')).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    const callout = presetPath('wedgeRectCallout', 200, 100);
    expect(pathBounds(callout?.d ?? '').h).toBeCloseTo(125);
  });

  it('routes elbow and curved lines', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(linePath(pts, 'straight')).toBe('M0 0 L100 50');
    expect(linePath(pts, 'elbow')).toBe('M0 0 H50 V50 H100');
    expect(linePath(pts, 'curved')).toBe('M0 0 C50 0 50 50 100 50');
  });
});

describe('image placement', () => {
  const frame = { w: 400, h: 200 };
  const natural = { w: 1000, h: 1000 };

  it('covers the frame with the whole image when there is no crop', () => {
    expect(imagePlacement(frame, natural, undefined, 'cover')).toEqual({
      left: 0,
      top: -100,
      width: 400,
      height: 400,
    });
    expect(imagePlacement(frame, natural, undefined, 'contain')).toEqual({
      left: 100,
      top: 0,
      width: 200,
      height: 200,
    });
    expect(imagePlacement(frame, natural, undefined, 'fill')).toEqual({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
    });
  });

  it('maps the crop region onto the frame', () => {
    // The right half, 500x1000, stretched to 400x200: the image is 800x200 and starts at -400.
    expect(imagePlacement(frame, natural, { x: 0.5, y: 0, w: 0.5, h: 1 }, 'fill')).toEqual({
      left: -400,
      top: 0,
      width: 800,
      height: 200,
    });
  });
});

describe('lists', () => {
  const p = (kind: 'bullet' | 'number' | null, level = 0): Paragraph => ({
    dir: 'ltr',
    align: 'start',
    runs: [{ text: 'x' }],
    ...(kind ? { list: { kind, level } } : {}),
  });

  it('numbers per level and restarts after a plain paragraph', () => {
    expect(
      listMarkers([p('number'), p('number', 1), p('number', 1), p('number'), p(null), p('number')]),
    ).toEqual(['1.', 'a.', 'b.', '2.', undefined, '1.']);
  });

  it('uses a bullet per level, and a custom glyph when given', () => {
    const custom: Paragraph = { ...p('bullet'), list: { kind: 'bullet', level: 0, glyph: '→' } };
    expect(listMarkers([p('bullet'), p('bullet', 1), custom])).toEqual(['•', '◦', '→']);
  });
});

describe('paragraph direction', () => {
  it('finds the first strong character: letters, not digits, punctuation or emoji', () => {
    expect(firstStrong('שלום world')).toBe('rtl');
    expect(firstStrong('Hello עולם')).toBe('ltr');
    expect(firstStrong('123 שלום')).toBe('rtl');
    expect(firstStrong('(1) hello')).toBe('ltr');
    expect(firstStrong('مرحبا')).toBe('rtl');
    expect(firstStrong('Привет')).toBe('ltr');
    expect(firstStrong('😀 ok')).toBe('ltr');
    expect(firstStrong('87%')).toBeUndefined();
    expect(firstStrong('')).toBeUndefined();
  });

  it('keeps an explicit direction, and resolves auto by the text, then by the deck', () => {
    expect(paragraphDirection('rtl', 'Hello', 'ltr')).toBe('rtl');
    expect(paragraphDirection('ltr', 'שלום', 'rtl')).toBe('ltr');
    expect(paragraphDirection('auto', 'שלום world', 'ltr')).toBe('rtl');
    expect(paragraphDirection('auto', 'Hello עולם', 'rtl')).toBe('ltr');
    expect(paragraphDirection('auto', '+4%', 'rtl')).toBe('rtl');
    expect(paragraphDirection('auto', '+4%', 'ltr')).toBe('ltr');
    expect(paragraphDirection('auto', '', 'rtl')).toBe('rtl');
  });

  it('reads figures left to right in a right-to-left deck, and nothing else', () => {
    expect(readsAsNumber('auto', '+4%', 'rtl')).toBe(true);
    expect(readsAsNumber('auto', '12.10.2026', 'rtl')).toBe(true);
    expect(readsAsNumber('auto', '+4%', 'ltr')).toBe(false);
    expect(readsAsNumber('auto', '4% צמיחה', 'rtl')).toBe(false);
    expect(readsAsNumber('auto', '', 'rtl')).toBe(false);
    // An explicit direction is the author's: it is drawn as it is.
    expect(readsAsNumber('rtl', '+4%', 'rtl')).toBe(false);
  });
});

describe('markup', () => {
  it('removes what can run code and keeps what draws', () => {
    const out = sanitizeMarkup(
      '<div onclick="x()" style="color:red"><script>x()</script><a href=" javascript:x()">a</a><img src="a.png" onerror="x()"><iframe></iframe><a href="https://x.dev">b</a></div>',
    );
    expect(out).toBe(
      '<div style="color:red"><a>a</a><img src="a.png"><a href="https://x.dev" target="_blank" rel="noopener noreferrer">b</a></div>',
    );
  });

  it('normalises colours for comparison', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('black')).toBe('#000000');
    expect(normalizeColor('rgb(0, 0, 0)')).toBe('#000000');
  });

  it('recolours SVG through styles, including the initial black fill and currentColor', () => {
    const out = prepareSvg('<svg viewBox="0 0 24 24"><circle r="1"/><rect fill="#FFF"/></svg>', {
      '#000000': { token: 'primary' },
      '#ffffff': { value: 'red' },
      currentColor: { token: 'accent' },
    });
    expect(out).toContain('fill: var(--color-primary)');
    expect(out).toContain('color: var(--color-accent)');
    expect(out).toMatch(/<rect style="fill: red;?">/);
    expect(out).toContain('width="100%"');
  });
});

describe('reference deck', () => {
  it('is a valid deck', () => {
    expect(() => Deck.parse(referenceDeck())).not.toThrow();
  });
});
