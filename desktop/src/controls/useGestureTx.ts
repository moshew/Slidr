import { newId } from '@slidr/model';
import { useMemo, useRef } from 'react';

export interface GestureTx {
  /** The transaction of the gesture under way; the first call of a gesture starts it. */
  id: () => string;
  /** The gesture ended: the next change starts a new undo step. */
  end: () => void;
}

/**
 * One undo step for a continuous gesture on a control: a drag in the colour picker, a slider.
 * Dispatch every change of the gesture with `{ txId: tx.id() }` and call `tx.end()` when the
 * control reports the end (`onGestureEnd`, `onValueCommit`) (CMD-03).
 */
export function useGestureTx(): GestureTx {
  const current = useRef<string | null>(null);
  return useMemo(
    () => ({
      id: () => (current.current ??= newId('tx')),
      end: () => {
        current.current = null;
      },
    }),
    [],
  );
}
