import { createStore } from 'zustand/vanilla';
import type { Point } from '@slidr/model';
import type { HANDLES } from './geometry';

/*
 * Where the keyboard is inside the Stage, beyond the selection (UI-06): the crop handle or the
 * point of a line the arrows move, and the element the selection walk stands on. The Stage keeps
 * it here and not in its own state, so the host can say it in words to a screen reader, as it
 * says the selection. And the way a registered shortcut reaches the Stage that has the keyboard.
 */

export type HandleName = keyof typeof HANDLES;

/** The crop handles in the order Tab goes through them: clockwise from the top left corner. */
export const HANDLE_ORDER: readonly HandleName[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface StageKeys {
  /** The crop handle the arrows move; null: they move the picture under the frame. */
  handle: HandleName | null;
  /** The point of the selected line the arrows move; null: they move the line itself. */
  point: number | null;
  /** The element the selection walk stands on, which may or may not be selected. */
  cursor: string | null;
}

const NOWHERE: StageKeys = { handle: null, point: null, cursor: null };

export const stageKeys = createStore<StageKeys>(() => NOWHERE);

export function resetStageKeys(): void {
  const { handle, point, cursor } = stageKeys.getState();
  if (handle !== null || point !== null || cursor !== null) stageKeys.setState(NOWHERE);
}

/** What a shortcut of the shell's registry asks of the Stage. */
export type StageCommand =
  /** Moves the view of a zoomed slide a step towards `dir` (a unit vector on the screen). */
  | { type: 'pan'; dir: Point }
  /** Moves the selection walk to the next or the previous element, selecting nothing. */
  | { type: 'walk'; step: 1 | -1 }
  /** Adds the element the walk stands on to the selection, or takes it out. */
  | { type: 'toggle' }
  /** Goes into the points of the one selected line. */
  | { type: 'points' }
  /** The next or the previous crop handle, or point of the line. */
  | { type: 'part'; step: 1 | -1 }
  /** A new point after the one the keyboard is on, or that point removed. */
  | { type: 'point.add' }
  | { type: 'point.remove' };

type Handler = (command: StageCommand) => boolean;

let handler: Handler | null = null;

/** The Stage on the screen answers the commands; there is one at a time. */
export function setStageCommands(next: Handler | null): void {
  handler = next;
}

/** Asks the Stage. False when there is none, or when it had nothing to do with the command. */
export function stageCommand(command: StageCommand): boolean {
  return handler ? handler(command) : false;
}
