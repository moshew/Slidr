import { fixtureDecks } from '@slidr/model/fixtures';
import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { describe, expect, it } from 'vitest';
import { exportPptx, type PptxExportOptions } from './export';
import { markedPicture } from './testing';
import { child, children, descendants, parseXml, path, type XmlElement } from './xml';
import { readZip } from './zip';

/*
 * The export (ADR-108): what a deck becomes in a PowerPoint file, read back as XML.
 */

const decoder = new TextDecoder();

/** Bytes for every asset of a deck: pictures that are pictures, and media that is bytes. */
async function loader(): Promise<PptxExportOptions['loadAsset']> {
  const picture = await markedPicture(48, 32);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
  return (asset: AssetMeta) =>
    Promise.resolve(
      asset.kind === 'svg'
        ? new Blob([svg], { type: 'image/svg+xml' })
        : asset.kind === 'image'
          ? new Blob([picture], { type: 'image/png' })
          : new Blob([new Uint8Array(64)], { type: asset.mime }),
    );
}

async function exported(deck: Deck, options: Partial<PptxExportOptions> = {}) {
  for (const asset of Object.values(deck.assets))
    if (asset.kind === 'image') asset.mime = 'image/png';
  const result = await exportPptx(deck, { loadAsset: await loader(), ...options });
  const entries = readZip(result.bytes);
  const xml = async (name: string): Promise<XmlElement> => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`no part ${name}`);
    return parseXml(decoder.decode(await entry.read()));
  };
  return { result, entries, xml };
}

const tree = (slide: XmlElement) => path(slide, 'p:cSld', 'p:spTree');

