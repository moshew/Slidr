/**
 * What is being written in each chat (CHT-U05): the words and the files of a message that was
 * not sent yet. A chat's component goes whenever its panel shows something else (the Actions
 * tab, the settings, another panel), so what the user has typed and attached is kept here, by
 * the chat it is for. It is there when the chat is back, for as long as the window is open.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Attachment } from '../agent/agentService';

export interface Draft {
  text: string;
  files: readonly Attachment[];
}

/** A chat in which nothing is being written. */
export const NO_DRAFT: Draft = Object.freeze({ text: '', files: Object.freeze([]) });

export interface Drafts {
  /** The drafts by subject (`threadIdOf` of the chat's scope); a subject without one is absent. */
  store: StoreApi<Record<string, Draft>>;
  /**
   * Changes the draft of a subject from what it is now, which a file that took a while to read
   * needs: the draft may have changed meanwhile. A draft left empty is forgotten.
   */
  change: (subject: string, change: (draft: Draft) => Draft) => void;
}

export function createDrafts(): Drafts {
  const store = createStore<Record<string, Draft>>(() => ({}));
  return {
    store,
    change(subject, change) {
      store.setState((drafts) => {
        const next = change(drafts[subject] ?? NO_DRAFT);
        const rest = Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== subject));
        return next.text === '' && next.files.length === 0 ? rest : { ...rest, [subject]: next };
      }, true);
    },
  };
}
