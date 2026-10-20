import type {
  ConversionDifference,
  ConversionService,
  ElementConversion,
} from '@slidr/agent-tools';
import {
  CommandBus,
  findSlide,
  locateElement,
  rotatedBounds,
  type AssetMeta,
  type Command,
  type Deck,
  type Element,
  type Frame,
  type GroupElement,
  type HtmlElement,
  type Point,
  type Slide,
} from '@slidr/model';
import { isTauri } from '@tauri-apps/api/core';
import { captureWindowConversion, pageConversion } from '../agent/conversion';
import type { Editor } from '../shell';

/*
 * "Decompose into objects" (HTM-05): an `html` element becomes the regular elements the
 * conversion engine can make of it (ADR-017), in its place. The conversion is forced: what the
 * engine's guard would have put back as html stays a regular element, and the user is shown
 * where the result looks different before anything changes in the deck.
 */

/** Why an `html` element cannot be taken apart. */
export type DecomposeBlock = 'scripts' | 'mirrored' | 'stretched';

/**
 * What stands in the way of taking an element apart, if anything. The engine refuses the same
 * three; asking here lets the app say so in its own words, before it tries.
 */
export function decomposeBlock(element: HtmlElement): DecomposeBlock | undefined {
  // What scripts draw cannot be measured where scripts do not run.
  if (element.hasScripts) return 'scripts';
  if (element.flipH || element.flipV) return 'mirrored';
  const natural = element.natural ?? { w: element.frame.w, h: element.frame.h };
  const kx = element.frame.w / natural.w;
  const ky = element.frame.h / natural.h;
  // Text cannot follow a stretch that differs between the axes.
  if (Math.abs(kx - ky) > 1e-3 * kx) return 'stretched';
  return undefined;
}

export interface Decomposition {
  slideId: string;
  elementId: string;
  /** The parts, in z-order. */
  elements: Element[];
  /** The assets the parts use that the conversion stored. */
  assets: AssetMeta[];
  /** The corner of the group the element is in, on the slide; the slide's own corner otherwise. */
  origin: Point;
  /** Where the parts look different from the HTML. */
  differences: ConversionDifference[];
  /** The commands that put the parts in the element's place: one change, one undo step. */
  commands: Command[];
  /** The deck as it is after them, for the preview. */
  after: Deck;
  /** How many parts there are of each type, in the order they first appear. */
  counts: [Element['type'], number][];
  /** Parts that are still html: what no regular element can stand for. */
  keptHtml: number;
  /** Nothing came apart: the one part is html, as the element was. */
  unchanged: boolean;
}

function countByType(elements: readonly Element[]): [Element['type'], number][] {
  const counts = new Map<Element['type'], number>();
  for (const element of elements) counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  return Array.from(counts);
}

/** The commands that replace an element with the parts of a conversion, where it was. */
export function replaceCommands(
  deck: Deck,
  slideId: string,
  elementId: string,
  conversion: Pick<ElementConversion, 'elements' | 'assets'>,
): Command[] {
  const slide = findSlide(deck, slideId);
  const at = slide ? locateElement(slide.elements, elementId) : undefined;
  if (!at) return [];
  return [
    ...conversion.assets
      .filter((asset) => !(asset.id in deck.assets))
      .map((asset): Command => ({ type: 'asset.add', asset })),
    // The parts go in above the element before it is taken out: a group left without children
    // would be gone by the time the parts were added to it.
    ...conversion.elements.map((element, i): Command => ({
      type: 'element.add',
      slideId,
      element,
      index: at.index + 1 + i,
      ...(at.parent ? { parentId: at.parent.id } : {}),
    })),
    { type: 'element.remove', slideId, elementIds: [elementId] },
  ];
}

/**
 * Takes an `html` element apart, without changing the deck: the result holds the parts, the
 * differences, and the commands that would put the parts in its place.
 */
export async function decompose(
  conversion: ConversionService,
  deck: Deck,
  slideId: string,
  elementId: string,
): Promise<Decomposition> {
  const result = await conversion.convertElement(deck, {
    slideId,
    elementId,
    to: 'elements',
    force: true,
  });
  const commands = replaceCommands(deck, slideId, elementId, result);
  const slide = findSlide(deck, slideId);
  const scratch = new CommandBus(deck);
  if (commands.length) scratch.batch(commands);
  const keptHtml = result.elements.filter((element) => element.type === 'html').length;
  return {
    slideId,
    elementId,
    elements: result.elements,
    assets: result.assets,
    origin: slide ? originOf(slide, elementId) : { x: 0, y: 0 },
    differences: result.differences ?? [],
    commands,
    after: scratch.deck,
    counts: countByType(result.elements),
    keptHtml,
    unchanged: result.elements.length === keptHtml && keptHtml <= 1,
  };
}

/**
 * Where the frames of an element's siblings are measured from, on the slide: the corners of the
 * groups it is in, added up. A turned group is not followed: its children are then drawn
 * turned, and a preview that needs more than a corner shows the whole slide instead.
 */
export function originOf(slide: Slide, elementId: string): Point {
  const origin = { x: 0, y: 0 };
  const walk = (elements: readonly Element[], at: Point): boolean => {
    for (const element of elements) {
      if (element.id === elementId) {
        origin.x = at.x;
        origin.y = at.y;
        return true;
      }
      if (element.type !== 'group') continue;
      const group: GroupElement = element;
      if (walk(group.children, { x: at.x + group.frame.x, y: at.y + group.frame.y })) return true;
    }
    return false;
  };
  walk(slide.elements, origin);
  return origin;
}

/**
 * The part of the slide the preview shows: the element's frame as it sits on the slide (its
 * rotation included), with room around it, at the proportions of `aspect` (width over height).
 */
export function previewRegion(
  frame: Frame,
  rotation: number,
  slide: { w: number; h: number },
  aspect: number,
): Frame {
  const { w, h } = rotatedBounds(frame, rotation);
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  // A margin shows what is around the element, and where it sits on the slide.
  const margin = Math.max(24, Math.min(w, h) * 0.08);
  let rw = w + margin * 2;
  let rh = h + margin * 2;
  if (rw / rh > aspect) rh = rw / aspect;
  else rw = rh * aspect;
  // Never more than the slide, and inside it when that is possible.
  const scale = Math.min(1, slide.w / rw, slide.h / rh);
  rw *= scale;
  rh *= scale;
  const x = Math.min(Math.max(cx - rw / 2, 0), Math.max(0, slide.w - rw));
  const y = Math.min(Math.max(cy - rh / 2, 0), Math.max(0, slide.h - rh));
  return { x, y, w: rw, h: rh };
}

const ofEditor = new WeakMap<Editor, ConversionService>();

/**
 * The conversion engine of an editing window, for the app's own screens: in the app it runs in
 * the hidden capture window, where it can take the pictures it compares; in a plain browser
 * page it runs in the page, and sees no pictures (see `agent/conversion.ts`).
 */
export function conversionOf(editor: Editor): ConversionService {
  let conversion = ofEditor.get(editor);
  if (!conversion) {
    conversion = isTauri()
      ? captureWindowConversion(() => editor.document?.workspace?.id ?? null)
      : pageConversion(editor.assets);
    ofEditor.set(editor, conversion);
  }
  return conversion;
}
