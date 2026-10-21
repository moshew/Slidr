import { readFileSync } from 'node:fs';
import {
  createDeck,
  createElement,
  createSlide,
  Deck,
  richText,
  type Element,
  type AssetMeta,
} from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { describe, expect, it } from 'vitest';
import { exportPptx } from './export';
import { importPptx, PptxReadError } from './import';
import { markedPicture, memoryStore } from './testing';
import { readZip, writeZip } from './zip';

/*
 * The import (ADR-108): a file another tool wrote, read into a deck; and a deck sent out to
 * PowerPoint and read back, which comes back as it went.
 */

const foreign = () =>
  new Uint8Array(readFileSync(new URL('./fixtures/foreign.pptx', import.meta.url)));

/** Every element of a list, the children of groups included. */
function flat(elements: readonly Element[]): Element[] {
  return elements.flatMap((e) => (e.type === 'group' ? [e, ...flat(e.children)] : [e]));
}

const textOf = (e: Element) =>
  e.type === 'text' || e.type === 'shape'
    ? (e.content?.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join('')).join('\n')
    : '';

async function roundTrip(deck: Deck) {
  const picture = await markedPicture(48, 32);
  for (const asset of Object.values(deck.assets))
    if (asset.kind === 'image') asset.mime = 'image/png';
  const out = await exportPptx(deck, {
    loadAsset: (asset: AssetMeta) =>
      Promise.resolve(
        asset.kind === 'image'
          ? new Blob([picture], { type: 'image/png' })
          : asset.kind === 'svg'
            ? new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"/>'], {
                type: 'image/svg+xml',
              })
            : // Bytes of its own for each file: the store keeps files by their content.
              new Blob([new TextEncoder().encode(asset.id)], { type: asset.mime }),
      ),
  });
  const { store } = memoryStore();
  return importPptx(out.bytes, { storeAsset: store });
}

