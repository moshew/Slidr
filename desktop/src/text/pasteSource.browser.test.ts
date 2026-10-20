import type { AssetMeta, Deck } from '@slidr/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerBuiltinFonts } from '../fonts';
import { setSystemFontSource } from '../fonts/systemFonts';
import { htmlToSourceText, keepSource } from './paste';
import { knowInstalledFonts, sourceColor, sourceContext } from './pasteSource';

/*
 * "Keep the source's formatting" in a real browser (TXT-13): the stylesheet a word processor
 * says its formatting in is parsed by the browser's own CSS parser, a CSS colour is read by the
 * browser, and the fonts that can be drawn are the ones this page has.
 */

const fontAsset = (family: string): AssetMeta => ({
  id: 'f_deck',
  file: 'f_deck.woff2',
  mime: 'font/woff2',
  kind: 'font',
  bytes: 1,
  origin: 'import',
  font: { family, weight: '400', style: 'normal' },
});

const deck = {
  size: { w: 1920, h: 1080 },
  assets: { f_deck: fontAsset('Deck Display') },
} as unknown as Deck;

beforeAll(async () => {
  registerBuiltinFonts();
  await setSystemFontSource(() =>
    Promise.resolve([
      { family: 'Calibri', hebrew: false, symbol: false, weights: [300, 400, 700] },
    ]),
  );
  knowInstalledFonts();
  // The list is taken a moment after it is asked for.
  await Promise.resolve();
});

afterAll(async () => {
  await setSystemFontSource(null);
});

/** A copy from a word processor: the formatting is in a stylesheet, by class, inside a comment. */
const DOCUMENT = `<html><head>
<meta name=Generator content="Microsoft Word 15">
<style>
<!--
 /* Font Definitions */
 @font-face {font-family:Calibri; panose-1:2 15 5 2 2 2 4 3 2 4;}
 /* Style Definitions */
 p.MsoNormal, li.MsoNormal, div.MsoNormal
	{margin:0cm; line-height:107%; font-size:11.0pt; font-family:"Calibri",sans-serif;}
 h1 {margin-top:12.0pt; font-size:16.0pt; font-family:"Calibri Light",sans-serif; color:#2F5496; font-weight:normal;}
 a:link, span.MsoHyperlink {color:#0563C1; text-decoration:underline;}
 p.Quote {font-style:italic; text-align:center; color:rgb(64, 64, 64);}
 @page WordSection1 {size:612.0pt 792.0pt;}
 div.WordSection1 {page:WordSection1;}
-->
</style></head>
<body lang=EN-US><!--StartFragment-->
<h1>Heading</h1>
<p class=MsoNormal>Plain <b><span style='font-size:14.0pt;color:red'>big red</span></b> text
 <a href="https://slidr.dev">a link</a><o:p></o:p></p>
<p class=Quote>A quote</p>
<p class=MsoNormal dir=RTL style='text-align:right;direction:rtl'><span lang=HE style='font-family:"Rubik",sans-serif'>עברית</span></p>
<!--EndFragment--></body></html>`;

describe('the colours of a source', () => {
  it('are read in whatever way CSS writes them, as explicit colours of the model', () => {
    expect(sourceColor('red')).toEqual({ value: '#ff0000' });
    expect(sourceColor('#2F5496')).toEqual({ value: '#2f5496' });
    expect(sourceColor('rgb(64, 64, 64)')).toEqual({ value: '#404040' });
    expect(sourceColor('hsl(120 100% 25%)')).toEqual({ value: '#008000' });
    expect(sourceColor('rgba(255, 0, 0, 0.5)')).toEqual({ value: '#ff0000', alpha: 0.5 });
  });

  it('are nothing where the source states no colour of its own', () => {
    for (const css of ['inherit', 'currentColor', 'windowtext', 'transparent', 'rgba(0,0,0,0)'])
      expect(sourceColor(css)).toBeUndefined();
    expect(sourceColor('no-such-colour')).toBeUndefined();
  });
});

describe('the fonts a source may keep', () => {
  it('are the ones the deck carries, the page registered and the computer has', () => {
    const { font } = sourceContext(deck);
    expect(font(['deck display'])).toBe('Deck Display');
    expect(font(['rubik'])).toBe('Rubik');
    expect(font(['CALIBRI', 'sans-serif'])).toBe('Calibri');
    expect(font(['Nowhere Sans', 'sans-serif'])).toBeUndefined();
    // A face of one script only is the renderer's own business, not a family to name.
    expect(font(['Heebo::hebrew'])).toBeUndefined();
  });

  it('keep the physical size of the text: a slide is 1.5 pixels to a page pixel', () => {
    expect(sourceContext(deck).scale).toBe(1.5);
  });
});

describe('a copy from a word processor, keeping its formatting', () => {
  const text = () => htmlToSourceText(DOCUMENT, sourceContext(deck));

  it('reads the formatting its stylesheet gives by class and by tag', () => {
    const [heading, body, quote, hebrew] = text().paragraphs;
    // The stylesheet's own rule for h1 wins over what a browser gives a heading: 16pt, not bold.
    expect(heading).toEqual({
      runs: [{ text: 'Heading', marks: { size: 32, weight: 400, color: { value: '#2f5496' } } }],
    });
    expect(body?.runs).toEqual([
      // 11pt in Calibri, from `p.MsoNormal`.
      { text: 'Plain ', marks: { font: 'Calibri', size: 22 } },
      // The run's own style over its paragraph's: 14pt, red, bold.
      {
        text: 'big red',
        marks: { font: 'Calibri', size: 28, weight: 700, color: { value: '#ff0000' } },
      },
      { text: ' text ', marks: { font: 'Calibri', size: 22 } },
      {
        text: 'a link',
        marks: {
          font: 'Calibri',
          size: 22,
          link: 'https://slidr.dev',
          underline: true,
          color: { value: '#0563c1' },
        },
      },
    ]);
    expect(quote).toEqual({
      runs: [{ text: 'A quote', marks: { italic: true, color: { value: '#404040' } } }],
      align: 'center',
    });
    expect(hebrew).toEqual({
      runs: [{ text: 'עברית', marks: { font: 'Rubik', size: 22 } }],
      align: 'right',
      dir: 'rtl',
    });
  });

  it('never reads the stylesheet as text, and names nothing the stylesheet would load', () => {
    const all = JSON.stringify(text());
    expect(all).not.toMatch(/Mso|font-face|panose|WordSection|Generator/);
  });

  it('lands in a destination as rich text of the model', () => {
    const rich = keepSource(text(), {
      paragraph: { dir: 'auto', align: 'start', styleRef: 'body' },
      marks: undefined,
      dir: 'ltr',
    });
    expect(rich.paragraphs.map((paragraph) => [paragraph.dir, paragraph.align])).toEqual([
      ['auto', 'start'],
      ['auto', 'start'],
      ['auto', 'center'],
      // Right, in a paragraph that reads from the right, is the start of the line.
      ['rtl', 'start'],
    ]);
  });
});
