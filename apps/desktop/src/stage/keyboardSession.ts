import { createStore } from 'zustand/vanilla';
import type { Point } from '@slidr/model';
import type { HANDLES } from './geometry';

/*
 * Where the keyboard is on the Stage and in the Filmstrip, beyond the selection (UI-06): the
 * crop handle or the point of a line the arrows move, and the element or the slide the selection
 * walk stands on. It is kept here and not in the components' own state, so the host can say it
 * in words to a screen reader, as it says the selection. And the way a registered shortcut
 * reaches the Stage or the Filmstrip, whichever has the keyboard.
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
  /** The slide the walk stands on in the Filmstrip, which may or may not be selected. */
  slide: string | null;
}

const NOWHERE: StageKeys = { handle: null, point: null, cursor: null, slide: null };

export const stageKeys = createStore<StageKeys>(() => NOWHERE);

export function resetStageKeys(): void {
  const { handle, point, cursor, slide } = stageKeys.getState();
  if (handle !== null || point !== null || cursor !== null || slide !== null) {
    stageKeys.setState(NOWHERE);
  }
}

/** What a shortcut of the shell's registry asks of the Stage, or of the Filmstrip. */
export type StageCommand =
  /** Moves the view of a zoomed slide a step towards `dir` (a unit vector on the screen). */
  | { type: 'pan'; dir: Point }
  /** Moves the selection walk to the next or the previous element or slide, selecting nothing. */
  | { type: 'walk'; step: 1 | -1 }
  /** Adds what the walk stands on to the selection, or takes it out. */
  | { type: 'toggle' }
  /**
   * Goes into the points of the one selected line, or out of them. From a key this is the
   * Stage's only while it has the keyboard; the menu asks whatever has it.
   */
  | { type: 'points'; fromMenu?: boolean }
  /** The next or the previous crop handle, or point of the line. */
  | { type: 'part'; step: 1 | -1 }
  /** A new point after the one the keyboard is on, or that point removed. */
  | { type: 'point.add' }
  | { type: 'point.remove' };

type Handler = (command: StageCommand) => boolean;

let handler: Handler | null = null;
let strip: Handler | null = null;

/** The Stage on the screen answers the commands; there is one at a time. */
export function setStageCommands(next: Handler | null): void {
  handler = next;
}

/**
 * The Filmstrip answers too, when it is the one with the keyboard: the walk and its toggle are
 * the same keys there, on slides.
 */
export function setStripCommands(next: Handler | null): void {
  strip = next;
}

/**
 * Asks the Stage, and then the Filmstrip. Each answers only while it has the keyboard, so at
 * most one of them does. False when neither had anything to do with the command.
 */
export function stageCommand(command: StageCommand): boolean {
  return (handler?.(command) ?? false) || (strip?.(command) ?? false);
}
