import {
  AssetMeta,
  assetsUsedBy,
  createElement,
  detachElements,
  Element,
  findSlide,
  Layout,
  newId,
  pasteElements,
  pasteSlides,
  plainText,
  richText,
  Slide,
  type Command,
  type Deck,
  type Point,
} from '@slidr/model';

/*
 * What Slidr puts on the clipboard (ARR-05, FLM-02): the copied elements or slides as the model
 * holds them, plus the asset table entries they refer to. It is plain JSON under Slidr's own MIME
 * type, so it survives the deck it was copied from and can be pasted into another one. The files
 * behind the assets are not in it (see clipboard.ts).
 */

/** The clipboard format of the payload. `text/plain` carries the text of what was copied. */
export const SLIDR_MIME = 'application/x-slidr+json';

const VERSION = 1;

interface ClipBase {
  /** The version of this format. */
  slidr: typeof VERSION;
  /** One per copy: pasting the same clip again on one slide moves each paste further. */
  id: string;
  /** A cut: the first paste on the slide it came from lands where the elements were. */
  cut: boolean;
  /** The deck the content came from. */
  deckId: string;
  /** Table entries of the assets the content refers to. */
  assets: AssetMeta[];
}

export interface ElementsClip extends ClipBase {
  kind: 'elements';
  /** The slide the elements came from. */
  slideId: string;
  /** Top-level elements in z-order, with frames relative to the slide. */
  elements: Element[];
}

export interface SlidesClip extends ClipBase {
  kind: 'slides';
  /** In deck order. */
  slides: Slide[];
  /** The layouts the slides use, for a deck that does not have them. */
  layouts: Layout[];
}

export type Clip = ElementsClip | SlidesClip;

/** A clip of elements of one slide, or undefined when none of them is on it. */
export function clipElements(
  deck: Deck,
  slideId: string,
  elementIds: readonly string[],
  cut = false,
): ElementsClip | undefined {
  const slide = findSlide(deck, slideId);
  const elements = slide ? detachElements(slide, elementIds) : [];
  if (elements.length === 0) return undefined;
  return {
    slidr: VERSION,
    id: newId('tx'),
    kind: 'elements',
    cut,
    deckId: deck.id,
    slideId,
    elements,
    assets: assetsUsedBy(deck, elements),
  };
}

/** A clip of whole slides, in deck order, or undefined when none of them is in the deck. */
export function clipSlides(
  deck: Deck,
  slideIds: readonly string[],
  cut = false,
): SlidesClip | undefined {
  const wanted = new Set(slideIds);
  const slides = deck.slides.filter((s) => wanted.has(s.id));
  if (slides.length === 0) return undefined;
  const used = new Set(slides.map((s) => s.layoutId));
  const layouts = deck.layouts.filter((l) => used.has(l.id));
  return {
    slidr: VERSION,
    id: newId('tx'),
    kind: 'slides',
    cut,
    deckId: deck.id,
    // Deep copies: the deck is frozen, and the clip outlives it.
    slides: structuredClone(slides),
    layouts: structuredClone(layouts),
    assets: assetsUsedBy(deck, [slides, layouts]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAll<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  values: unknown,
): T[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const parsed: T[] = [];
  for (const value of values) {
    const result = schema.safeParse(value);
    if (!result.success) return undefined;
    parsed.push(result.data as T);
  }
  return parsed;
}

/**
 * Reads a clip from clipboard text. The clipboard is outside input: whatever does not match the
 * model's schemas is turned down as a whole, and undefined comes back.
 */
export function parseClip(text: string): Clip | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.slidr !== VERSION) return undefined;
  const { id, cut, deckId, kind } = raw;
  if (typeof id !== 'string' || typeof deckId !== 'string' || typeof cut !== 'boolean') {
    return undefined;
  }
  const assets = parseAll(AssetMeta, raw.assets);
  if (!assets) return undefined;
  const base: ClipBase = { slidr: VERSION, id, cut, deckId, assets };

  if (kind === 'elements') {
    const elements = parseAll(Element, raw.elements);
    if (!elements?.length || typeof raw.slideId !== 'string') return undefined;
    return { ...base, kind, slideId: raw.slideId, elements };
  }
  if (kind === 'slides') {
    const slides = parseAll(Slide, raw.slides);
    const layouts = parseAll(Layout, raw.layouts);
    if (!slides?.length || !layouts) return undefined;
    return { ...base, kind, slides, layouts };
  }
  return undefined;
}

