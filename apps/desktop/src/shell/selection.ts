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

export function selectionKind(
  deck: Deck,
  slideId: string | null,
  elementIds: readonly string[],
): SelectionKind {
  if (elementIds.length === 0 || !slideId) return 'none';
  if (elementIds.length > 1) return 'multiple';
  const slide = findSlide(deck, slideId);
  const element = slide && elementIds[0] ? findElement(slide, elementIds[0]) : undefined;
  return element ? kindOfType[element.type] : 'none';
}
