import { create } from 'zustand';
import type { AgentSettings } from '../agent/agentService';
import { replaceSection, useSettings } from './store';

/*
 * The agent's settings (AGT-04): harness, model, effort, web access, the design check and
 * "outline first". Two levels:
 *
 *   - the app's: the section `agent` of the settings file. The agent's part of the settings
 *     screen writes it, and it is what every conversation runs with until it says otherwise;
 *   - a conversation's own model and effort, chosen in the picker of its chat. They hold for
 *     that conversation while the window is open, and do not touch the app's.
 *
 * A session reads them when it starts and at the start of every turn, without waiting: the
 * store of the settings holds the section, and `replaceSection` puts a change there at once.
 */

const SECTION = 'agent';

/**
 * Where these settings were kept before the settings file had them: one JSON object in
 * `localStorage`. A value found there is taken into the file and removed (`adopt`).
 */
const LEGACY_KEY = 'slidr.agent';

export interface StoredAgentSettings extends AgentSettings {
  /** A plain browser page only: how fast the scripted agent plays (1 = as recorded). */
  mockSpeed?: number;
}

/** What a conversation may choose for itself. */
export type ConversationSettings = Pick<AgentSettings, 'model' | 'effort'>;

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const flag = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

/** The settings in a stored value: the fields this version knows, each of the type it has. */
function parse(value: unknown): StoredAgentSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY;
  const stored = value as Record<string, unknown>;
  const found = {
    harnessId: text(stored.harnessId),
    model: text(stored.model),
    effort: text(stored.effort),
    webAccess: flag(stored.webAccess),
    qualityGate: flag(stored.qualityGate),
    outline: stored.outline === 'first' || stored.outline === 'build' ? stored.outline : undefined,
    mockSpeed: typeof stored.mockSpeed === 'number' ? stored.mockSpeed : undefined,
  };
  return Object.fromEntries(Object.entries(found).filter(([, field]) => field !== undefined));
}

const EMPTY: StoredAgentSettings = Object.freeze({});

let last: { section: unknown; settings: StoredAgentSettings } = {
  section: undefined,
  settings: EMPTY,
};

/** The section as the store holds it now, parsed once for each value it had. */
function stored(): StoredAgentSettings {
  const section = useSettings.getState().sections[SECTION];
  if (section !== last.section) last = { section, settings: parse(section) };
  return last.settings;
}

/**
 * Takes a value an earlier version left in `localStorage` into the settings file, and removes
 * it from there. It is the whole of the settings, as it was then, so it replaces the section.
 *
 * Looked for when the app starts, which is the one time a user's own value is found; and
 * whenever a session reads its settings, because the suites and scripts that drive the app set
 * the agent this way in the middle of a run (`packaged/*.spec.ts`, `eval/page.ts`).
 */
function adopt(): void {
  let legacy: string | null;
  try {
    legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === null) return;
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // No storage to look in: nothing was kept there.
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(legacy);
  } catch {
    return;
  }
  write(parse(value));
}

function write(settings: StoredAgentSettings): void {
  const value = Object.keys(settings).length > 0 ? { ...settings } : null;
  replaceSection(SECTION, value).catch((error: unknown) => {
    console.error("The agent's settings could not be saved to the settings file", error);
  });
}

/** What each conversation chose for itself, by the id of its thread. Gone with the window. */
const conversations = create<Record<string, ConversationSettings>>(() => ({}));

/**
 * The settings a session runs with: the app's, and over them what the conversation chose for
 * itself. Without a thread, the app's alone. The defaults stand for what is absent: the first
 * harness the app offers, on its own default model, with web access and the design check on.
 */
export function agentSettings(threadId?: string): StoredAgentSettings {
  adopt();
  const own = threadId === undefined ? undefined : conversations.getState()[threadId];
  return own ? { ...stored(), ...own } : stored();
}

/**
 * Changes some of the app's settings. A value of `undefined` clears the setting, so its default
 * stands again. Another harness has other models and other effort levels: what conversations
 * chose on the one before is dropped with it.
 */
export function setAgentSettings(patch: Partial<StoredAgentSettings>): void {
  adopt();
  const before = stored();
  const next = parse({ ...before, ...patch });
  if (next.harnessId !== before.harnessId) conversations.setState({}, true);
  write(next);
}

/**
 * Changes what a conversation chose for itself: its model, its effort. `undefined` gives the
 * choice back to the app's setting. The app's own settings are not touched.
 */
export function setConversationSettings(threadId: string, patch: ConversationSettings): void {
  const next = Object.fromEntries(
    Object.entries({ ...conversations.getState()[threadId], ...patch }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as ConversationSettings;
  conversations.setState((state) => {
    const rest = Object.fromEntries(Object.entries(state).filter(([id]) => id !== threadId));
    return Object.keys(next).length > 0 ? { ...rest, [threadId]: next } : rest;
  }, true);
}

/** The app's settings, for a component that shows them. */
export function useAgentSettings(): StoredAgentSettings {
  useSettings((state) => state.sections[SECTION]);
  return stored();
}

const NO_CHOICE: ConversationSettings = Object.freeze({});

/** What a conversation chose for itself, for the picker of its chat; nothing without a thread. */
export function useConversationSettings(threadId: string | null): ConversationSettings {
  return conversations((state) => (threadId === null ? undefined : state[threadId])) ?? NO_CHOICE;
}

// A value from before the settings file is looked for as the app starts, before anything draws.
adopt();
