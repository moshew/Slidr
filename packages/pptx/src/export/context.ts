import type { AssetMeta, Deck, Element, Slide } from '@slidr/model';
import { PackageWriter, type PartRels, REL } from '../opc';
import { Warnings, type ExportWarning, type ExportWarningCode } from '../warnings';

/** A picture the host drew of an element that PowerPoint cannot draw itself. */
export interface ElementPicture {
  /**
   * PNG of the element alone in its box, at any scale: without its rotation, its shadow and its
   * opacity, which the file says for itself.
   */
  png: Uint8Array;
  /** For a drawing: the SVG itself, its colours as the slide shows them, for PowerPoint to draw. */
  svg?: string;
}

export interface PptxExportOptions {
  /** An asset's bytes, from where the app keeps them; undefined when the file is not there. */
  loadAsset: (asset: AssetMeta) => Promise<Blob | undefined>;
  /** The slides to write, in the deck's order; every slide that is not hidden by default. */
  slideIds?: readonly string[];
  /** False leaves transitions and animations out. */
  animations?: boolean;
  /**
   * A picture of an element as it looks on the slide, for what PowerPoint has no object for (an
   * HTML object, a drawing that lays itself out, a picture with a look of its own). Without it,
   * such an element is written as near as the file can say, or left out with a warning.
   */
  picture?: (element: Element, slide: Slide, deck: Deck) => Promise<ElementPicture | undefined>;
  /** A picture PowerPoint cannot read (WebP, AVIF) as PNG. */
  toPng?: (blob: Blob) => Promise<Uint8Array | undefined>;
  /** The frame of a video at a time, as PNG: its poster in the file. */
  videoFrame?: (blob: Blob, timeMs: number) => Promise<Uint8Array | undefined>;
  /**
   * The family that draws a language's letters for text set in `family`, when it lacks them
   * (the counterparts of the font library, ADR-105). Undefined when it has them.
   */
  counterpart?: (family: string, lang: string) => string | undefined;
  /**
   * The words an empty placeholder of a layout shows in PowerPoint, in the language of the user:
   * of a title, and of any other text. English by default.
   */
  prompts?: { title: string; text: string };
  /** When the file says it was made; now by default. */
  now?: Date;
}

export interface PptxExportResult {
  bytes: Uint8Array<ArrayBuffer>;
  warnings: ExportWarning[];
  /** The slides written. */
  slides: number;
  /** The pictures, videos and sounds that went in. */
  media: { files: number; bytes: number };
  /** The font families the text is set in. */
  fonts: string[];
}

/** The media types PowerPoint reads as pictures. */
const PICTURE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
};

/** A file of the package for an asset or for bytes made during the export. */
export interface MediaPart {
  path: string;
  mime: string;
}

/** What every writer of a part shares: the deck, the package, the warnings, the media. */
export class ExportContext {
  readonly pkg = new PackageWriter();
  readonly warnings = new Warnings<ExportWarningCode>();
  readonly fonts = new Set<string>();
  /** The part of each slide that is written, by its id: for links between slides. */
  readonly slideParts = new Map<string, string>();
  /** The slide being written, from 1, for warnings. */
  slide = 0;
  mediaBytes = 0;
  readonly #media = new Map<string, Promise<MediaPart | undefined>>();
  #count = 0;
  #charts = 0;
  #guid = 0;

  constructor(
    readonly deck: Deck,
    readonly options: PptxExportOptions,
  ) {}

  warn(code: ExportWarningCode, detail?: string): void {
    this.warnings.add(code, this.slide || undefined, detail);
  }

  /** The next free number of a media file. */
  #nextName(extension: string, kind: 'image' | 'media'): string {
    this.#count++;
    return `ppt/media/${kind}${this.#count}.${extension}`;
  }

  /** The asset's bytes, or undefined (with a warning) when they cannot be read. */
  async assetBlob(asset: AssetMeta): Promise<Blob | undefined> {
    const blob = await this.options.loadAsset(asset).catch(() => undefined);
    if (!blob) this.warn('asset-missing', asset.name ?? asset.file);
    return blob;
  }

  /**
   * The part of an asset in the package, written once however often it is used. A picture in a
   * format PowerPoint does not read is written as PNG when the host can convert it.
   */
  assetPart(asset: AssetMeta): Promise<MediaPart | undefined> {
    let part = this.#media.get(asset.id);
    if (!part) {
      part = this.#writeAsset(asset);
      this.#media.set(asset.id, part);
    }
    return part;
  }

  async #writeAsset(asset: AssetMeta): Promise<MediaPart | undefined> {
    const blob = await this.assetBlob(asset);
    if (!blob) return undefined;
    let mime = (asset.mime || blob.type || 'application/octet-stream').toLowerCase();
    let data: Uint8Array = new Uint8Array(await blob.arrayBuffer());
    const picture = asset.kind === 'image' || asset.kind === 'svg';
    if (picture && !PICTURE_TYPES.has(mime)) {
      const png = await this.options.toPng?.(blob).catch(() => undefined);
      if (!png) {
        this.warn('asset-missing', asset.name ?? asset.file);
        return undefined;
      }
      data = png;
      mime = 'image/png';
    }
    if (!picture && (asset.kind === 'video' || asset.kind === 'audio')) {
      if (mime === 'video/webm' || mime === 'audio/ogg') this.warn('media-format', asset.name);
    }
    return this.bytesPart(data, mime, picture ? 'image' : 'media');
  }

  /** Bytes made during the export (a picture of an element, a poster) as a part of their own. */
  bytesPart(data: Uint8Array, mime: string, kind: 'image' | 'media' = 'image'): MediaPart {
    const extension = EXTENSIONS[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'bin';
    const path = this.#nextName(extension, kind);
    this.pkg.binary(path, data, mime, mime === 'image/svg+xml' || mime === 'image/bmp');
    this.mediaBytes += data.length;
    return { path, mime };
  }

  /** The number of the next chart part. */
  nextChart(): number {
    return ++this.#charts;
  }

  /** A GUID of its own for each call, as fields and charts want one. */
  guid(): string {
    this.#guid++;
    const hex = this.#guid.toString(16).padStart(12, '0').toUpperCase();
    return `{5D1C7A2E-0B9F-4C3A-8E21-${hex}}`;
  }

  /** The relationship of a part to an image part. */
  imageRel(rels: PartRels, part: MediaPart): string {
    return rels.add(REL.image, part.path);
  }

  get mediaFiles(): number {
    return this.#count;
  }
}
