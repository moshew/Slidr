import { plainText, type Element } from '@slidr/model';

/** One row of the Layers panel. */
export interface LayerRow {
  element: Element;
  /** 0 for an element of the slide, 1 for a child of a group, and so on. */
  depth: number;
  /** A group above it is hidden or locked, so it is too, whatever its own flag says. */
  hiddenByGroup: boolean;
  lockedByGroup: boolean;
}

/**
 * The elements of a slide as the Layers panel lists them: the topmost first (the reverse of the
 * model's z-order), each group followed by its children.
 */
export function layerRows(
  elements: readonly Element[],
  depth = 0,
  hiddenByGroup = false,
  lockedByGroup = false,
): LayerRow[] {
  return elements.toReversed().flatMap((element): LayerRow[] => {
    const row = { element, depth, hiddenByGroup, lockedByGroup };
    if (element.type !== 'group') return [row];
    return [
      row,
      ...layerRows(
        element.children,
        depth + 1,
        hiddenByGroup || Boolean(element.hidden),
        lockedByGroup || Boolean(element.locked),
      ),
    ];
  });
}

const SNIPPET = 40;

/**
 * What a row is called when the element has no name of its own: the beginning of its text, or
 * undefined, and the panel then says what kind of element it is.
 */
function ownText(element: Element): string | undefined {
  if (element.type === 'text') return plainText(element.content);
  if (element.type === 'shape') return element.content && plainText(element.content);
  if (element.type === 'image') return element.alt;
  return undefined;
}

export function layerSnippet(element: Element): string | undefined {
  const text = ownText(element);
  const line = text
    ?.split('\n')
    .find((l) => l.trim() !== '')
    ?.trim();
  if (!line) return undefined;
  return line.length > SNIPPET ? `${line.slice(0, SNIPPET).trimEnd()}…` : line;
}

/** The ids between two rows, both included, in the order of the list. */
export function rowRange(rows: readonly LayerRow[], fromId: string, toId: string): string[] {
  const from = rows.findIndex((r) => r.element.id === fromId);
  const to = rows.findIndex((r) => r.element.id === toId);
  if (from < 0 || to < 0) return to < 0 ? [] : [toId];
  return rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.element.id);
}