describe('PowerPoint import of a file another tool wrote', () => {
  it('reads every slide into a deck the model takes, with the file’s title and theme', async () => {
    const { store } = memoryStore();
    const { deck, warnings } = await importPptx(foreign(), { storeAsset: store });
    expect(Deck.safeParse(deck).success).toBe(true);
    expect(deck.slides).toHaveLength(6);
    expect(deck.meta.title).toBe('Quarterly review 2026');
    expect(deck.theme.fonts.body.latin).toBe('Calibri');
    expect(deck.theme.colors.primary).toBe('#4f81bd');
    expect(warnings.filter((w) => w.code === 'broken-part')).toEqual([]);
  });

  it('places a placeholder where its layout puts it, in the look of the master’s styles', async () => {
    const { store } = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store });
    const [title, subtitle] = deck.slides[0]!.elements;
    expect(title?.role).toBe('title');
    expect(textOf(title!)).toBe('Quarterly review 2026');
    // Where python-pptx's title layout puts it: a third of the way down, in the middle of the
    // 4:3 slide the template was made for (the file's slide is wider, its layouts are not).
    expect(title!.frame.y).toBeGreaterThan(250);
    expect(title!.frame.x + title!.frame.w / 2).toBeCloseTo(720, -1);
    if (title!.type !== 'text') throw new Error('not text');
    expect(title.content.paragraphs[0]!.runs[0]!.marks?.size).toBe(88);
    expect(subtitle?.role).toBe('subtitle');
    if (subtitle!.type !== 'text') throw new Error('not text');
    expect(subtitle.content.paragraphs[0]!.dir).toBe('rtl');
    expect(deck.slides[0]!.notes?.paragraphs[0]!.runs[0]!.text).toBe(
      'Open with the headline numbers.',
    );
  });

  it('reads bullets, their levels, and a run’s own look', async () => {
    const { store } = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store });
    const body = deck.slides[1]!.elements.find((e) => e.role === 'body');
    if (body?.type !== 'text') throw new Error('no body');
    const [first, second, , fourth, hebrew] = body.content.paragraphs;
    expect(first!.list).toMatchObject({ kind: 'bullet', level: 0 });
    expect(second!.list).toMatchObject({ level: 1 });
    expect(fourth!.runs[0]!.marks).toMatchObject({ weight: 700, color: { value: '#c0392b' } });
    expect(hebrew!.dir).toBe('rtl');
    expect(hebrew!.align).toBe('start');
  });

  it('gives shapes the look of their style: the theme’s fill, outline and font colour', async () => {
    const { store } = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store });
    const elements = deck.slides[2]!.elements;
    const shapes = elements.filter((e) => e.type === 'shape');
    expect(
      shapes.map((s) =>
        s.type === 'shape' && s.geometry.kind === 'preset' ? s.geometry.preset : '',
      ),
    ).toEqual([
      'rect',
      'roundRect',
      'ellipse',
      'triangle',
      'chevron',
      'arrowRight',
      'star5',
      'hexagon',
    ]);
    const rect = shapes[0]!;
    if (rect.type !== 'shape') throw new Error('not a shape');
    // The default shape style: a gradient of the first accent, and white text.
    expect(rect.fill.kind).toBe('linear');
    expect(rect.content?.paragraphs[0]!.runs[0]!.marks?.color).toEqual({ token: 'bg' });
    const rounded = shapes[1]!;
    if (rounded.type !== 'shape') throw new Error('not a shape');
    expect(rounded.fill).toEqual({ kind: 'solid', color: { value: '#2e866b' } });
    expect(rounded.stroke).toMatchObject({ width: 8, color: { value: '#1b4d3e' } });
    expect(shapes[2]!.rotation).toBe(20);
    const line = elements.find((e) => e.type === 'line');
    if (line?.type !== 'line') throw new Error('no line');
    expect(line.endHead).toBe('triangle');
    // From the bottom left to the top right: the connector is flipped.
    expect(line.points[0]!.y).toBeGreaterThan(line.points[1]!.y);
  });

  it('reads a table in the look of its table style', async () => {
    const { store } = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store });
    const table = deck.slides[3]!.elements.find((e) => e.type === 'table');
    if (table?.type !== 'table') throw new Error('no table');
    expect(table.cells).toHaveLength(4);
    expect(table.cols).toHaveLength(3);
    const header = table.cells[0]![0]!;
    expect(header.fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
    expect(header.content.paragraphs[0]!.runs[0]!.marks).toMatchObject({
      weight: 700,
      color: { token: 'bg' },
    });
    expect(table.cells[3]![0]!.content.paragraphs[0]!.runs[0]!.text).toBe('ישראל');
    expect(table.style).toEqual({ headerRow: false, bandedRows: false, firstColumn: false });
  });

  it('reads charts with their series, categories and colours', async () => {
    const { store } = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store });
    const charts = deck.slides[4]!.elements.filter((e) => e.type === 'chart');
    expect(charts).toHaveLength(2);
    const [columns, pie] = charts;
    if (columns?.type !== 'chart' || pie?.type !== 'chart') throw new Error('no charts');
    expect(columns.chartType).toBe('column');
    expect(columns.data.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(columns.data.series.map((s) => s.name)).toEqual(['2025', '2026']);
    expect(columns.data.series[1]!.values).toEqual([3.8, 4.9, 5.6, 7.1]);
    expect(columns.options.legend).toEqual({ show: true, position: 'bottom' });
    expect(pie.chartType).toBe('pie');
    expect(pie.options.title).toBe('Platforms');
  });

  it('stores a picture once, with its cut, and keeps a group together', async () => {
    const store = memoryStore();
    const { deck } = await importPptx(foreign(), { storeAsset: store.store });
    const [image, group] = deck.slides[5]!.elements;
    if (image?.type !== 'image' || group?.type !== 'group') throw new Error('no picture and group');
    expect(deck.assets[image.assetId!]?.mime).toBe('image/png');
    expect(image.crop?.x).toBeCloseTo(0.1, 3);
    expect(image.crop?.w).toBeCloseTo(0.8, 3);
    expect(group.children).toHaveLength(2);
    expect(deck.slides[5]!.background).toEqual({
      fill: { kind: 'solid', color: { value: '#f4f1ea' } },
    });
  });

  it('says why a file that is no presentation cannot be read', async () => {
    const { store } = memoryStore();
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(importPptx(ole, { storeAsset: store })).rejects.toMatchObject({
      reason: 'protected',
    });
    await expect(
      importPptx(new TextEncoder().encode('hello'), { storeAsset: store }),
    ).rejects.toBeInstanceOf(PptxReadError);
    const zip = await writeZip([{ name: 'a.txt', data: new Uint8Array([1]) }]);
    await expect(importPptx(zip, { storeAsset: store })).rejects.toMatchObject({
      reason: 'not-pptx',
    });
  });
});

