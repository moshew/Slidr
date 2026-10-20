import {
  createDeck,
  elementSchemas,
  newId,
  type Archetype,
  type AssetMeta,
  type Background,
  type Deck,
  type Element,
  type Layout,
  type Placeholder,
  type PlaceholderRole,
  type RichText,
  type Slide,
  type Theme,
} from '@slidr/model';
import { cssHex } from '../color';
import { placementFor } from '../units';
import { Warnings, type ImportWarningCode } from '../warnings';
import {
  attr,
  boolAttr,
  child,
  children,
  descendants,
  intAttr,
  path,
  textOf,
  type XmlElement,
} from '../xml';
import { readColor, readFill, readTheme, type ColorContext, type ThemeInfo } from './drawing';
import { relKind, type PackageReader, type Relationship } from './package';
import {
  phType,
  placeholderOf,
  readTree,
  type Inherited,
  type PartContext,
  type Space,
} from './shapes';
import { readListStyle, type ListStyle } from './text';
import { readTiming, readTransition } from './timing';

/*
 * The presentation part, its masters, layouts and slides, read into a deck. The first master's
 * theme is the deck's theme; each layout a slide uses becomes a layout of the deck, with what its
 * master and it draw on every slide as its decorations; each slide's shapes become its elements.
 */

/** Stores a file of the presentation with the deck: a picture, a video, a sound. */
export type StoreAsset = (file: {
  name: string;
  mime: string;
  bytes: Uint8Array;
}) => Promise<AssetMeta | undefined>;

export interface PptxImportOptions {
  storeAsset: StoreAsset;
  /** The language of a deck whose text says none; the interface's by default. */
  lang?: string;
  now?: Date;
}

interface Master {
  path: string;
  xml: XmlElement;
  rels: Map<string, Relationship>;
  theme: ThemeInfo;
  map: Record<string, string>;
  title: ListStyle;
  body: ListStyle;
  other: ListStyle;
  placeholders: XmlElement[];
}

interface LayoutPart {
  path: string;
  xml: XmlElement;
  rels: Map<string, Relationship>;
  master: Master;
  placeholders: XmlElement[];
  layout?: Layout;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  wdp: 'image/vnd.ms-photo',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  wmv: 'video/x-ms-wmv',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  wma: 'audio/x-ms-wma',
  ogg: 'audio/ogg',
};

/** Pictures the webview can show; the rest (EMF, WMF, TIFF) have no picture in the deck. */
const SHOWN = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/webp',
]);

const ARCHETYPES: Record<string, Archetype> = {
  title: 'title',
  secHead: 'section',
  blank: 'blank',
  obj: 'text',
  tx: 'text',
  titleOnly: 'title',
  twoObj: 'comparison',
  twoTxTwoObj: 'comparison',
  picTx: 'textImage',
  objTx: 'textImage',
  tbl: 'table',
  chart: 'chart',
};

const ROLE_OF: Record<string, PlaceholderRole> = {
  title: 'title',
  ctrTitle: 'title',
  subTitle: 'subtitle',
  body: 'body',
  obj: 'body',
  pic: 'image',
  chart: 'chart',
  tbl: 'table',
  ftr: 'footer',
  sldNum: 'slideNumber',
};

const DEFAULT_MAP = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink',
};

function readMap(el: XmlElement | undefined): Record<string, string> {
  if (!el) return { ...DEFAULT_MAP };
  return { ...DEFAULT_MAP, ...el.attrs };
}

export class SlideImporter {
  readonly warnings = new Warnings<ImportWarningCode>();
  readonly fonts = new Set<string>();
  theme!: ThemeInfo;
  deckTheme!: Theme;
  tableStyles: XmlElement[] = [];
  /** Slide pixels per EMU. */
  pxPerEmu = 1 / 6350;
  rtl = false;
  readonly #space: Space = { sx: 1 / 6350, sy: 1 / 6350, ox: 0, oy: 0 };
  readonly #masters = new Map<string, Promise<Master | undefined>>();
  readonly #layouts = new Map<string, Promise<LayoutPart | undefined>>();
  readonly #assets = new Map<string, Promise<AssetMeta | undefined>>();
  readonly #stored: Record<string, AssetMeta> = {};
  /** The id each slide part will have in the deck. */
  readonly #slideIds = new Map<string, string>();
  #firstMaster: Master | undefined;
  #defaultText: ListStyle = [];

