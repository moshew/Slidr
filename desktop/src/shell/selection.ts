import { findElement, findSlide, type Deck, type Element } from '@slidr/model';

/** What is selected, as row B of Top Tools sees it (SPEC 4.4). */
export type SelectionKind =
  'none' | 'text' | 'image' | 'shape' | 'table' | 'chart' | 'media' | 'html' | 'group' | 'multiple';

const kindOfType: Record<Element['type'], SelectionKind> = {
  text: 'text',
  image: 'image',
  shape: 'shape',
  line: 'shape',
  svg: 'shape',
  table: 'table',
  chart: 'chart',
  video: 'media',
  audio: 'media',
  html: 'html',
  group: 'group',
};

/** The row B kind of one element. */
export function elementKind(element: Element): SelectionKind {
  return kindOfType[element.type];
}

/** The name shown to a person; an SVG icon still uses shape tools. */
export function elementDisplayKind(element: Element): SelectionKind | 'icon' {
  return element.type === 'svg' ? 'icon' : elementKind(element);
}

/**
 * The row B kind of a selection. A shape whose text is being edited counts as text: the caret is
 * in text, so the text tools are the ones wanted.
 */
export function selectionKind(
  deck: Deck,
  slideId: string | null,
  elementIds: readonly string[],
  editingElementId: string | null = null,
): SelectionKind {
  if (elementIds.length === 0 || !slideId) return 'none';
  if (elementIds.length > 1) return 'multiple';
  const slide = findSlide(deck, slideId);
  const element = slide && elementIds[0] ? findElement(slide, elementIds[0]) : undefined;
  if (!element) return 'none';
  if (element.type === 'shape' && editingElementId === element.id) return 'text';
  return kindOfType[element.type];
}