describe('a deck sent to PowerPoint and read back', () => {
  it('comes back with every slide, every text and the theme', async () => {
    const deck = referenceDeck();
    const { deck: back } = await roundTrip(referenceDeck());
    expect(Deck.safeParse(back).success).toBe(true);
    expect(back.slides).toHaveLength(deck.slides.length);
    expect(back.theme.colors).toMatchObject({
      bg: deck.theme.colors.bg,
      text: deck.theme.colors.text,
      primary: deck.theme.colors.primary,
      secondary: deck.theme.colors.secondary,
      accent: deck.theme.colors.accent,
    });
    expect(back.theme.fonts).toEqual(deck.theme.fonts);
    deck.slides.forEach((slide, i) => {
      const words = (elements: readonly Element[]) =>
        flat(elements).map(textOf).filter(Boolean).sort();
      const lost = words(slide.elements).filter(
        (t) => !words(back.slides[i]!.elements).includes(t),
      );
      expect(lost, `slide ${i + 1}`).toEqual([]);
    });
  });

  it('keeps the place and size of every object, and the colours that follow the theme', async () => {
    const deck = createDeck({ lang: 'en' });
    deck.slides.push(
      createSlide({
        elements: [
          createElement.shape({
            frame: { x: 100, y: 120, w: 400, h: 300 },
            rotation: 30,
            fill: { kind: 'solid', color: { token: 'secondary', alpha: 0.5 } },
            stroke: { color: { token: 'text' }, width: 4, dash: 'dashed' },
            content: richText('Inside', { dir: 'ltr', align: 'center' }),
          }),
          createElement.text({
            frame: { x: 700, y: 120, w: 800, h: 200 },
            vAlign: 'bottom',
            padding: { top: 10, right: 20, bottom: 10, left: 20 },
            content: richText('Plain text', { dir: 'ltr', align: 'end', styleRef: 'heading' }),
          }),
          createElement.line({
            frame: { x: 100, y: 600, w: 600, h: 200 },
            points: [
              { x: 0, y: 200 },
              { x: 600, y: 0 },
            ],
            stroke: { color: { value: '#e5484d' }, width: 6 },
            endHead: 'arrow',
          }),
        ],
      }),
    );
    const { deck: back } = await roundTrip(deck);
    const [shape, text, line] = back.slides[0]!.elements;
    if (shape?.type !== 'shape' || text?.type !== 'text' || line?.type !== 'line') {
      throw new Error(`came back as ${back.slides[0]!.elements.map((e) => e.type).join(', ')}`);
    }
    expect(shape.frame).toEqual({ x: 100, y: 120, w: 400, h: 300 });
    expect(shape.rotation).toBe(30);
    expect(shape.fill).toEqual({ kind: 'solid', color: { token: 'secondary', alpha: 0.5 } });
    expect(shape.stroke).toMatchObject({ color: { token: 'text' }, width: 4, dash: 'dashed' });
    expect(text.frame).toEqual({ x: 700, y: 120, w: 800, h: 200 });
    expect(text.vAlign).toBe('bottom');
    expect(text.padding).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(text.content.paragraphs[0]!.align).toBe('end');
    // The heading style's 44px at weight 600: PowerPoint has bold or not, and bold reads as 700.
    expect(text.content.paragraphs[0]!.runs[0]!.marks).toMatchObject({ size: 44, weight: 700 });
    expect(line.endHead).toBe('arrow');
    const abs = line.points.map((p) => ({ x: p.x + line.frame.x, y: p.y + line.frame.y }));
    expect(abs[0]).toEqual({ x: 100, y: 800 });
    expect(abs[1]).toEqual({ x: 700, y: 600 });
  });

  it('keeps a layout with its decorations and placeholders, and the slide on it', async () => {
    const deck = fixtureDecks.allElementsDeck();
    const { deck: back } = await roundTrip(fixtureDecks.allElementsDeck());
    const layout = back.layouts[0];
    expect(layout?.name).toBe(deck.layouts[0]!.name);
    expect(layout?.archetype).toBe('textImage');
    expect(layout?.placeholders.map((p) => p.role)).toEqual(['title', 'body', 'image']);
    expect(layout?.decorations).toHaveLength(deck.layouts[0]!.decorations.length);
    expect(back.slides[0]!.layoutId).toBe(layout?.id);
  });

  it('keeps transitions and the animations of each step', async () => {
    const deck = createDeck({ lang: 'en' });
    const text = createElement.text({
      frame: { x: 100, y: 100, w: 600, h: 100 },
      content: richText('Steps'),
    });
    const box = createElement.shape({ frame: { x: 100, y: 300, w: 300, h: 200 } });
    deck.slides.push(
      createSlide({
        elements: [text, box],
        transition: {
          type: 'push',
          direction: 'up',
          duration: 1000,
          easing: 'ease',
          advance: { onClick: true, afterMs: 4000 },
        },
        timeline: [
          {
            id: 'a1',
            elementId: text.id,
            trigger: 'onClick',
            category: 'entrance',
            preset: 'fade',
            duration: 500,
            delay: 0,
            easing: 'ease',
          },
          {
            id: 'a2',
            elementId: box.id,
            trigger: 'afterPrevious',
            category: 'entrance',
            preset: 'flyIn',
            direction: 'up',
            duration: 700,
            delay: 200,
            easing: 'ease',
          },
          {
            id: 'a3',
            elementId: box.id,
            trigger: 'onClick',
            category: 'exit',
            preset: 'fade',
            duration: 400,
            delay: 0,
            easing: 'ease',
          },
        ],
      }),
    );
    const { deck: back } = await roundTrip(deck);
    const slide = back.slides[0]!;
    expect(slide.transition).toMatchObject({
      type: 'push',
      direction: 'up',
      duration: 1000,
      advance: { onClick: true, afterMs: 4000 },
    });
    const [t, b] = slide.elements;
    expect(
      slide.timeline.map((s) => [
        s.elementId,
        s.trigger,
        s.category,
        s.preset,
        s.duration,
        s.delay,
      ]),
    ).toEqual([
      [t!.id, 'onClick', 'entrance', 'fade', 500, 0],
      [b!.id, 'afterPrevious', 'entrance', 'flyIn', 700, 200],
      [b!.id, 'onClick', 'exit', 'fade', 400, 0],
    ]);
    expect(slide.timeline[1]!.direction).toBe('up');
  });

  it('keeps a right-to-left deck right to left', async () => {
    const { deck: back } = await roundTrip(fixtureDecks.hebrewDeck());
    expect(back.meta.dir).toBe('rtl');
    expect(back.meta.lang).toBe('he');
  });

  it('keeps a video, its poster and its trim', async () => {
    const deck = fixtureDecks.allElementsDeck();
    const { deck: back } = await roundTrip(deck);
    const video = flat(back.slides[0]!.elements).find((e) => e.type === 'video');
    if (video?.type !== 'video') throw new Error('no video');
    expect(back.assets[video.assetId]?.kind).toBe('video');
    expect(video.poster && 'assetId' in video.poster).toBe(true);
    const audio = flat(back.slides[0]!.elements).find((e) => e.type === 'audio');
    expect(audio?.type).toBe('audio');
  });
});

