// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { SvgStretch } from '@slidr/model';
import { prepareSvg } from './markup';
import { stretchSvg } from './stretchSvg';

const stretch: SvgStretch = {
  viewBox: { w: 500, h: 150 },
  scale: 1,
  x: [
    [60, 160],
    [340, 440],
  ],
  y: [[70, 88]],
};

describe('drawing stretchable text backgrounds', () => {
  const markup =
    '<svg viewBox="0 0 500 150"><defs><linearGradient id="paint"><stop stop-color="#123456"/></linearGradient></defs><rect width="500" height="150" rx="20" fill="url(#paint)"/><circle cx="28" cy="28" r="5" fill="#123456"/><script>alert(1)</script></svg>';
  it('reuses one sanitized, recoloured drawing and masks joins without hairlines', () => {
    const fragment = stretchSvg(prepareSvg(markup, { '#123456': { value: '#abcdef' } }), stretch, {
      w: 800,
      h: 247.5,
    });
    expect(fragment.querySelectorAll('script')).toHaveLength(0);
    expect(fragment.querySelectorAll('circle')).toHaveLength(1);
    expect(fragment.querySelector('circle')?.style.fill).toBe('#abcdef');
    expect(fragment.querySelectorAll('use')).toHaveLength(15);
    expect(fragment.querySelectorAll('mask rect[shape-rendering="crispEdges"]')).toHaveLength(15);
    expect(fragment.querySelector('[data-stretch-background]')?.getAttribute('viewBox')).toBe(
      '0 0 800 247.5',
    );
  });

  it('needs only one part at its original size and keeps all internal references local', () => {
    const fragment = stretchSvg(prepareSvg(markup, undefined), stretch, { w: 500, h: 150 });
    expect(fragment.querySelectorAll('use')).toHaveLength(1);
    for (const use of fragment.querySelectorAll('use')) {
      const href = use.getAttribute('href')!;
      expect(href.startsWith('#')).toBe(true);
      expect(fragment.querySelector(href)).not.toBeNull();
    }
  });
});