  constructor(
    readonly pkg: PackageReader,
    readonly options: PptxImportOptions,
  ) {}

  warn(code: ImportWarningCode, slide?: number, detail?: string): void {
    this.warnings.add(code, slide, detail);
  }

  /* ---------------------------------------------------------------- files */

  /** Stores a part of the package as an asset, once however often it is used. */
  #store(path: string): Promise<AssetMeta | undefined> {
    let stored = this.#assets.get(path);
    if (!stored) {
      stored = (async () => {
        const bytes = await this.pkg.bytes(path);
        if (!bytes) {
          this.warn('broken-part', undefined, path);
          return undefined;
        }
        const name = path.split('/').at(-1) ?? 'file';
        const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
        const mime = MIME[extension] ?? 'application/octet-stream';
        const asset = await this.options.storeAsset({ name, mime, bytes }).catch(() => undefined);
        if (asset) this.#stored[asset.id] = asset;
        return asset;
      })();
      this.#assets.set(path, stored);
    }
    return stored;
  }

  /** Stores a video or a sound; its asset id. */
  async storeMedia(path: string, kind: 'video' | 'audio'): Promise<string | undefined> {
    void kind;
    return (await this.#store(path))?.id;
  }

  /** Stores the pictures a part's shapes show, by the relationship ids that name them. */
  async pictures(
    partPath: string,
    tree: XmlElement | undefined,
    rels: Map<string, Relationship>,
  ): Promise<Map<string, string>> {
    void partPath;
    const out = new Map<string, string>();
    if (!tree) return out;
    const ids = new Set<string>();
    for (const blip of [...descendants(tree, 'a:blip'), ...descendants(tree, 'asvg:svgBlip')]) {
      const id = attr(blip, 'r:embed') ?? attr(blip, 'r:link');
      if (id) ids.add(id);
    }
    // A picture with an SVG of its own shows the SVG: the vector drawing PowerPoint draws.
    const svgOf = new Map<string, string>();
    for (const blip of descendants(tree, 'a:blip')) {
      const svg = descendants(blip, 'asvg:svgBlip')[0];
      const embed = attr(blip, 'r:embed');
      const svgId = attr(svg, 'r:embed');
      if (embed && svgId) svgOf.set(embed, svgId);
    }
    for (const id of ids) {
      const rel = rels.get(id);
      if (!rel) continue;
      if (rel.external) {
        this.warn('linked-media', undefined, rel.target);
        continue;
      }
      const preferred = svgOf.get(id);
      const target = preferred ? (rels.get(preferred)?.target ?? rel.target) : rel.target;
      const extension = target.split('.').at(-1)?.toLowerCase() ?? '';
      const mime = MIME[extension] ?? '';
      if (mime.startsWith('image/') && !SHOWN.has(mime)) {
        this.warn('picture-format', undefined, extension.toUpperCase());
        continue;
      }
      const asset = await this.#store(target);
      if (asset) out.set(id, asset.id);
    }
    return out;
  }

  /** Where a link goes: an address, or `#slide=<id>` for another slide of the deck. */
  linkTarget(
    rels: Map<string, Relationship>,
    rId: string,
    action: string | undefined,
  ): string | undefined {
    if (action?.startsWith('ppaction://hlinksldjump')) {
      const rel = rels.get(rId);
      const id = rel ? this.#slideIds.get(rel.target) : undefined;
      return id ? `#slide=${id}` : undefined;
    }
    if (action && action.startsWith('ppaction://')) return undefined;
    const rel = rels.get(rId);
    if (!rel?.external) return undefined;
    const target = rel.target.trim();
    return /^(?:https?:|mailto:|tel:)/i.test(target) ? target : undefined;
  }

  /** The shapes of a SmartArt graphic, from the drawing part its data names. */
  async diagramDrawing(
    partPath: string,
    rels: Map<string, Relationship>,
    dataId: string | undefined,
  ): Promise<{ path: string; tree: XmlElement; rels: Map<string, Relationship> } | undefined> {
    void partPath;
    const data = dataId ? rels.get(dataId) : undefined;
    let drawingPath: string | undefined;
    if (data) {
      const xml = await this.pkg.xml(data.target);
      const ext = descendants(xml, 'dsp:dataModelExt')[0];
      const relId = attr(ext, 'relId');
      if (relId) drawingPath = rels.get(relId)?.target;
    }
    drawingPath ??= [...rels.values()].find((r) => relKind(r.type) === 'diagramDrawing')?.target;
    if (!drawingPath) return undefined;
    const drawing = await this.pkg.xml(drawingPath);
    const tree = child(drawing, 'dsp:spTree');
    if (!tree) return undefined;
    // The drawing's shapes are a slide's shapes under another prefix.
    const rename = (el: XmlElement): XmlElement => ({
      name: el.name.replace(/^dsp:/, 'p:'),
      attrs: el.attrs,
      children: el.children.map((c) => (typeof c === 'string' ? c : rename(c))),
    });
    return { path: drawingPath, tree: rename(tree), rels: await this.pkg.rels(drawingPath) };
  }

  /* ---------------------------------------------------------------- masters and layouts */

  #master(path: string): Promise<Master | undefined> {
    let found = this.#masters.get(path);
    if (!found) {
      found = (async () => {
        const xml = await this.pkg.xml(path);
        if (!xml) return undefined;
        const rels = await this.pkg.rels(path);
        const themeRel = [...rels.values()].find((r) => relKind(r.type) === 'theme');
        const theme = readTheme(themeRel ? await this.pkg.xml(themeRel.target) : undefined);
        const styles = child(xml, 'p:txStyles');
        return {
          path,
          xml,
          rels,
          theme,
          map: readMap(child(xml, 'p:clrMap')),
          title: readListStyle(child(styles, 'p:titleStyle')),
          body: readListStyle(child(styles, 'p:bodyStyle')),
          other: readListStyle(child(styles, 'p:otherStyle')),
          placeholders: shapesWithPlaceholders(path_(xml)),
        };
      })();
      this.#masters.set(path, found);
    }
    return found;
  }

  #layoutPart(path: string): Promise<LayoutPart | undefined> {
    let found = this.#layouts.get(path);
    if (!found) {
      found = (async () => {
        const xml = await this.pkg.xml(path);
        if (!xml) return undefined;
        const rels = await this.pkg.rels(path);
        const masterRel = [...rels.values()].find((r) => relKind(r.type) === 'slideMaster');
        const master = masterRel ? await this.#master(masterRel.target) : undefined;
        if (!master) return undefined;
        return { path, xml, rels, master, placeholders: shapesWithPlaceholders(path_(xml)) };
      })();
      this.#layouts.set(path, found);
    }
    return found;
  }

  /** The colours of a part: its master's theme, under the colour map in force there. */
  #colors(master: Master, ...overrides: (XmlElement | undefined)[]): ColorContext {
    let map = master.map;
    for (const o of overrides) {
      const mapping = child(child(o, 'p:clrMapOvr'), 'a:overrideClrMapping');
      if (mapping) map = readMap(mapping);
    }
    const first = this.#firstMaster;
    const same =
      master === first ||
      (first !== undefined &&
        JSON.stringify(master.theme.colors) === JSON.stringify(first.theme.colors));
    const tokens = same && first !== undefined && JSON.stringify(map) === JSON.stringify(first.map);
    return { theme: master.theme, map, tokens };
  }

  /** What a placeholder of a slide (or of a layout) inherits from the layout and the master. */
  #inherit(ph: XmlElement, layout: LayoutPart | undefined, master: Master): Inherited {
    const type = phType(ph);
    const idx = attr(ph, 'idx');
    const titleLike = type === 'title' || type === 'ctrTitle';
    const matchLayout = () => {
      if (!layout) return undefined;
      const candidates = layout.placeholders;
      if (titleLike) {
        return candidates.find((sp) => ['title', 'ctrTitle'].includes(phType(placeholderOf(sp))));
      }
      return (
        (idx !== undefined
          ? candidates.find((sp) => attr(placeholderOf(sp), 'idx') === idx)
          : undefined) ??
        candidates.find((sp) => phType(placeholderOf(sp)) === type) ??
        (type === 'obj' || type === 'body'
          ? candidates.find((sp) => ['obj', 'body'].includes(phType(placeholderOf(sp))))
          : undefined)
      );
    };
    const fromLayout = matchLayout();
    const masterType = titleLike
      ? 'title'
      : ['dt', 'ftr', 'sldNum', 'hdr'].includes(type)
        ? type
        : 'body';
    const fromMaster = master.placeholders.find((sp) => {
      const t = phType(placeholderOf(sp));
      return masterType === 'title' ? t === 'title' || t === 'ctrTitle' : t === masterType;
    });
    const styles = titleLike ? master.title : masterType === 'body' ? master.body : master.other;
    const parts = [fromMaster, fromLayout].filter((sp): sp is XmlElement => sp !== undefined);
    return {
      spPr: parts.map((sp) => child(sp, 'p:spPr')).filter((s): s is XmlElement => s !== undefined),
      bodies: parts
        .map((sp) => path(sp, 'p:txBody', 'a:bodyPr'))
        .filter((s): s is XmlElement => s !== undefined),
      lists: [styles, ...parts.map((sp) => readListStyle(path(sp, 'p:txBody', 'a:lstStyle')))],
      styles: parts
        .map((sp) => child(sp, 'p:style'))
        .filter((s): s is XmlElement => s !== undefined),
    };
  }

  /** A background of DrawingML (`p:bg`), as the model's. */
  async #background(
    cSld: XmlElement | undefined,
    colors: ColorContext,
    rels: Map<string, Relationship>,
    partPath: string,
  ): Promise<Background | undefined> {
    const bg = child(cSld, 'p:bg');
    if (!bg) return undefined;
    const pictures = await this.pictures(partPath, bg, rels);
    const picture = (b: { rId: string }) => pictures.get(b.rId);
    const bgPr = child(bg, 'p:bgPr');
    if (bgPr) {
      const fillEl = children(bgPr).find((c) => c.name.endsWith('Fill'));
      const fill = readFill(fillEl, colors, picture);
      if (fill?.kind === 'image')
        return { fill: { ...fill, fit: fill.fit === 'tile' ? 'tile' : 'cover' } };
      return fill ? { fill } : undefined;
    }
    const ref = child(bg, 'p:bgRef');
    if (ref) {
      const idx = intAttr(ref, 'idx') ?? 0;
      const list = idx >= 1000 ? this.theme.bgFills : this.theme.fills;
      const styled = list[idx >= 1000 ? idx - 1001 : idx - 1];
      const color = children(ref)[0];
      const ph = color ? readColor(color, colors) : undefined;
      const fill = readFill(styled, ph ? { ...colors, ph } : colors, picture);
      if (fill) return { fill };
      if (ph) return { fill: { kind: 'solid', color: ph.color } };
    }
    return undefined;
  }

  /** The layout of the deck for a layout part, read once. */
  async #deckLayout(part: LayoutPart): Promise<Layout> {
    if (part.layout) return part.layout;
    const { master } = part;
    const colors = this.#colors(master, part.xml);
    const showMaster = boolAttr(part.xml, 'showMasterSp') !== false;
    const decorations: Element[] = [];
    const read = async (
      xml: XmlElement,
      rels: Map<string, Relationship>,
      partPath: string,
      layout: LayoutPart | undefined,
    ) => {
      const tree = path(xml, 'p:cSld', 'p:spTree');
      if (!tree) return [];
      const ctx: PartContext = {
        importer: this,
        path: partPath,
        rels,
        colors,
        pictures: await this.pictures(partPath, tree, rels),
        inherit: (ph) => this.#inherit(ph, layout, master),
        otherStyles: [this.#defaultText, master.other],
        template: true,
      };
      return readTree(tree, ctx, this.#space, undefined);
    };
    if (showMaster)
      decorations.push(...(await read(master.xml, master.rels, master.path, undefined)));
    decorations.push(...(await read(part.xml, part.rels, part.path, part)));
    // The layout's own background; the first master's is the theme's, another master's its own.
    const background =
      (await this.#background(child(part.xml, 'p:cSld'), colors, part.rels, part.path)) ??
      (master === this.#firstMaster
        ? undefined
        : await this.#background(
            child(master.xml, 'p:cSld'),
            this.#colors(master),
            master.rels,
            master.path,
          ));
    const placeholders: Placeholder[] = [];
    for (const sp of part.placeholders) {
      const ph = placeholderOf(sp)!;
      const role = ROLE_OF[phType(ph)];
      if (!role) continue;
      const inherited = this.#inherit(ph, undefined, master);
      const xfrm =
        child(child(sp, 'p:spPr'), 'a:xfrm') ??
        [...inherited.spPr]
          .reverse()
          .map((s) => child(s, 'a:xfrm'))
          .find(Boolean);
      const off = child(xfrm, 'a:off');
      const ext = child(xfrm, 'a:ext');
      if (!off || !ext) continue;
      const s = this.#space;
      placeholders.push({
        id: newId('p'),
        role,
        frame: {
          x: round((intAttr(off, 'x') ?? 0) * s.sx + s.ox),
          y: round((intAttr(off, 'y') ?? 0) * s.sy + s.oy),
          w: round((intAttr(ext, 'cx') ?? 0) * s.sx),
          h: round((intAttr(ext, 'cy') ?? 0) * s.sy),
        },
        ...(role === 'title'
          ? { styleRef: 'title' as const }
          : role === 'body' || role === 'subtitle'
            ? { styleRef: 'body' as const }
            : {}),
      });
    }
    const name = attr(child(part.xml, 'p:cSld'), 'name')?.trim() || 'Layout';
    part.layout = {
      id: newId('l'),
      name: name.slice(0, 120),
      archetype: ARCHETYPES[attr(part.xml, 'type') ?? ''] ?? 'text',
      ...(background ? { background } : {}),
      placeholders,
      decorations: valid(decorations),
    };
    return part.layout;
  }

  /* ---------------------------------------------------------------- the deck */

  async run(): Promise<Deck> {
    const root = await this.pkg.rels('');
    const office = [...root.values()].find((r) => relKind(r.type) === 'officeDocument');
    const presentationPath = office?.target ?? 'ppt/presentation.xml';
    const presentation = await this.pkg.xml(presentationPath);
    if (!presentation) throw new Error('The file has no presentation in it.');
    const prels = await this.pkg.rels(presentationPath);
    const size = child(presentation, 'p:sldSz');
    const placement = placementFor(intAttr(size, 'cx') ?? 12192000, intAttr(size, 'cy') ?? 6858000);
    this.pxPerEmu = placement.scale;
    Object.assign(this.#space, {
      sx: placement.scale,
      sy: placement.scale,
      ox: placement.dx,
      oy: placement.dy,
    });
    this.#defaultText = readListStyle(child(presentation, 'p:defaultTextStyle'));
    const tableStylesRel = [...prels.values()].find((r) => relKind(r.type) === 'tableStyles');
    if (tableStylesRel)
      this.tableStyles = children(await this.pkg.xml(tableStylesRel.target), 'a:tblStyle');

    const slideParts: string[] = [];
    for (const id of children(child(presentation, 'p:sldIdLst'), 'p:sldId')) {
      const rel = prels.get(attr(id, 'r:id') ?? '');
      if (rel && !rel.external) slideParts.push(rel.target);
    }
    for (const part of slideParts) this.#slideIds.set(part, newId('s'));

    const masterRel = [...prels.values()].find((r) => relKind(r.type) === 'slideMaster');
    this.#firstMaster = masterRel ? await this.#master(masterRel.target) : undefined;
    this.theme = this.#firstMaster?.theme ?? readTheme(undefined);
    this.deckTheme = deckThemeOf(this.theme, this.#firstMaster);
    const first = this.#firstMaster;
    const ground = first
      ? await this.#background(
          child(first.xml, 'p:cSld'),
          this.#colors(first),
          first.rels,
          first.path,
        )
      : undefined;
    if (ground) this.deckTheme.background = ground;

    // Which way the deck reads: the way most of its paragraphs do.
    let rtlParagraphs = 0;
    let paragraphs = 0;
    let hebrew = 0;
    let arabic = 0;
    for (const part of slideParts) {
      const xml = await this.pkg.xml(part);
      for (const p of descendants(xml, 'a:p')) {
        const text = descendants(p, 'a:t').map(textOf).join('');
        if (!text.trim()) continue;
        paragraphs++;
        if (attr(child(p, 'a:pPr'), 'rtl') === '1') rtlParagraphs++;
        if (/[\u0590-\u05ff]/.test(text)) hebrew++;
        if (/[\u0600-\u06ff]/.test(text)) arabic++;
      }
    }
    this.rtl =
      paragraphs > 0 && (rtlParagraphs * 2 > paragraphs || (hebrew + arabic) * 2 > paragraphs);

    const deckLayouts: Layout[] = [];
    const slides: Slide[] = [];
    for (const [i, part] of slideParts.entries()) {
      const n = i + 1;
      try {
        const slide = await this.#slide(part, n, deckLayouts);
        if (slide) slides.push(slide);
      } catch (error) {
        console.error(`Slide ${n} could not be read`, error);
        this.warn('broken-part', n, part);
      }
    }

    const core = await this.pkg.xml('docProps/core.xml');
    const title = textOf(child(core, 'dc:title')).trim() || firstTitle(slides);
    const lang = this.rtl
      ? arabic > hebrew
        ? 'ar'
        : 'he'
      : this.options.lang && !/^(he|ar|fa|ur)/.test(this.options.lang)
        ? this.options.lang
        : 'en';
    const deck = createDeck({
      title,
      lang,
      dir: this.rtl ? 'rtl' : 'ltr',
      theme: this.deckTheme,
      layouts: deckLayouts,
      slides: slides.length ? slides : [{ id: newId('s'), elements: [], timeline: [] }],
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    deck.assets = { ...this.#stored };
    for (const family of collectFonts(deck)) this.fonts.add(family);
    return deck;
  }

  async #slide(part: string, n: number, deckLayouts: Layout[]): Promise<Slide | undefined> {
    const xml = await this.pkg.xml(part);
    if (!xml) {
      this.warn('broken-part', n, part);
      return undefined;
    }
    const rels = await this.pkg.rels(part);
    const layoutRel = [...rels.values()].find((r) => relKind(r.type) === 'slideLayout');
    const layoutPart = layoutRel ? await this.#layoutPart(layoutRel.target) : undefined;
    const master = layoutPart?.master ?? this.#firstMaster;
    if (!master) throw new Error('The slide has no master.');
    const colors = this.#colors(master, layoutPart?.xml, xml);
    const tree = path(xml, 'p:cSld', 'p:spTree');
    const shapeIds = new Map<string, string>();
    const ctx: PartContext = {
      shapeIds,
      importer: this,
      path: part,
      rels,
      colors,
      pictures: await this.pictures(part, tree, rels),
      inherit: (ph) => this.#inherit(ph, layoutPart, master),
      otherStyles: [this.#defaultText, master.other],
      template: false,
      slide: n,
    };
    const elements = tree ? await readTree(tree, ctx, this.#space, undefined) : [];
    const showMaster = boolAttr(xml, 'showMasterSp') !== false;
    let layout: Layout | undefined;
    if (layoutPart && showMaster) {
      layout = await this.#deckLayout(layoutPart);
      // A layout that draws nothing and offers no more than a title is no layout to the deck:
      // "Blank", "Title Only", and what a slide of no layout went out of Slidr on.
      const bare =
        layout.decorations.length === 0 &&
        !layout.background &&
        layout.placeholders.every((p) => p.role === 'title');
      if (bare) layout = undefined;
      else if (!deckLayouts.includes(layout)) deckLayouts.push(layout);
    }
    let background = await this.#background(child(xml, 'p:cSld'), colors, rels, part);
    if (!background && !layout && layoutPart) {
      background = await this.#background(
        child(layoutPart.xml, 'p:cSld'),
        this.#colors(master, layoutPart.xml),
        layoutPart.rels,
        layoutPart.path,
      );
      // The first master's background is the theme's.
      if (!background && master !== this.#firstMaster) {
        background = await this.#background(
          child(master.xml, 'p:cSld'),
          this.#colors(master),
          master.rels,
          master.path,
        );
      }
    }
    const kept = valid(elements, n, this);
    const ids = new Set(kept.map((e) => e.id));
    const timeline = readTiming(
      child(xml, 'p:timing'),
      (spid) => shapeIds.get(spid),
      this.rtl,
      (detail) => this.warn('animation-approximated', n, detail),
    ).filter((step) => ids.has(step.elementId));
    const transitionEl =
      child(xml, 'p:transition') ??
      children(xml, 'mc:AlternateContent').find((ac) => descendants(ac, 'p:transition').length > 0);
    const transition = readTransition(transitionEl, this.rtl, (detail) =>
      this.warn('transition-approximated', n, detail),
    );
    const notes = await this.#notes(rels);
    const name = attr(child(xml, 'p:cSld'), 'name')?.trim();
    return {
      id: this.#slideIds.get(part) ?? newId('s'),
      ...(name ? { name: name.slice(0, 120) } : {}),
      ...(layout ? { layoutId: layout.id } : {}),
      ...(background ? { background } : {}),
      elements: kept,
      ...(notes ? { notes } : {}),
      ...(transition ? { transition } : {}),
      timeline,
      ...(attr(xml, 'show') === '0' ? { hidden: true } : {}),
    };
  }

  async #notes(rels: Map<string, Relationship>): Promise<RichText | undefined> {
    const rel = [...rels.values()].find((r) => relKind(r.type) === 'notesSlide');
    if (!rel) return undefined;
    const xml = await this.pkg.xml(rel.target);
    const body = descendants(xml, 'p:sp').find((sp) => {
      const ph = placeholderOf(sp);
      return ph && phType(ph) === 'body';
    });
    if (!body) return undefined;
    const paragraphs = children(child(body, 'p:txBody'), 'a:p')
      .map((p) => descendants(p, 'a:t').map(textOf).join(''))
      .filter((text, i, all) => text.trim() !== '' || (i > 0 && i < all.length - 1));
    if (!paragraphs.some((t) => t.trim())) return undefined;
    return {
      paragraphs: paragraphs.map((text) => ({
        dir: 'auto' as const,
        align: 'start' as const,
        runs: [{ text }],
      })),
    };
  }
}

