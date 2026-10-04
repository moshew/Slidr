/**
 * An SVG file as it is taken into a slide (SHP-06, SEC-06), in a real browser: the cleaning
 * parses the file as the webview would, and what it lets through is drawn in the editor's own
 * document.
 */
import type { AssetMeta } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { cleanSvg, MAX_INLINE_SVG, svgColors, svgMarkups, svgSize } from './svgImport';

const svg = (inside: string, attributes = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${inside}</svg>`;

/** The cleaned markup, parsed again, to ask what is left in it. */
function cleaned(text: string): Element {
  const markup = cleanSvg(text);
  if (!markup) throw new Error('the file was not taken as an SVG');
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

describe('cleaning an SVG file', () => {
  it('takes out what runs code, and keeps what draws', () => {
    const root = cleaned(
      svg(
        `<script>window.hacked = true</script>
         <rect width="50" height="50" fill="#ff0000" onclick="alert(1)" onload="alert(2)"/>
         <foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(3)"/></body></foreignObject>
         <a href="javascript:alert(4)"><circle cx="70" cy="70" r="10" fill="blue"/></a>
         <set attributeName="onmouseover" to="alert(5)"/>`,
      ),
    );
    expect(root.querySelector('script, foreignObject, a, set')).toBeNull();
    expect(root.querySelector('rect')?.getAttributeNames().sort()).toEqual([
      'fill',
      'height',
      'width',
    ]);
    // The link is gone; what it held is still drawn.
    expect(root.querySelector('circle')?.getAttribute('fill')).toBe('blue');
    expect(new XMLSerializer().serializeToString(root)).not.toMatch(/alert|javascript:|onerror/);
  });

  it('keeps references inside the file, and drops every one that leaves it', () => {
    const root = cleaned(
      svg(
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>
           <symbol id="s"><rect width="5" height="5"/></symbol></defs>
         <rect id="inside" width="50" height="50" fill="url(#g)"/>
         <use id="local" xlink:href="#s"/>
         <use id="remote" xlink:href="https://example.com/sprite.svg#x"/>
         <image id="data" href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>
         <image id="web" href="https://example.com/photo.png" width="10" height="10"/>
         <image id="nested" href="data:image/svg+xml;base64,PHN2Zy8+" width="10" height="10"/>
         <rect id="outside" width="5" height="5" style="fill: url(https://example.com/p.svg#x); stroke: #00ff00"/>`,
      ),
    );
    const href = (id: string) =>
      root.querySelector(`#${id}`)?.getAttribute('href') ??
      root.querySelector(`#${id}`)?.getAttribute('xlink:href');
    expect(root.querySelector('#inside')?.getAttribute('fill')).toBe('url(#g)');
    expect(href('local')).toBe('#s');
    expect(href('data')).toMatch(/^data:image\/png/);
    expect(href('remote')).toBeFalsy();
    expect(href('web')).toBeFalsy();
    // An SVG inside an SVG is a document of its own: not taken.
    expect(href('nested')).toBeFalsy();
    const outside = root.querySelector<SVGElement>('#outside')!;
    expect(outside.style.getPropertyValue('fill')).toBe('');
    expect(outside.style.getPropertyValue('stroke')).toBe('rgb(0, 255, 0)');
  });

  it('writes the stylesheet onto the elements and takes it out, so it cannot restyle the editor', () => {
    const root = cleaned(
      svg(
        `<style>
           @import url("https://example.com/evil.css");
           * { display: none }
           .a { fill: #112233; stroke: #445566 }
           rect.a { fill: #778899 }
           #own { fill: #000001 }
           .bg { fill: url(https://example.com/p.png) }
         </style>
         <rect class="a" width="10" height="10"/>
         <circle class="a" r="5"/>
         <path id="own" class="a" style="fill: #abcdef" d="M0 0h5v5z"/>
         <rect class="bg" width="3" height="3"/>`,
      ),
    );
    expect(root.querySelector('style')).toBeNull();
    const fill = (selector: string) =>
      root.querySelector<SVGElement>(selector)!.style.getPropertyValue('fill');
    // The more specific rule wins, whatever the order of the rules.
    expect(fill('rect.a')).toBe('rgb(119, 136, 153)');
    expect(fill('circle')).toBe('rgb(17, 34, 51)');
    // What the element said itself stands over every rule.
    expect(fill('#own')).toBe('rgb(171, 205, 239)');
    expect(root.querySelector<SVGElement>('circle')!.style.getPropertyValue('stroke')).toBe(
      'rgb(68, 85, 102)',
    );
    // A paint that leaves the file is not written.
    expect(fill('.bg')).toBe('');
  });

  it('does not take what is not an SVG, or is too large to keep in a deck', () => {
    expect(cleanSvg('<html><body>not an svg</body></html>')).toBeUndefined();
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect</svg>')).toBeUndefined();
    expect(cleanSvg(svg(`<desc>${'x'.repeat(MAX_INLINE_SVG)}</desc>`))).toBeUndefined();
  });

  it('gives a file without a viewBox one, from its size', () => {
    const root = cleaned(svg('<rect width="5" height="5"/>', 'width="240" height="120"'));
    expect(root.getAttribute('viewBox')).toBe('0 0 240 120');
    expect(svgSize(new XMLSerializer().serializeToString(root))).toEqual({ w: 240, h: 120 });
  });
});

describe('the colours of an SVG', () => {
  it('lists every colour it draws in, the most used first, in one form', () => {
    const colours = svgColors(
      svg(
        `<rect fill="#F00" width="1" height="1"/>
         <rect fill="red" style="stroke: rgb(0, 0, 255)" width="1" height="1"/>
         <rect fill="#ff0000" width="1" height="1"/>
         <rect fill="#FF0000" stroke="none" width="1" height="1"/>
         <path fill="currentColor" d="M0 0h1v1z"/>
         <linearGradient id="g"><stop stop-color="#00ff00"/></linearGradient>
         <rect fill="url(#g)" width="1" height="1"/>`,
      ),
    );
    expect(colours[0]).toBe('#ff0000');
    expect(colours).toEqual(
      expect.arrayContaining(['#ff0000', 'red', '#0000ff', 'currentcolor', '#00ff00']),
    );
    expect(colours).not.toContain('none');
    expect(colours.some((colour) => colour.startsWith('url('))).toBe(false);
  });

  it('counts black for shapes that name no fill, as SVG draws them', () => {
    expect(svgColors(svg('<path d="M0 0h5v5z"/>'))).toEqual(['#000000']);
    // A fill on an ancestor reaches the shape: no black of its own.
    expect(svgColors(svg('<g fill="#123456"><path d="M0 0h5v5z"/></g>'))).toEqual(['#123456']);
  });
});

describe('the SVG files among what was imported', () => {
  const asset = (id: string, kind: AssetMeta['kind']): AssetMeta => ({
    id,
    file: `${id}.bin`,
    mime: kind === 'svg' ? 'image/svg+xml' : 'image/png',
    kind,
    bytes: 10,
    origin: 'upload',
  });

  it('are the ones whose markup can be kept: by asset id', async () => {
    const files = [
      new File([svg('<rect width="5" height="5" fill="#f00"/>')], 'logo.svg'),
      new File(['not a picture'], 'photo.png'),
      new File(['<svg'], 'broken.svg'),
    ];
    const markups = await svgMarkups(files, [
      asset('a', 'svg'),
      asset('b', 'image'),
      asset('c', 'svg'),
    ]);
    expect(Array.from(markups.keys())).toEqual(['a']);
    expect(markups.get('a')).toContain('<rect');
  });
});
