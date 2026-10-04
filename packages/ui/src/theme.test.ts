import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * DSN-08: text and icons pass WCAG AA on every surface they sit on, in both themes. The pairs
 * are read from theme.css, so changing a token re-runs the check.
 */

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

type Rgba = [number, number, number, number];

function token(name: string, theme: 'light' | 'dark'): string {
  const match = new RegExp(
    `--color-${name}:\\s*light-dark\\((#[0-9a-f]+),\\s*(#[0-9a-f]+)\\)`,
  ).exec(css);
  if (!match?.[1] || !match[2]) throw new Error(`--color-${name} is not a light-dark() pair`);
  return theme === 'light' ? match[1] : match[2];
}

function parse(hex: string): Rgba {
  const n = hex.slice(1);
  const channel = (i: number) => parseInt(n.slice(i, i + 2), 16);
  return [channel(0), channel(2), channel(4), n.length === 8 ? channel(6) / 255 : 1];
}

/** A translucent colour over an opaque one. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast of `fg` on `bg`, where `bg` may itself be a tint over `base`. */
function contrast(fg: string, bg: string, theme: 'light' | 'dark', base = 'ui-panel'): number {
  let back = parse(token(bg, theme));
  if (back[3] < 1) back = over(back, parse(token(base, theme)));
  const front = over(parse(token(fg, theme)), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = ['ui-chrome', 'ui-panel', 'ui-canvas', 'ui-raised', 'ui-field'];

const textPairs: [fg: string, bg: string][] = [
  ...surfaces.flatMap((s) => [
    ['ui-fg', s] as [string, string],
    ['ui-fg-muted', s] as [string, string],
  ]),
  ['ui-fg', 'ui-hover'],
  ['ui-fg', 'ui-pressed'],
  ['ui-on-accent', 'ui-accent'],
  ['ui-on-accent', 'ui-accent-hover'],
  ['ui-on-accent', 'ui-accent-pressed'],
  ['ui-accent-fg', 'ui-panel'],
  ['ui-accent-fg', 'ui-chrome'],
  ['ui-accent-fg', 'ui-accent-soft'],
  ['ui-accent-fg', 'ui-accent-soft-hover'],
  ['ui-on-danger', 'ui-danger'],
  ['ui-on-danger', 'ui-danger-hover'],
  ['ui-danger-fg', 'ui-panel'],
  ['ui-danger-fg', 'ui-raised'],
  ['ui-danger-fg', 'ui-danger-soft'],
  ['ui-success-fg', 'ui-chrome'],
  ['ui-warning-fg', 'ui-chrome'],
  ['ui-on-tooltip', 'ui-tooltip'],
];

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  it.each(textPairs)('%s on %s passes AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(fg, bg, theme)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)('the focus ring stands out from %s (3:1)', (surface) => {
    expect(contrast('ui-focus', surface, theme)).toBeGreaterThanOrEqual(3);
  });

  it('the selected segment and the accent fill stand out from their track (non-text 3:1)', () => {
    expect(contrast('ui-accent', 'ui-panel', theme)).toBeGreaterThanOrEqual(3);
  });
});

describe('the switch and the checkbox (non-text 3:1)', () => {
  it.each(['light', 'dark'] as const)('%s: what tells off from on stands out', (theme) => {
    // Off: the outline of the box or the track, and the thumb, on whatever surface they sit on.
    for (const surface of surfaces) {
      expect(contrast('ui-fg-muted', surface, theme)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast('ui-fg-muted', 'ui-pressed', theme)).toBeGreaterThanOrEqual(3);
    // On: the mark and the thumb on the accent fill, at rest, hovered and pressed.
    for (const fill of ['ui-accent', 'ui-accent-hover', 'ui-accent-pressed']) {
      expect(contrast('ui-on-accent', fill, theme)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('reduced motion', () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{([^{}]*)\{[^{}]*\}/.exec(css);
  // One selector on a line; a selector has a comma of its own.
  const selectors = (block?.[1] ?? '').trim().split(/,\s*\n\s*/);

  it('shortens every transition and animation of the app', () => {
    expect(block?.[0]).toMatch(/animation-duration: 1ms !important/);
    expect(block?.[0]).toMatch(/transition-duration: 1ms !important/);
    expect(selectors).toHaveLength(3);
  });

  it('leaves the slide alone: the root the renderer draws and everything under it', () => {
    // `.slidr-slide` is the class of the root in packages/renderer/src/SlideRenderer.tsx. The
    // rule is seen at work, on a real slide, in e2e/editor-ui-components.spec.ts.
    for (const selector of selectors) {
      expect(selector).toMatch(/^:not\(\.slidr-slide, \.slidr-slide \*\)(?:::before|::after)?$/);
    }
  });
});

describe('fonts', () => {
  it('has a fixed-width family beside the UI family, each ending in a generic one', () => {
    expect(/--font-ui:\s*([^;]+);/.exec(css)?.[1]).toMatch(/, sans-serif$/);
    expect(/--font-mono:\s*([^;]+);/.exec(css)?.[1]).toMatch(/, monospace$/);
  });
});

describe('token names', () => {
  it('never take a name of the slide theme contract (RND-08)', () => {
    const names = [...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
    const slideTokens = /^(bg|surface|text|muted|primary|secondary|accent|chart-\d+)$/;
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((n) => n && !n.startsWith('ui-') && n !== '*')).toEqual([]);
    expect(names.filter((n) => n && slideTokens.test(n))).toEqual([]);
  });
});
