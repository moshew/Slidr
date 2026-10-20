import { useMemo } from 'react';
import { useDeck, useEditor, useSelection } from '../shell';
import { chartTarget, type ChartTarget } from './target';

/**
 * The target of the chart tools of row B and of the data editor. A tool gets only the kind of the
 * selection: it reads the chart here, and follows the deck and the selection.
 */
export function useChartTarget(): ChartTarget | undefined {
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  // Each of these changes what the target is.
  return useMemo(
    () => chartTarget(editor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, deck, slideId, selected, editingId],
  );
}
