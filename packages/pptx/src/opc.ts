import { XML_HEADER, el, esc } from './xml';

/*
 * The Open Packaging Conventions of an Office file: its parts, what each one is (the content
 * types), and the relationships between them. Paths are without a leading slash:
 * `ppt/slides/slide1.xml`.
 */

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
} as const;

const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Relationship types, by what they point at. */
export const REL = {
  officeDocument: `${OFFICE}/officeDocument`,
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: `${OFFICE}/extended-properties`,
  slideMaster: `${OFFICE}/slideMaster`,
  slideLayout: `${OFFICE}/slideLayout`,
  slide: `${OFFICE}/slide`,
  theme: `${OFFICE}/theme`,
  presProps: `${OFFICE}/presProps`,
  viewProps: `${OFFICE}/viewProps`,
  tableStyles: `${OFFICE}/tableStyles`,
  notesMaster: `${OFFICE}/notesMaster`,
  notesSlide: `${OFFICE}/notesSlide`,
  image: `${OFFICE}/image`,
  video: `${OFFICE}/video`,
  audio: `${OFFICE}/audio`,
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',
  chart: `${OFFICE}/chart`,
  package: `${OFFICE}/package`,
  hyperlink: `${OFFICE}/hyperlink`,
  diagramDrawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
} as const;

const PML = 'application/vnd.openxmlformats-officedocument.presentationml';

export const CONTENT_TYPE = {
  presentation: `${PML}.presentation.main+xml`,
  slide: `${PML}.slide+xml`,
  slideLayout: `${PML}.slideLayout+xml`,
  slideMaster: `${PML}.slideMaster+xml`,
  notesMaster: `${PML}.notesMaster+xml`,
  notesSlide: `${PML}.notesSlide+xml`,
  presProps: `${PML}.presProps+xml`,
  viewProps: `${PML}.viewProps+xml`,
  tableStyles: `${PML}.tableStyles+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/** The folder of a part, with its slash: `ppt/slides/`. */
export function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at + 1);
}

/** The part a relationship's target names, from the part it belongs to. */
export function resolveTarget(source: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (folderOf(source) + target).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

/** A target relative to the part that points at it. */
export function relativeTarget(source: string, target: string): string {
  const from = folderOf(source).split('/').filter(Boolean);
  const to = target.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...Array<string>(from.length - common).fill('..'), ...to.slice(common)].join('/');
}

/** The relationships part of a part: `ppt/slides/_rels/slide1.xml.rels`. */
export function relsPathOf(path: string): string {
  const name = path.slice(folderOf(path).length);
  return `${folderOf(path)}_rels/${name}.rels`;
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

/** The relationships of one part, as they are added. */
export class PartRels {
  readonly #items: Relationship[] = [];
  constructor(readonly source: string) {}

  /** The id of a relationship to `target` (a part path, or a URL when external). */
  add(type: string, target: string, external = false): string {
    const found = this.#items.find(
      (r) => r.type === type && r.target === target && r.external === external,
    );
    if (found) return found.id;
    const id = `rId${this.#items.length + 1}`;
    this.#items.push({ id, type, target, external });
    return id;
  }

  get empty(): boolean {
    return this.#items.length === 0;
  }

  xml(): string {
    return (
      XML_HEADER +
      el(
        'Relationships',
        { xmlns: NS.rels },
        ...this.#items.map((r) =>
          el('Relationship', {
            Id: r.id,
            Type: r.type,
            Target: r.external ? r.target : relativeTarget(this.source, r.target),
            TargetMode: r.external ? 'External' : undefined,
          }),
        ),
      )
    );
  }
}

const DEFAULT_TYPES: Record<string, string> = {
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  xml: 'application/xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  xlsx: CONTENT_TYPE.xlsx,
};

interface Part {
  data: Uint8Array;
  contentType?: string;
  compress: boolean;
}

/** The parts of a file being written, and their relationships. */
export class PackageWriter {
  readonly #parts = new Map<string, Part>();
  readonly #rels = new Map<string, PartRels>();
  readonly #defaults = new Map<string, string>();
  readonly #encoder = new TextEncoder();

  /** The relationships of a part; `''` for those of the package. */
  rels(source: string): PartRels {
    let rels = this.#rels.get(source);
    if (!rels) {
      rels = new PartRels(source);
      this.#rels.set(source, rels);
    }
    return rels;
  }

  has(path: string): boolean {
    return this.#parts.has(path);
  }

  /** An XML part. Its content type is named unless it is plain `application/xml`. */
  xml(path: string, xml: string, contentType?: string): void {
    this.#parts.set(path, {
      data: this.#encoder.encode(XML_HEADER + xml),
      contentType,
      compress: true,
    });
  }

  /** A binary part, typed by its extension. */
  binary(path: string, data: Uint8Array, mime: string, compress = false): void {
    const extension = path.split('.').at(-1)?.toLowerCase() ?? 'bin';
    const known = this.#defaults.get(extension) ?? DEFAULT_TYPES[extension];
    if (known === mime || known === undefined) this.#defaults.set(extension, mime);
    this.#parts.set(path, {
      data,
      contentType: known === mime || known === undefined ? undefined : mime,
      compress,
    });
  }

  /** Every part, the content types first, as PowerPoint writes them. */
  files(): { name: string; data: Uint8Array; compress: boolean }[] {
    const all = new Map(this.#parts);
    for (const [source, rels] of this.#rels) {
      if (rels.empty) continue;
      all.set(source === '' ? '_rels/.rels' : relsPathOf(source), {
        data: this.#encoder.encode(rels.xml()),
        compress: true,
      });
    }
    const defaults = new Map<string, string>([
      ['rels', DEFAULT_TYPES.rels!],
      ['xml', DEFAULT_TYPES.xml!],
      ...this.#defaults,
    ]);
    const overrides = [...all]
      .filter(([, part]) => part.contentType)
      .map(([name, part]) =>
        el('Override', { PartName: `/${name}`, ContentType: part.contentType }),
      );
    const types =
      XML_HEADER +
      el(
        'Types',
        { xmlns: NS.types },
        ...[...defaults].map(([Extension, ContentType]) =>
          el('Default', { Extension, ContentType }),
        ),
        ...overrides,
      );
    return [
      { name: '[Content_Types].xml', data: this.#encoder.encode(types), compress: true },
      ...[...all].map(([name, part]) => ({ name, data: part.data, compress: part.compress })),
    ];
  }
}

/** The namespace declarations of a PresentationML part. */
export const PML_NS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;

/** Text as the content of an element, escaped. */
export const text = esc;
