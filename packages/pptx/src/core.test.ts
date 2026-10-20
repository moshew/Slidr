import { describe, expect, it } from 'vitest';
import { readCss, rgbHex, transform, hexRgba } from './color';
import { relativeTarget, resolveTarget } from './opc';
import { drawingPathToSegments, evaluateGuides, parseSvgPath, segmentsToSvg } from './path';
import { el, esc, parseXml, child, children, textOf } from './xml';
import { crc32, isCompoundFile, readZip, writeZip } from './zip';

/*
 * The parts under the conversions (ADR-108): the ZIP container, the XML of the parts, the paths
 * between relationships, outlines between SVG and DrawingML, and colours.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('the ZIP container', () => {
  it('computes the CRC-32 of ZIP', () => {
    expect(crc32(encoder.encode('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('reads back what it wrote, compressed or stored, under names in any script', async () => {
    const text = 'x'.repeat(5000);
    const bytes = await writeZip([
      { name: '[Content_Types].xml', data: encoder.encode('<Types/>') },
      { name: 'ppt/slides/slide1.xml', data: encoder.encode(text) },
      { name: 'ppt/media/שקף.png', data: new Uint8Array([1, 2, 3]), compress: false },
    ]);
    const entries = readZip(bytes);
    expect([...entries.keys()]).toEqual([
      '[Content_Types].xml',
      'ppt/slides/slide1.xml',
      'ppt/media/שקף.png',
    ]);
    expect(decoder.decode(await entries.get('ppt/slides/slide1.xml')!.read())).toBe(text);
    expect([...(await entries.get('ppt/media/שקף.png')!.read())]).toEqual([1, 2, 3]);
    // Text that repeats is deflated.
    expect(bytes.length).toBeLessThan(2000);
  });

  it('refuses what is not an archive, and tells a protected Office file apart', () => {
    expect(() => readZip(encoder.encode('not a zip at all, but long enough to look'))).toThrow();
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(isCompoundFile(ole)).toBe(true);
    expect(isCompoundFile(encoder.encode('PK\u0003\u0004'))).toBe(false);
  });
});

describe('the XML of the parts', () => {
  it('names elements by the standard prefix of their namespace, whatever the file wrote', () => {
    const root = parseXml(
      '<?xml version="1.0"?><x:sld xmlns:x="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
        'xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:rel="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<x:cSld><d:blip rel:embed="rId3"/></x:cSld></x:sld>',
    );
    expect(root.name).toBe('p:sld');
    const blip = child(child(root, 'p:cSld'), 'a:blip');
    expect(blip?.attrs['r:embed']).toBe('rId3');
  });

  it('reads the strict schemas as the transitional ones', () => {
    const root = parseXml('<p:sld xmlns:p="http://purl.oclc.org/ooxml/presentationml/main"/>');
    expect(root.name).toBe('p:sld');
  });

  it('decodes entities and CDATA, and keeps the spaces of text', () => {
    const root = parseXml(
      `<a:t xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" v='a &quot;b&quot;'>  R&amp;D &#x5e9;&#1500; <![CDATA[<x>]]></a:t>`,
    );
    expect(textOf(root)).toBe('  R&D של <x>');
    expect(root.attrs.v).toBe('a "b"');
  });

  it('writes escaped text, leaves out what is undefined, and closes empty elements', () => {
    expect(el('a:pt', { x: 1, y: undefined, b: true })).toBe('<a:pt x="1" b="1"/>');
    expect(el('a:t', {}, esc('<1 & 2>'))).toBe('<a:t>&lt;1 &amp; 2&gt;</a:t>');
    expect(esc('a\u0001b')).toBe('ab');
    expect(children(parseXml('<r><a/><b/><a/></r>'), 'a')).toHaveLength(2);
  });

  it('rejects a document that is not well formed', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseXml('<a>')).toThrow();
  });
});

describe('relationship targets', () => {
  it('resolves a target against its part, and writes one relative to it', () => {
    expect(resolveTarget('ppt/slides/slide1.xml', '../media/image1.png')).toBe(
      'ppt/media/image1.png',
    );
    expect(resolveTarget('ppt/slides/slide1.xml', '/ppt/media/a.png')).toBe('ppt/media/a.png');
    expect(resolveTarget('', 'ppt/presentation.xml')).toBe('ppt/presentation.xml');
    expect(relativeTarget('ppt/slides/slide1.xml', 'ppt/media/image1.png')).toBe(
      '../media/image1.png',
    );
    expect(relativeTarget('ppt/presentation.xml', 'ppt/slides/slide2.xml')).toBe(
      'slides/slide2.xml',
    );
  });
});

describe('outlines between SVG and DrawingML', () => {
  it('reads relative and shorthand SVG commands as absolute ones', () => {
    const segments = parseSvgPath('m10 10 h20 v20 l-20 0 z');
    expect(segmentsToSvg(segments)).toBe('M10 10 L30 10 L30 30 L10 30 Z');
  });

  it('turns an SVG arc into Béziers that end where it ends', () => {
    const segments = parseSvgPath('M0 50 A50 50 0 0 1 100 50');
    expect(segments.every((s) => s.type === 'M' || s.type === 'C')).toBe(true);
    const last = segments.at(-1)!;
    expect(last.pts.at(-1)).toEqual([100, 50]);
    // Over the top of the circle: the middle of it is 50 above the centre.
    const top = Math.min(...segments.flatMap((s) => s.pts.map(([, y]) => y)));
    expect(top).toBeLessThan(10);
  });

  it('draws a DrawingML arc from its start angle and its sweep', () => {
    const guides = evaluateGuides(100, 100, []);
    const { svg } = drawingPathToSegments(
      [
        { name: 'moveTo', pts: [{ x: '100', y: '50' }] },
        { name: 'arcTo', pts: [], arc: { wR: '50', hR: '50', stAng: '0', swAng: '5400000' } },
      ],
      guides,
      1,
      1,
    );
    // A quarter turn clockwise from the right of the circle ends at its bottom.
    expect(svg).toBe('M100 50 A50 50 0 0 1 50 100');
  });

  it('evaluates the guides of custom geometry', () => {
    const values = evaluateGuides(200, 100, [
      { name: 'half', fmla: '*/ w 1 2' },
      { name: 'x', fmla: '+- half 10 0' },
      { name: 'p', fmla: 'pin 0 300 h' },
    ]);
    expect(values.get('half')).toBe(100);
    expect(values.get('x')).toBe(110);
    expect(values.get('p')).toBe(100);
  });
});

describe('colours', () => {
  it('darkens and lightens a theme colour as Office does', () => {
    const accent = hexRgba('4472C4');
    // "Blue, Accent 1, Darker 25%" and "Lighter 40%" of Office's own palette.
    expect(rgbHex(transform(accent, [{ name: 'lumMod', val: 75000 }]))).toBe('2F5597');
    expect(
      rgbHex(
        transform(accent, [
          { name: 'lumMod', val: 60000 },
          { name: 'lumOff', val: 40000 },
        ]),
      ),
    ).toBe('8FAADC');
    expect(transform(accent, [{ name: 'alpha', val: 50000 }]).a).toBe(0.5);
  });

  it('reads CSS colours, and the theme variables as tokens', () => {
    expect(readCss('var(--color-primary)')).toEqual({ token: 'primary' });
    expect(readCss('rebeccapurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(readCss('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(readCss('hsl(0, 100%, 50%)')).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(readCss('transparent')).toMatchObject({ a: 0 });
    expect(readCss('currentColor')).toBeUndefined();
  });
});