describe('PowerPoint export', () => {
  it('writes a package PowerPoint opens: content types, presentation, master, layouts, theme, slides', async () => {
    const deck = referenceDeck();
    const { result, entries, xml } = await exported(deck);
    expect(result.slides).toBe(deck.slides.length);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
      'ppt/presProps.xml',
      'ppt/viewProps.xml',
      'ppt/tableStyles.xml',
      'docProps/core.xml',
      'docProps/app.xml',
    ]) {
      expect(entries.has(part), part).toBe(true);
    }
    const presentation = await xml('ppt/presentation.xml');
    expect(children(child(presentation, 'p:sldIdLst'), 'p:sldId')).toHaveLength(deck.slides.length);
    expect(child(presentation, 'p:sldSz')?.attrs).toMatchObject({ cx: '12192000', cy: '6858000' });
    // Every part the package names has a content type.
    const types = await xml('[Content_Types].xml');
    const overrides = new Set(children(types, 'Override').map((o) => o.attrs.PartName));
    const defaults = new Set(children(types, 'Default').map((d) => d.attrs.Extension));
    for (const name of entries.keys()) {
      const extension = name.split('.').at(-1)!;
      expect(overrides.has(`/${name}`) || defaults.has(extension), name).toBe(true);
    }
    // The deck's colours are the theme's: the primary colour is the first accent.
    const theme = await xml('ppt/theme/theme1.xml');
    const scheme = path(theme, 'a:themeElements', 'a:clrScheme');
    expect(path(scheme, 'a:accent1', 'a:srgbClr')?.attrs.val).toBe(
      deck.theme.colors.primary.slice(1).toUpperCase(),
    );
  });

  it('leaves hidden slides out, and keeps only the slides asked for', async () => {
    const deck = fixtureDecks.englishDeck();
    deck.slides[1]!.hidden = true;
    expect((await exported(deck)).result.slides).toBe(deck.slides.length - 1);
    const only = await exported(fixtureDecks.englishDeck(), { slideIds: [deck.slides[0]!.id] });
    expect(only.result.slides).toBe(1);
  });

  it('writes text with its look in every run, and a right-to-left paragraph as one', async () => {
    const deck = createDeck({ lang: 'he', title: 'מצגת' });
    deck.slides.push(
      createSlide({
        elements: [
          createElement.text({
            role: 'title',
            frame: { x: 100, y: 80, w: 1200, h: 160 },
            content: richText('כותרת ראשית', { dir: 'rtl', align: 'start', styleRef: 'title' }),
          }),
          createElement.text({
            frame: { x: 100, y: 300, w: 1200, h: 300 },
            content: {
              paragraphs: [
                {
                  dir: 'ltr',
                  align: 'end',
                  runs: [
                    { text: 'Bold', marks: { weight: 700, size: 40, color: { token: 'primary' } } },
                  ],
                },
                {
                  dir: 'rtl',
                  align: 'start',
                  list: { kind: 'bullet', level: 0 },
                  runs: [{ text: 'נקודה' }],
                },
              ],
            },
          }),
        ],
      }),
    );
    const { xml } = await exported(deck);
    const slide = await xml('ppt/slides/slide1.xml');
    const shapes = children(tree(slide), 'p:sp');
    // The title stands in for the title placeholder of its layout.
    expect(path(shapes[0], 'p:nvSpPr', 'p:nvPr', 'p:ph')?.attrs.type).toBe('title');
    const title = descendants(shapes[0], 'a:p')[0]!;
    expect(child(title, 'a:pPr')?.attrs).toMatchObject({ rtl: '1', algn: 'r' });
    const [bold, bullet] = descendants(shapes[1], 'a:p');
    expect(child(bold, 'a:pPr')?.attrs).toMatchObject({ rtl: '0', algn: 'r' });
    const rPr = path(bold, 'a:r', 'a:rPr')!;
    // 40 slide pixels are 20 points.
    expect(rPr.attrs).toMatchObject({ sz: '2000', b: '1', lang: 'he-IL' });
    expect(path(rPr, 'a:solidFill', 'a:schemeClr')?.attrs.val).toBe('accent1');
    expect(child(child(bullet, 'a:pPr'), 'a:buChar')?.attrs.char).toBe('•');
    expect(child(child(bullet, 'a:pPr'), 'a:buChar')).toBeDefined();
    // A Hebrew deck is a right-to-left presentation.
    expect((await xml('ppt/presentation.xml')).attrs.rtl).toBe('1');
  });

  it('writes shapes, pictures and lines as PowerPoint objects', async () => {
    const deck = referenceDeck();
    const { xml, result } = await exported(deck);
    const shapes = await xml('ppt/slides/slide1.xml');
    const presets = descendants(shapes, 'a:prstGeom').map((g) => g.attrs.prst);
    expect(presets).toEqual(
      expect.arrayContaining(['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond']),
    );
    // The others are drawn as they are in the deck.
    expect(descendants(shapes, 'a:custGeom').length).toBeGreaterThan(20);
    const lines = await xml('ppt/slides/slide2.xml');
    const connectors = descendants(lines, 'p:cxnSp');
    expect(connectors.length).toBeGreaterThan(5);
    expect(descendants(lines, 'a:tailEnd').map((t) => t.attrs.type)).toEqual(
      expect.arrayContaining(['arrow', 'triangle', 'oval', 'diamond']),
    );
    const images = await xml('ppt/slides/slide5.xml');
    const pictures = descendants(images, 'p:pic');
    expect(pictures.length).toBeGreaterThanOrEqual(10);
    // A picture with a cut and a frame keeps them: the cut as the part of the picture shown.
    expect(descendants(images, 'a:srcRect').some((r) => Object.keys(r.attrs).length > 0)).toBe(
      true,
    );
    expect(descendants(images, 'a:prstGeom').map((g) => g.attrs.prst)).toEqual(
      expect.arrayContaining(['ellipse', 'roundRect']),
    );
    // The placeholder with no picture yet is said, not written.
    expect(result.warnings.some((w) => w.code === 'image-placeholder' && w.slide === 5)).toBe(true);
  });

  it('writes a table in the order the screen shows it, each cell with its own look', async () => {
    const deck = referenceDeck();
    const { xml } = await exported(deck);
    const slide = await xml('ppt/slides/slide8.xml');
    const table = descendants(slide, 'a:tbl')[0]!;
    const source = deck.slides[7]!.elements.find((e) => e.type === 'table')!;
    if (source.type !== 'table') throw new Error('no table');
    const widths = children(child(table, 'a:tblGrid'), 'a:gridCol').map((g) => Number(g.attrs.w));
    expect(widths).toHaveLength(source.cols.length);
    // Right to left: the first column on the left of the screen is the table's last.
    const scale = (source.frame.w / source.cols.reduce((a, b) => a + b, 0)) * 6350;
    expect(widths[0]).toBe(Math.round(source.cols.at(-1)! * scale));
    const rows = children(table, 'a:tr');
    expect(rows).toHaveLength(source.rows.length);
    const header = children(rows[0], 'a:tc')[0]!;
    expect(path(header, 'a:tcPr', 'a:solidFill')).toBeDefined();
    expect(descendants(table, 'a:tc').some((tc) => tc.attrs.gridSpan === '2')).toBe(true);
    expect(descendants(table, 'a:tc').some((tc) => tc.attrs.hMerge === '1')).toBe(true);
  });

  it('writes a chart as a chart part with its data cached and a workbook to edit it in', async () => {
    const deck = referenceDeck();
    const { xml, entries } = await exported(deck);
    const chart = await xml('ppt/charts/chart1.xml');
    const bar = descendants(chart, 'c:barChart')[0]!;
    expect(child(bar, 'c:barDir')?.attrs.val).toBe('col');
    const values = descendants(child(bar, 'c:ser'), 'c:numCache')[0]!;
    expect(
      children(values, 'c:pt').map((pt) => Number(descendants(pt, 'c:v')[0]?.children[0])),
    ).toEqual([3, 5, 4, 7]);
    expect(entries.has('ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx')).toBe(true);
    const book = readZip(
      await entries.get('ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx')!.read(),
    );
    expect(book.has('xl/worksheets/sheet1.xml')).toBe(true);
  });

  it('writes what PowerPoint has no object for as a picture the host draws, and says so', async () => {
    const deck = referenceDeck();
    const without = await exported(deck);
    expect(without.result.warnings.some((w) => w.code === 'html-missing')).toBe(true);
    const picture = await markedPicture(20, 10);
    const drawn = await exported(referenceDeck(), {
      picture: () => Promise.resolve({ png: picture }),
    });
    expect(drawn.result.warnings.some((w) => w.code === 'html-picture')).toBe(true);
    expect(drawn.result.warnings.some((w) => w.code === 'html-missing')).toBe(false);
    const slide = await drawn.xml('ppt/slides/slide7.xml');
    expect(descendants(slide, 'p:pic').length).toBeGreaterThanOrEqual(3);
  });

  it('gives a layout of the deck its decorations and placeholders, and a slide its notes, transition and animations', async () => {
    const deck = fixtureDecks.allElementsDeck();
    const { xml, entries, result } = await exported(deck);
    const layout = await xml('ppt/slideLayouts/slideLayout1.xml');
    expect(layout.attrs.type).toBe('picTx');
    const phs = descendants(layout, 'p:ph').map((ph) => ph.attrs.type);
    expect(phs).toEqual(expect.arrayContaining(['title', 'body', 'pic']));
    // The decoration of the layout is drawn by the layout.
    expect(descendants(layout, 'p:sp').length).toBeGreaterThan(phs.length);
    const slide = await xml('ppt/slides/slide1.xml');
    expect(child(slide, 'p:transition')).toBeDefined();
    expect(descendants(slide, 'p:par').length).toBeGreaterThan(0);
    expect(descendants(slide, 'a:videoFile')).toHaveLength(1);
    expect(descendants(slide, 'a:audioFile')).toHaveLength(1);
    expect([...entries.keys()].some((name) => name.startsWith('ppt/notesSlides/'))).toBe(true);
    expect(result.warnings.some((w) => w.code === 'slide-css')).toBe(true);
    expect(result.warnings.some((w) => w.code === 'fonts')).toBe(true);
  });

  it('leaves transitions and animations out when asked to', async () => {
    const { xml } = await exported(fixtureDecks.allElementsDeck(), { animations: false });
    const slide = await xml('ppt/slides/slide1.xml');
    expect(child(slide, 'p:transition')).toBeUndefined();
    expect(child(slide, 'p:timing')).toBeUndefined();
  });
});