describe('text read as PowerPoint lays it out', () => {
  /** A file of one slide with these shapes on it, on the master and the theme an export writes. */
  async function slideWith(shapes: string): Promise<Uint8Array> {
    const deck = createDeck({ lang: 'en' });
    deck.slides = [createSlide()];
    const out = await exportPptx(deck, { loadAsset: () => Promise.reject(new Error('none')) });
    const files = [];
    for (const entry of readZip(out.bytes).values()) {
      let data = await entry.read();
      if (entry.name === 'ppt/slides/slide1.xml') {
        const xml = new TextDecoder().decode(data).replace('</p:spTree>', `${shapes}</p:spTree>`);
        data = new TextEncoder().encode(xml);
      }
      files.push({ name: entry.name, data });
    }
    return writeZip(files);
  }

  const BOX =
    '<a:xfrm><a:off x="0" y="0"/><a:ext cx="6096000" cy="3429000"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  /** A text box of these paragraphs. */
  const textBox = (paragraphs: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="10" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${BOX}<a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>` +
    `${paragraphs}</p:txBody></p:sp>`;

  const paragraph = (pPr: string, rPr: string, text: string) =>
    `<a:p>${pPr}<a:r><a:rPr lang="he-IL" ${rPr}/><a:t>${text}</a:t></a:r></a:p>`;

  async function read(shapes: string) {
    const { store } = memoryStore();
    const { deck } = await importPptx(await slideWith(shapes), { storeAsset: store });
    expect(Deck.safeParse(deck).success).toBe(true);
    return { deck, element: deck.slides[0]!.elements[0]! };
  }

  it('keeps the margin of the paragraphs as padding, on the side they begin from', async () => {
    const { element } = await read(
      textBox(
        paragraph('<a:pPr marL="228600" rtl="1"/>', 'sz="2000"', 'אחת') +
          paragraph('<a:pPr marL="457200" rtl="1"/>', 'sz="2000"', 'שתיים') +
          paragraph('<a:pPr marL="228600" indent="228600" rtl="1"/>', 'sz="2000"', 'שלוש'),
      ),
    );
    if (element.type !== 'text') throw new Error('not text');
    // 228600 EMU are 36 px: the margin all three have is the box's, on the right of Hebrew.
    expect(element.padding).toMatchObject({ left: 14.4, right: 50.4 });
    // What one has beyond it begins its first line further in.
    expect(element.content.paragraphs.map((p) => p.indent)).toEqual([undefined, 36, 36]);
  });

  it('begins the text of a list item where PowerPoint does, past its markers', async () => {
    const { deck, element } = await read(
      textBox(
        paragraph(
          '<a:pPr marL="893763" indent="-712788"><a:buFont typeface="Arial"/><a:buAutoNum type="arabicPeriod"/></a:pPr>',
          'sz="4200"',
          'One',
        ),
      ),
    );
    if (element.type !== 'text') throw new Error('not text');
    expect(element.content.paragraphs[0]!.list).toMatchObject({ kind: 'number' });
    // The renderer begins an item's text a column of markers in, in the size of the style.
    const column = 1.25 * deck.theme.textStyles.body.size;
    expect(element.padding!.left).toBeCloseTo(14.4 + 893763 / 6350 - column, 1);
  });

  it('spaces lines by the size of their text, not by the size of their style', async () => {
    const spacing = '<a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>';
    const { deck, element } = await read(
      textBox(paragraph(spacing, 'sz="1000"', 'Small') + paragraph(spacing, 'sz="8000"', 'Big')),
    );
    if (element.type !== 'text') throw new Error('not text');
    const style = deck.theme.textStyles.body.size;
    expect(style).toBeGreaterThan(20);
    const [small, big] = element.content.paragraphs;
    // CSS lays a line out by the style's size as well; the line height is a multiple of it.
    expect(small!.lineHeight! * style).toBeCloseTo(1.2 * 20, 1);
    expect(big!.lineHeight).toBeCloseTo(1.2, 3);
  });

  it('leaves out the space before the first paragraph of a box, as PowerPoint does', async () => {
    const before = '<a:pPr><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:pPr>';
    const { element } = await read(
      textBox(paragraph(before, 'sz="2000"', 'One') + paragraph(before, 'sz="2000"', 'Two')),
    );
    if (element.type !== 'text') throw new Error('not text');
    expect(element.content.paragraphs.map((p) => p.spaceBefore)).toEqual([undefined, 20]);
  });

  it('draws an outline over the letters, a glow around them, and an unbroken underline', async () => {
    const look =
      'sz="4000" u="sng"><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>' +
      '<a:effectLst><a:glow rad="101600"><a:srgbClr val="808080"/></a:glow>' +
      '<a:outerShdw dist="38100" dir="2700000"><a:srgbClr val="000000"/></a:outerShdw></a:effectLst>' +
      '</a:rPr><a:t>Lined</a:t></a:r></a:p>';
    const { element } = await read(textBox(`<a:p><a:r><a:rPr lang="en-US" ${look}`));
    if (element.type !== 'text') throw new Error('not text');
    expect(element.css).toEqual({
      'text-decoration-skip-ink': 'none',
      '-webkit-text-stroke': '2px #ffffff',
      'text-shadow': '4.24px 4.24px 0px #000000, 0px 0px 16px #808080',
    });
  });

  it('turns a scaled gradient as the box stretches it, from corner to corner', async () => {
    const shape = (scaled: number) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="11" name="Ground"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>` +
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:gradFill><a:gsLst>` +
      `<a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>` +
      `</a:gsLst><a:lin ang="2700000" scaled="${scaled}"/></a:gradFill></p:spPr></p:sp>`;
    const angle = async (scaled: number) => {
      const { element } = await read(shape(scaled));
      if (element.type !== 'shape' || element.fill.kind !== 'linear')
        throw new Error('no gradient');
      return element.fill.angle;
    };
    expect(await angle(0)).toBe(135);
    // At 45° of the box as a square: across the 16:9 box, to its far corner.
    expect(await angle(1)).toBeCloseTo(90 + (Math.atan(1920 / 1080) * 180) / Math.PI, 1);
  });
});
