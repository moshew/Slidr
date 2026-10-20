import { walkElements, type ChangeEvent } from '@slidr/model';
import { createStore, type StoreApi } from 'zustand/vanilla';

/*
 * The elements the agent is changing right now (STG-11): the Stage marks them with a frame that
 * glows softly, so the user sees where the agent's hand is. Two things put an element here:
 *
 *   - a change the agent just made to it: the mark stays for a moment after the change, and a
 *     run of changes keeps it up;
 *   - a tool call of the agent that names it and is still running (a picture being generated
 *     into a frame takes half a minute): the mark stays until the call ends.
 *
 * A slide the agent builds or rebuilds whole is marked as a slide, by its id.
 *
 * It is not part of the document and not of undo (CMD-05): only of what this window shows.
 */

/** How long a mark stays after the agent's last change to the element. */
export const MARK_MS = 1600;

interface Marks {
  /** The ids to mark, of elements and of slides, in no order. A new array only when the set changes. */
  ids: readonly string[];
}

export interface AgentMarks {
  store: StoreApi<Marks>;
  /** The agent changed these elements just now. */
  touch: (ids: readonly string[]) => void;
  /** A tool call that names these elements began; the returned function says it ended. */
  hold: (ids: readonly string[]) => () => void;
  /** A change of the deck: the agent's own writes are what gets marked. */
  noteChange: (event: ChangeEvent) => void;
  clear: () => void;
}

export function createAgentMarks(
  options: {
    markMs?: number;
    setTimer?: (run: () => void, ms: number) => unknown;
    clearTimer?: (timer: unknown) => void;
  } = {},
): AgentMarks {
  const markMs = options.markMs ?? MARK_MS;
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer =
    options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const store = createStore<Marks>(() => ({ ids: [] }));
  /** The timer that takes a touched element's mark away. */
  const fading = new Map<string, unknown>();
  /** How many running calls name an element. */
  const held = new Map<string, number>();

  const publish = () => {
    const ids = [...new Set([...fading.keys(), ...held.keys()])];
    const before = store.getState().ids;
    if (ids.length !== before.length || ids.some((id) => !before.includes(id))) {
      store.setState({ ids });
    }
  };

  const touch = (ids: readonly string[]) => {
    for (const id of ids) {
      const running = fading.get(id);
      if (running !== undefined) clearTimer(running);
      fading.set(
        id,
        setTimer(() => {
          fading.delete(id);
          publish();
        }, markMs),
      );
    }
    publish();
  };

  return {
    store,
    touch,
    hold(ids) {
      for (const id of ids) held.set(id, (held.get(id) ?? 0) + 1);
      publish();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const id of ids) {
          const count = (held.get(id) ?? 1) - 1;
          if (count > 0) held.set(id, count);
          else held.delete(id);
        }
        // What the call changed lingers as any change of the agent does.
        touch(ids);
      };
    },
    noteChange(event) {
      // An undo or a redo is the user's, whoever made the change first.
      if (event.kind !== 'apply' || event.actor === 'user') return;
      const { elements, slides } = event.affected;
      // A slide the change made is marked as one thing, not as each of its elements.
      const made = event.deck.slides.filter(
        (slide) =>
          slides.includes(slide.id) && !event.previous.slides.some((s) => s.id === slide.id),
      );
      const inMade = new Set(
        made.flatMap((slide) => [...walkElements(slide.elements)].map((e) => e.id)),
      );
      const changed = elements.filter((id) => !inMade.has(id));
      // A change that names no element is of a slide as a whole (its background, say).
      const whole = made.length > 0 || changed.length > 0 ? made.map((s) => s.id) : slides;
      touch([...whole, ...changed]);
    },
    clear() {
      for (const timer of fading.values()) clearTimer(timer);
      fading.clear();
      held.clear();
      publish();
    },
  };
}

/** The marks of this window. */
export const agentMarks = createAgentMarks();