const round = (v: number) => Math.round(v * 100) / 100;

const path_ = (xml: XmlElement) => path(xml, 'p:cSld', 'p:spTree');

/** The placeholder shapes of a tree, groups included. */
function shapesWithPlaceholders(tree: XmlElement | undefined): XmlElement[] {
  const out: XmlElement[] = [];
  for (const shape of children(tree)) {
    if (placeholderOf(shape)) out.push(shape);
    if (shape.name === 'p:grpSp') out.push(...shapesWithPlaceholders(shape));
  }
  return out;
}

/** Keeps the elements the model takes, with a warning for any it does not. */
function valid(elements: Element[], slide?: number, importer?: SlideImporter): Element[] {
  return elements.filter((e) => {
    const ok = elementSchemas[e.type].safeParse(e).success;
    if (!ok) {
      console.warn('An imported object does not fit the model', e);
      importer?.warn('unsupported-object', slide, e.type);
    }
    return ok;
  });
}

function firstTitle(slides: Slide[]): string {
  for (const slide of slides) {
    for (const e of slide.elements) {
      if (e.role === 'title' && e.type === 'text') {
        const text = e.content.paragraphs
          .map((p) => p.runs.map((r) => r.text).join(''))
          .join(' ')
          .trim();
        if (text) return text.slice(0, 200);
      }
    }
  }
  return '';
}

