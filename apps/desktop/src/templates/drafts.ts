/**
 * The templates the agent has drafted and nobody has saved yet (WG7-T11a, THM-06). A draft is
 * shown to the user before anything is kept: the chat puts the latest one above its composer,
 * with every layout drawn, and the user saves it, asks for changes or lets it go. Drafts live
 * with the window and end with it; what is saved is a personal template of the library.
 */
import type { DraftedLayout, DraftFinding } from '@slidr/agent-tools';
import type { Deck } from '@slidr/model';
import type { Draft, Template } from '@slidr/templates';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface TemplateDraft {
  /** `draft_…`: the id of the draft's theme, and what `template_save` and `basedOn` take. */
  id: string;
  template: Template;
  /** What each layout was drawn with: a later draft that keeps a layout keeps its sample. */
  fills: Draft['fills'];
  /** One slide for each layout with its sample on it, in the open deck's direction. */
  sample: Deck;
  layouts: DraftedLayout[];
  findings: DraftFinding[];
  notes: string[];
  /** The id the draft has in the library, once saved. */
  savedAs?: string;
}

export interface DraftsState {
  drafts: readonly TemplateDraft[];
  /** The draft the chat shows; null when there is none, or the user closed it. */
  shown: string | null;
}

/** How many drafts are kept for `basedOn`: a conversation revises its last few, not its first. */
const KEPT = 8;

export class TemplateDrafts {
  readonly state: StoreApi<DraftsState> = createStore<DraftsState>(() => ({
    drafts: [],
    shown: null,
  }));

  get(id: string): TemplateDraft | undefined {
    return this.state.getState().drafts.find((draft) => draft.id === id);
  }

  /** A new draft takes the place of the one that was shown: it is the agent's latest word. */
  put(draft: TemplateDraft): void {
    this.state.setState(({ drafts }) => ({
      drafts: [...drafts, draft].slice(-KEPT),
      shown: draft.id,
    }));
  }

  markSaved(id: string, savedAs: string): void {
    this.state.setState(({ drafts }) => ({
      drafts: drafts.map((draft) => (draft.id === id ? { ...draft, savedAs } : draft)),
    }));
  }

  /** Takes the shown draft off the chat. It stays known to the agent. */
  dismiss(): void {
    this.state.setState({ shown: null });
  }

  /** Another deck is open: the drafts were drawn with the old deck's assets. */
  clear(): void {
    this.state.setState({ drafts: [], shown: null });
  }
}
