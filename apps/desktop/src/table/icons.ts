import type { BorderEdges } from '@slidr/model';
import { createLucideIcon, type LucideIcon } from '@slidr/ui/icons';

/*
 * The border choices of a range of cells: which lines a border goes on. Lucide has no such icons,
 * so these are drawn the way Lucide draws its own (a 24 grid, the stroke of the icon set, through
 * Lucide's own factory): the lines that are chosen in full, over the faint grid of four cells.
 */

const GRID = 'M4 4h16v16H4z M12 4v16 M4 12h16';

const LINES: Record<BorderEdges, string | undefined> = {
  all: GRID,
  outer: 'M4 4h16v16H4z',
  inner: 'M12 4v16 M4 12h16',
  innerHorizontal: 'M4 12h16',
  innerVertical: 'M12 4v16',
  top: 'M4 4h16',
  bottom: 'M4 20h16',
  left: 'M4 4v16',
  right: 'M20 4v16',
  none: undefined,
};

type IconNodes = Parameters<typeof createLucideIcon>[1];

function borderIcon(edges: BorderEdges): LucideIcon {
  const lines = LINES[edges];
  const nodes: IconNodes = [['path', { d: GRID, opacity: '0.3', key: 'grid' }]];
  if (lines) nodes.push(['path', { d: lines, key: 'lines' }]);
  return createLucideIcon(`border-${edges}`, nodes);
}

/** One icon for each choice of borders, in the order the borders popover shows them. */
export const borderIcons: readonly { edges: BorderEdges; icon: LucideIcon }[] = (
  [
    'all',
    'outer',
    'inner',
    'innerHorizontal',
    'innerVertical',
    'top',
    'bottom',
    'left',
    'right',
    'none',
  ] as const
).map((edges) => ({ edges, icon: borderIcon(edges) }));
