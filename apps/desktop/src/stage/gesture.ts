/*
 * Whether the pointer is in the middle of a gesture on the Stage: a drag of an element, of a
 * handle, of a point, of a marquee. For whoever would take the Stage to another slide by itself,
 * such as the Stage following the slide the agent writes: the slide must not go from under the
 * hand that holds something on it.
 */

let active = false;

/** The Stage on the screen says when a gesture begins and when it ends. */
export function setStageGesture(on: boolean): void {
  active = on;
}

export function stageGestureActive(): boolean {
  return active;
}