function elementText(element: Element): string[] {
  switch (element.type) {
    case 'text':
      return [plainText(element.content)];
    case 'shape':
      return element.content ? [plainText(element.content)] : [];
    case 'table':
      return element.cells.map((row) => row.map((cell) => plainText(cell.content)).join('\t'));
    case 'group':
      return element.children.flatMap(elementText);
    default:
      return [];
  }
}

/** The text of a clip, for `text/plain`: what pasting it into a text field gives. */
export function clipText(clip: Clip): string {
  const lines = (elements: readonly Element[]) =>
    elements
      .flatMap(elementText)
      .filter((text) => text.trim() !== '')
      .join('\n');
  if (clip.kind === 'elements') return lines(clip.elements);
  return clip.slides
    .map((slide) => lines(slide.elements))
    .filter(Boolean)
    .join('\n\n');
}

/** Each paste of a clip on a slide lands this far from the one before it. */
export const PASTE_STEP = 24;

/**
 * Where a paste of elements lands, relative to where they were copied from. On another slide the
 * position is kept; on the slide they came from a copy would hide its original, so it is moved,
 * while a cut goes back where it was. Every further paste on the same slide moves on by a step.
 */
export function pasteOffset(
  clip: ElementsClip,
  deckId: string,
  slideId: string,
  earlierPastes: number,
): Point {
  const overOriginal = clip.deckId === deckId && clip.slideId === slideId && !clip.cut;
  const steps = earlierPastes + (overOriginal ? 1 : 0);
  return { x: steps * PASTE_STEP, y: steps * PASTE_STEP };
}

export interface PasteOptions {
  /** The slide shown: elements go on it, slides go after it. */
  slideId: string | null;
  /** For elements: see `pasteOffset`. */
  offset?: Point;
  /**
   * Table entries for the clip's assets that the deck does not have. Default: the clip's own.
   * The caller passes the entries of the files it imported into this document.
   */
  assets?: readonly AssetMeta[];
}

export interface PasteResult {
  /** One batch: one undo step. */
  commands: Command[];
  /** What to select afterwards. */
  elementIds: string[];
  slideIds: string[];
}

/** The commands that paste a clip into a deck, with new ids, and what to select afterwards. */
export function pasteCommands(deck: Deck, clip: Clip, options: PasteOptions): PasteResult {
  const empty: PasteResult = { commands: [], elementIds: [], slideIds: [] };
  const assets = (options.assets ?? clip.assets)
    .filter((asset) => !(asset.id in deck.assets))
    .map((asset): Command => ({ type: 'asset.add', asset }));

  if (clip.kind === 'elements') {
    if (!options.slideId || !findSlide(deck, options.slideId)) return empty;
    const added = pasteElements(deck, options.slideId, clip.elements, { offset: options.offset });
    return {
      commands: [...assets, ...added],
      elementIds: added.map((c) => c.element.id),
      slideIds: [],
    };
  }
  const current = deck.slides.findIndex((s) => s.id === options.slideId);
  const added = pasteSlides(deck, clip.slides, { index: current + 1, layouts: clip.layouts });
  return {
    commands: [...assets, ...added],
    elementIds: [],
    slideIds: added.flatMap((c) => (c.type === 'slide.add' ? [c.slide.id] : [])),
  };
}

/** A text box for plain text pasted on the slide: in the middle, as wide as half the slide. */
export function textBoxFor(text: string, deck: Deck): Element | undefined {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (clean.trim() === '') return undefined;
  const { size, lineHeight } = deck.theme.textStyles.body;
  const w = deck.size.w / 2;
  // The box grows with its text; this is the height it starts from.
  const h = Math.min(deck.size.h, Math.ceil(clean.split('\n').length * size * lineHeight));
  return createElement.text({
    frame: { x: (deck.size.w - w) / 2, y: Math.round((deck.size.h - h) / 2), w, h },
    autoFit: 'growHeight',
    content: richText(clean, { styleRef: 'body' }),
  });
}
