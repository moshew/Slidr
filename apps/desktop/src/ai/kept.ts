/**
 * `useKept` is `useState` whose value outlives the component: it is kept by a name, for as long
 * as the window is open. For what the user fills in on the Actions tab of an AI tool (the
 * description and the files of a template, the prompt of a picture, the text a chart is filled
 * from): the tab's component goes whenever the panel shows the chat or another tool, and what
 * was typed there must be there on return, as a message being written is (`drafts.ts`).
 */
import { useCallback } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

const kept = createStore<Record<string, unknown>>(() => ({}));

/**
 * `initial` is what the value is until it is set, and must be the same value on every render
 * (a constant of the module, for a list or an object).
 */
export function useKept<T>(name: string, initial: T): [T, (next: T | ((before: T) => T)) => void] {
  const value = useStore(kept, (all) => (Object.hasOwn(all, name) ? (all[name] as T) : initial));
  const set = useCallback(
    (next: T | ((before: T) => T)) =>
      kept.setState((all) => {
        const before = Object.hasOwn(all, name) ? (all[name] as T) : initial;
        const after = typeof next === 'function' ? (next as (before: T) => T)(before) : next;
        return { ...all, [name]: after };
      }),
    [name, initial],
  );
  return [value, set];
}