/** The families the text of a deck is set in, its theme's included. */
function collectFonts(deck: Deck): Set<string> {
  const out = new Set<string>([deck.theme.fonts.body.latin, deck.theme.fonts.heading.latin]);
  const visit = (elements: readonly Element[]) => {
    for (const e of elements) {
      if (e.type === 'group') visit(e.children);
      const texts =
        e.type === 'text' || e.type === 'shape'
          ? [e.content]
          : e.type === 'table'
            ? e.cells.flat().map((c) => c.content)
            : [];
      for (const t of texts)
        for (const p of t?.paragraphs ?? [])
          for (const r of p.runs) if (r.marks?.font) out.add(r.marks.font);
    }
  };
  for (const slide of deck.slides) visit(slide.elements);
  for (const layout of deck.layouts) visit(layout.decorations);
  return out;
}

/** The deck's theme from the file's: its colours, its fonts, and text styles of its sizes. */
function deckThemeOf(
  theme: ThemeInfo,
  master: { map: Record<string, string>; title: ListStyle; body: ListStyle } | undefined,
): Theme {
  const slot = (name: string) => theme.colors[master?.map[name] ?? name] ?? theme.colors[name]!;
  const hex = (name: string) => cssHex(slot(name));
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((a) =>
    cssHex(theme.colors[a]!),
  );
  const pair = (set: ThemeInfo['major']) => ({
    latin: set.latin || 'Calibri',
    he: set.scripts.Hebr || set.cs || set.latin || 'Arial',
  });
  const size = (list: ListStyle | undefined, fallback: number) => {
    const sz = list?.[0]?.run.sz;
    return Math.round(((sz ?? fallback) / 100) * 2 * 100) / 100;
  };
  const title = size(master?.title, 4400);
  const body = size(master?.body, 2800);
  const titleBold = master?.title[0]?.run.b ? 700 : 400;
  return {
    id: 'imported',
    name: theme.name || 'Imported',
    colors: {
      bg: hex('bg1'),
      surface: hex('bg2'),
      text: hex('tx1'),
      muted: hex('tx2'),
      primary: accents[0]!,
      secondary: accents[1]!,
      accent: accents[2]!,
      chart: accents,
    },
    fonts: { heading: pair(theme.major), body: pair(theme.minor) },
    textStyles: {
      display: {
        font: 'heading',
        size: Math.round(title * 1.4),
        weight: titleBold,
        lineHeight: 1.1,
        color: { token: 'text' },
      },
      title: {
        font: 'heading',
        size: title,
        weight: titleBold,
        lineHeight: 1.1,
        color: { token: 'text' },
      },
      heading: {
        font: 'heading',
        size: Math.round(title * 0.72),
        weight: titleBold,
        lineHeight: 1.2,
        color: { token: 'text' },
      },
      body: { font: 'body', size: body, weight: 400, lineHeight: 1.2, color: { token: 'text' } },
      caption: {
        font: 'body',
        size: Math.round(body * 0.72),
        weight: 400,
        lineHeight: 1.2,
        color: { token: 'muted' },
      },
    },
    radius: 8,
    shadow: { x: 0, y: 8, blur: 24, color: { value: '#000000', alpha: 0.18 } },
    background: { fill: { kind: 'solid', color: { token: 'bg' } } },
    backgroundVariants: [],
  };
}
