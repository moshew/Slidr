import type { Deck, Layout } from '@slidr/model';
import { CONTENT_TYPE, NS, PML_NS, REL } from '../opc';
import { SLIDE_EMU } from '../units';
import { el, esc } from '../xml';
import { writeZip } from '../zip';
import { ExportContext, type PptxExportOptions, type PptxExportResult } from './context';
import { layoutXml, masterXml, notesMasterXml, slideXml, type LayoutPart } from './slides';
import { cultureOf } from './text';
import { themeXml } from './theme';

export type { ElementPicture, PptxExportOptions, PptxExportResult } from './context';

/*
 * A deck as a PowerPoint file (ECMA-376, the transitional schemas PowerPoint writes): one master
 * on the deck's theme, a layout for each of the deck's layouts the slides use, and the slides,
 * every object an object of PowerPoint's where it has one. See docs/adr/ADR-108-powerpoint-files.md.
 */

const BLANK = '';

export async function exportPptx(
  deck: Deck,
  options: PptxExportOptions,
): Promise<PptxExportResult> {
  const ctx = new ExportContext(deck, options);
  const chosen = options.slideIds ? new Set(options.slideIds) : undefined;
  const slides = deck.slides.filter((s) => (chosen ? chosen.has(s.id) : !s.hidden));
  slides.forEach((slide, i) => ctx.slideParts.set(slide.id, `ppt/slides/slide${i + 1}.xml`));

  const themePath = 'ppt/theme/theme1.xml';
  const masterPath = 'ppt/slideMasters/slideMaster1.xml';
  ctx.pkg.xml(
    themePath,
    themeXml(deck.theme, deck.meta.lang, options.counterpart),
    CONTENT_TYPE.theme,
  );

  // A layout of the file for each layout of the deck its slides are on, and a blank one.
  const layoutsUsed: (Layout | undefined)[] = [];
  const keyOf = (layout: Layout | undefined) => layout?.id ?? BLANK;
  const byKey = new Map<string, Layout | undefined>();
  for (const slide of slides) {
    const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
    if (!byKey.has(keyOf(layout))) {
      byKey.set(keyOf(layout), layout);
      layoutsUsed.push(layout);
    }
  }
  if (!byKey.has(BLANK)) layoutsUsed.push(undefined);
  const layoutParts = new Map<string, LayoutPart>();
  for (const [i, layout] of layoutsUsed.entries()) {
    const part = await layoutXml(
      layout,
      `ppt/slideLayouts/slideLayout${i + 1}.xml`,
      masterPath,
      ctx,
    );
    layoutParts.set(keyOf(layout), part);
  }
  await masterXml(
    masterPath,
    themePath,
    [...layoutParts.values()].map((part) => part.path),
    ctx,
  );

  let notesMaster: string | undefined;
  const notesMasterPath = () => {
    if (!notesMaster) {
      notesMaster = 'ppt/notesMasters/notesMaster1.xml';
      const notesTheme = 'ppt/theme/theme2.xml';
      ctx.pkg.xml(
        notesTheme,
        themeXml(deck.theme, deck.meta.lang, options.counterpart),
        CONTENT_TYPE.theme,
      );
      notesMasterXml(notesMaster, notesTheme, ctx);
    }
    return notesMaster;
  };

  for (const [i, slide] of slides.entries()) {
    ctx.slide = i + 1;
    const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
    await slideXml(
      slide,
      ctx.slideParts.get(slide.id)!,
      layout,
      layoutParts.get(keyOf(layout))!,
      ctx,
      notesMasterPath,
    );
  }
  ctx.slide = 0;

  // The presentation, and what points at it.
  const presentation = 'ppt/presentation.xml';
  const rels = ctx.pkg.rels(presentation);
  const masterId = rels.add(REL.slideMaster, masterPath);
  const notesId = notesMaster ? rels.add(REL.notesMaster, notesMaster) : undefined;
  const slideIds = slides.map((s) => rels.add(REL.slide, ctx.slideParts.get(s.id)!));
  rels.add(REL.theme, themePath);
  rels.add(REL.presProps, 'ppt/presProps.xml');
  rels.add(REL.viewProps, 'ppt/viewProps.xml');
  rels.add(REL.tableStyles, 'ppt/tableStyles.xml');
  const rtl = deck.meta.dir === 'rtl';
  const lang = cultureOf(deck.meta.lang);
  const level = (n: number) =>
    el(
      `a:lvl${n}pPr`,
      { marL: 0, algn: rtl ? 'r' : 'l', defTabSz: 914400, rtl: rtl ? 1 : 0 },
      el(
        'a:defRPr',
        { sz: 1800, kern: 1200 },
        el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
        el('a:latin', { typeface: '+mn-lt' }),
        el('a:ea', { typeface: '+mn-ea' }),
        el('a:cs', { typeface: '+mn-cs' }),
      ),
    );
  ctx.pkg.xml(
    presentation,
    `<p:presentation ${PML_NS} saveSubsetFonts="1"${rtl ? ' rtl="1"' : ''}>` +
      el('p:sldMasterIdLst', {}, el('p:sldMasterId', { id: 2147483648, 'r:id': masterId })) +
      (notesId ? el('p:notesMasterIdLst', {}, el('p:notesMasterId', { 'r:id': notesId })) : '') +
      el('p:sldIdLst', {}, ...slideIds.map((id, i) => el('p:sldId', { id: 256 + i, 'r:id': id }))) +
      el('p:sldSz', { cx: SLIDE_EMU.cx, cy: SLIDE_EMU.cy }) +
      el('p:notesSz', { cx: 6858000, cy: 9144000 }) +
      el(
        'p:defaultTextStyle',
        {},
        el('a:defPPr', {}, el('a:defRPr', { lang })),
        ...Array.from({ length: 9 }, (_, i) => level(i + 1)),
      ) +
      '</p:presentation>',
    CONTENT_TYPE.presentation,
  );
  ctx.pkg.xml('ppt/presProps.xml', `<p:presentationPr ${PML_NS}/>`, CONTENT_TYPE.presProps);
  ctx.pkg.xml(
    'ppt/viewProps.xml',
    `<p:viewPr ${PML_NS}>` +
      el(
        'p:normalViewPr',
        {},
        el('p:restoredLeft', { sz: 15620 }),
        el('p:restoredTop', { sz: 94660 }),
      ) +
      el('p:gridSpacing', { cx: 76200, cy: 76200 }) +
      '</p:viewPr>',
    CONTENT_TYPE.viewProps,
  );
  ctx.pkg.xml(
    'ppt/tableStyles.xml',
    el('a:tblStyleLst', { 'xmlns:a': NS.a, def: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' }),
    CONTENT_TYPE.tableStyles,
  );

  // The file's own properties: its title, when it was made, and by what.
  const now = (options.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  ctx.pkg.xml(
    'docProps/core.xml',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(deck.meta.title)}</dc:title>` +
      `<dc:language>${esc(lang)}</dc:language>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${esc(deck.meta.createdAt.replace(/\.\d{3}Z$/, 'Z'))}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      '</cp:coreProperties>',
    CONTENT_TYPE.core,
  );
  ctx.pkg.xml(
    'docProps/app.xml',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>Slidr</Application>' +
      `<Slides>${slides.length}</Slides>` +
      `<Notes>${notesMaster ? slides.filter((s) => s.notes).length : 0}</Notes>` +
      '<PresentationFormat>Widescreen</PresentationFormat>' +
      '</Properties>',
    CONTENT_TYPE.app,
  );
  const root = ctx.pkg.rels('');
  root.add(REL.officeDocument, presentation);
  root.add(REL.core, 'docProps/core.xml');
  root.add(REL.app, 'docProps/app.xml');

  if (ctx.fonts.size) ctx.warnings.add('fonts', undefined, [...ctx.fonts].sort().join(', '));
  const bytes = await writeZip(ctx.pkg.files());
  return {
    bytes,
    warnings: ctx.warnings.list,
    slides: slides.length,
    media: { files: ctx.mediaFiles, bytes: ctx.mediaBytes },
    fonts: [...ctx.fonts].sort(),
  };
}
