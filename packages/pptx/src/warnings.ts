/*
 * What a conversion could not carry over as it was. Each warning has a code the app words in the
 * language of the interface, the slide it is on (from 1), and a detail that names the thing:
 * a font, a file, a kind of shape. The same code on many slides is one line of the report.
 */

export type ExportWarningCode =
  /** An HTML object went into the file as a picture of it. */
  | 'html-picture'
  /** An HTML object could not be drawn as a picture, and is not in the file. */
  | 'html-missing'
  /** A drawing, or a picture with a look PowerPoint has no setting for, went in as a picture. */
  | 'element-picture'
  /** A picture or a file of the deck could not be read. */
  | 'asset-missing'
  /** An image placeholder that is still waiting for its picture. */
  | 'image-placeholder'
  /** A fill PowerPoint has no kind for (a conic gradient, free CSS) was drawn in its nearest. */
  | 'fill-approximated'
  /** The slide's own stylesheet does not go into the file. */
  | 'slide-css'
  /** A blur of a background or of an object. */
  | 'blur'
  /** A video or a sound in a format PowerPoint may not play. */
  | 'media-format'
  /** An animation PowerPoint has nothing like, written as its nearest. */
  | 'animation-approximated'
  /** A transition PowerPoint has nothing like, written as its nearest. */
  | 'transition-approximated'
  /** The fonts the file uses: PowerPoint draws them only where they are installed. */
  | 'fonts';

export type ImportWarningCode =
  /** A kind of object Slidr cannot show; it was left out. */
  | 'unsupported-object'
  /** A picture in a format the app cannot show (EMF, WMF, TIFF). */
  | 'picture-format'
  /** A picture, a video or a sound the file links to instead of holding. */
  | 'linked-media'
  /** A part of the file is missing or could not be read. */
  | 'broken-part'
  /** A SmartArt graphic, which came in as the shapes it is drawn with. */
  | 'smartart'
  /** An equation or an embedded object, which came in as its picture. */
  | 'object-picture'
  /** A chart Slidr draws differently: stacked, a combination of types, a 3-D chart. */
  | 'chart-approximated'
  /** Text written top to bottom. */
  | 'vertical-text'
  /** A shape outline Slidr does not have, drawn as a rectangle. */
  | 'shape-approximated'
  /** An animation Slidr has nothing like, taken as its nearest or left out. */
  | 'animation-approximated'
  /** A transition Slidr has nothing like, taken as its nearest. */
  | 'transition-approximated'
  /** The fonts the file uses that this computer may not have. */
  | 'fonts';

export interface ConversionWarning<Code extends string> {
  code: Code;
  /** The slide, counted from 1; absent for the whole file. */
  slide?: number;
  /** What the warning is about: a font, a file name, a kind of object. */
  detail?: string;
}

export type ExportWarning = ConversionWarning<ExportWarningCode>;
export type ImportWarning = ConversionWarning<ImportWarningCode>;

/** Collects warnings, each code, slide and detail once. */
export class Warnings<Code extends string> {
  readonly #seen = new Set<string>();
  readonly list: ConversionWarning<Code>[] = [];

  add(code: Code, slide?: number, detail?: string): void {
    const key = `${code}|${slide ?? ''}|${detail ?? ''}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.list.push({
      code,
      ...(slide === undefined ? {} : { slide }),
      ...(detail === undefined ? {} : { detail }),
    });
  }
}
