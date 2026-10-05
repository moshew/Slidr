import type { Archetype, Deck, Element, GroupElement, Slide } from './schema';

/** Every element of a tree, parents before their children. */
export function* walkElements(elements: readonly Element[]): Generator<Element> {
  for (const element of elements) {
    yield element;
    if (element.type === 'group') yield* walkElements(element.children);
  }
}

export function findSlide(deck: Deck, slideId: string): Slide | undefined {
  return deck.slides.find((s) => s.id === slideId);
}

/** The archetype of a slide: its layout's, or its own when it has no layout. */
export function slideArchetype(deck: Deck, slide: Slide): Archetype | undefined {
  const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
  return layout?.archetype ?? slide.archetype;
}

export interface ElementLocation {
  element: Element;
  /** The array that holds the element: `slide.elements` or a group's `children`. */
  siblings: Element[];
  index: number;
  parent?: GroupElement;
}

/** Finds an element anywhere in a tree, together with where it sits. */
export function locateElement(
  elements: Element[],
  elementId: string,
  parent?: GroupElement,
): ElementLocation | undefined {
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    if (!element) continue;
    if (element.id === elementId) return { element, siblings: elements, index, parent };
    if (element.type === 'group') {
      const inside = locateElement(element.children, elementId, element);
      if (inside) return inside;
    }
  }
  return undefined;
}

export function findElement(slide: Slide, elementId: string): Element | undefined {
  return locateElement(slide.elements, elementId)?.element;
}

/** Finds an element by id alone: element ids are unique across the slides of a deck. */
export function findElementInDeck(
  deck: Deck,
  elementId: string,
): { slide: Slide; element: Element } | undefined {
  for (const slide of deck.slides) {
    const element = findElement(slide, elementId);
    if (element) return { slide, element };
  }
  return undefined;
}

/** Ids of all elements on all slides, nested ones included. */
export function allElementIds(deck: Deck): Set<string> {
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    for (const element of walkElements(slide.elements)) ids.add(element.id);
  }
  return ids;
}

/**
 * Ids of the assets the deck still uses. An asset counts as used when its id appears anywhere
 * outside the asset table: in a model field, or inside free HTML or CSS, which the model does
 * not parse (SPEC 5.9). Fonts are used by family name, never by id, so they always count.
 */
export function referencedAssetIds(deck: Deck): Set<string> {
  const { assets, ...rest } = deck;
  const haystack = JSON.stringify(rest);
  const ids = new Set<string>();
  for (const asset of Object.values(assets)) {
    if (asset.kind === 'font' || haystack.includes(asset.id)) ids.add(asset.id);
  }
  return ids;
}

/** The separators of paths, drives and streams, and the characters Windows refuses in a name. */
const NOT_IN_A_FILE_NAME = '/\\:<>"|?*';
/** What Windows reads as a device, whatever the extension: `NUL`, `con.png`, `COM1`. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Whether `name` can be an asset's `file`: the name of one file inside the document's `assets/`
 * folder (SPEC 5.7), on every system the app runs on. A path, an address, and a name that
 * Windows would refuse, cut short (a dot or a space at the end) or take for a device are not.
 *
 * The storage layer judges by the same rule when it saves (`is_plain_file_name`, in Rust), and
 * leaves such an asset out of the file; the two are held to one list of names by their tests.
 */
export function isAssetFileName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false;
  if (name.endsWith('.') || name.endsWith(' ')) return false;
  for (const char of name) {
    if (char.charCodeAt(0) < 0x20 || NOT_IN_A_FILE_NAME.includes(char)) return false;
  }
  const stem = (name.split('.')[0] ?? name).replace(/ +$/, '');
  return !DEVICE_NAME.test(stem);
}
