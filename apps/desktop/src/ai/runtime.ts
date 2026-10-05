/**
 * The agent of an editing window: the Deck API over the editor's bus with the services the app
 * has (ADR-026, ADR-027), and the `AgentService` on top of it. One per editor, made when the
 * first AI panel asks for it; nothing agent-related runs before that.
 */
import { createDeckApi, type DeckApi, type ScopeKind, type Services } from '@slidr/agent-tools';
import { findSlide, locateElement } from '@slidr/model';
import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AgentClient } from '../agent/agent';
import { AgentService, type AgentSettings } from '../agent/agentService';
import { captureWindowConversion, pageConversion } from '../agent/conversion';
import { pageCapture } from '../agent/pageCapture';
import { connectToolBridge, tauriAgent } from '../agent/tauriAgent';
import type { ToolBridge, ToolHandler } from '../agent/toolBridge';
import {
  memoryTranscripts,
  workspaceTranscripts,
  type ToolTarget,
  type TranscriptStore,
} from '../agent/transcript';
import { createCaptureService } from '../capture/deckCapture';
import { createAppImages, type AppImages } from '../images/appImages';
import { createImporter } from '../import/session';
import { createLintService } from '../lint/deckLint';
import { mediaServices } from '../media/services';
import type { Editor } from '../shell';
import { createLayoutService } from '../templates/layoutService';
import { followDirection } from '../templates/actions';
import { appTemplateService, library } from '../templates/app';
import { editorFor } from '../text/activeEditor';
import { textSelectionOf } from '../text/selectedText';
import { createGallery, type Gallery } from './variations';
import { createSessions, type Sessions } from './sessions';

/** What the user chose for the AI panels. Kept per machine, like the shell's own layout. */
interface AiPreferences {
  /** The Stage shows the slide the agent is working on (AID-06). */
  follow: boolean;
}

export const useAiPreferences = create<AiPreferences>()(
  persist((): AiPreferences => ({ follow: true }), {
    name: 'slidr.ai',
    version: 1,
    storage: createJSONStorage(() => localStorage),
  }),
);

export function setFollow(follow: boolean): void {
  useAiPreferences.setState({ follow });
}

/** Where the agent's settings are kept: the agent's section of the settings screen writes them too. */
const SETTINGS_KEY = 'slidr.agent';

interface StoredSettings extends AgentSettings {
  /** A plain browser page only: how fast the scripted agent plays (1 = as recorded). */
  mockSpeed?: number;
}

/**
 * The agent's settings: harness, model, effort, web access, the design check. The agent's section
 * of the settings screen (`src/settings/AgentSection.tsx`) and the chat's picker show them; they
 * are kept in `localStorage` (`slidr.agent`, a JSON object), not yet in `settings.json`, and the
 * defaults stand when it is absent: the first harness the app offers, on its own default model,
 * with web access and the design check on.
 */
export function agentSettings(): StoredSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return typeof stored === 'object' && stored !== null ? stored : {};
  } catch {
    return {};
  }
}

/** Counts the changes to the agent's settings, so that whoever shows them draws again. */
const settingsChanges = create(() => ({ count: 0 }));

/**
 * Changes some of the agent's settings, where they are kept (`slidr.agent`): the picker of the
 * chat and the agent's section of the settings screen. A value of `undefined` clears the setting,
 * so its default stands again. A session reads them when it starts and at every turn's start.
 */
export function setAgentSettings(patch: Partial<StoredSettings>): void {
  const next = Object.fromEntries(
    Object.entries({ ...agentSettings(), ...patch }).filter(([, value]) => value !== undefined),
  );
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Not remembered: the choice cannot hold without storage.
  }
  settingsChanges.setState(({ count }) => ({ count: count + 1 }));
}

/** The agent's settings, for a component that shows them. */
export function useAgentSettings(): StoredSettings {
  settingsChanges((state) => state.count);
  return agentSettings();
}

/** Shows a slide on the Stage and, when given, selects elements on it. */
export function navigateTo(editor: Editor, target: ToolTarget): void {
  const deck = editor.bus.deck;
  const elementIds = target.elementIds ?? [];
  const slide =
    (target.slideId ? findSlide(deck, target.slideId) : undefined) ??
    deck.slides.find((s) => elementIds.some((id) => locateElement(s.elements, id)));
  if (!slide) return;
  const selection = editor.selection.getState();
  selection.setCurrentSlide(slide.id);
  const present = elementIds.filter((id) => locateElement(slide.elements, id));
  if (present.length > 0) selection.selectElements(present);
}

/**
 * The harness client and tool bridge of a page without Rust: the scripted mock, loaded when it
 * is first needed, and only in development. The scripts never reach the app's bundle.
 */
function pageHarness(): { client: AgentClient; connectBridge: typeof connectToolBridge } {
  const loaded = import.meta.env.DEV
    ? import('../agent/pageAgent').then((m) => m.pageAgent(agentSettings().mockSpeed ?? 1))
    : Promise.reject(new Error('This page has no agent harness.'));
  // An unused harness must not report an unhandled rejection.
  loaded.catch(() => undefined);
  return {
    client: {
      harnesses: async () => (await loaded).client.harnesses(),
      probe: async (id) => (await loaded).client.probe(id),
      start: async (...args) => (await loaded).client.start(...args),
      attach: async (...args) => (await loaded).client.attach(...args),
      send: async (...args) => (await loaded).client.send(...args),
      interrupt: async (id) => (await loaded).client.interrupt(id),
      close: async (id) => (await loaded).client.close(id),
    },
    connectBridge: async (handler: ToolHandler): Promise<ToolBridge> =>
      (await loaded).connectBridge(handler),
  };
}

/** The AI side of an editing window: what the AI panel works with. */
export interface AiRuntime {
  agent: AgentService;
  /** The variations gallery: options the agent offers, and images as they are made (T08). */
  gallery: Gallery;
  /** The image providers, for asking whether one can generate before offering it (ADR-025). */
  images: AppImages;
  /** The chats the panels have open, and which of them are working. */
  sessions: Sessions;
  /** The names of the tools a session of a scope can call: an action that needs more is not offered. */
  tools: (scope: ScopeKind) => ReadonlySet<string>;
}

function createAi(editor: Editor): AiRuntime {
  const inApp = isTauri();
  const workspaceId = () => editor.document?.workspace?.id ?? null;
  // A plain browser page has no capture window: it converts in the page, unguarded, and
  // answers captures with a blank picture, so the agent's tools are the app's.
  const conversion = inApp ? captureWindowConversion(workspaceId) : pageConversion(editor.assets);
  const gallery = createGallery({ bus: editor.bus, selection: editor.selection, conversion });
  // The gallery hears the image jobs of the agent's tools, and shows each image as it lands.
  const images = createAppImages(
    editor.document,
    editor.assets,
    gallery.imageEvent,
    (id) => editor.bus.deck.assets[id],
  );
  const lint = createLintService((asset) => editor.assets.url(asset));
  // What the user has selected, read when a turn starts and by `selection_get`: with the words
  // selected in the text being edited, which the text editor holds (ADR-072).
  const selection = () => {
    const { currentSlideId, selectedSlideIds, selectedElementIds, editingElementId } =
      editor.selection.getState();
    const textSelection = textSelectionOf(editorFor(editingElementId));
    return {
      currentSlideId,
      selectedSlideIds,
      selectedElementIds,
      editingElementId,
      textSelection,
    };
  };

  const capture = inApp ? createCaptureService(workspaceId) : pageCapture();

  // Every service the app has today (ADR-011), one to a line.
  const services: Services = {
    // Stock photos and the icon library (ADR-051).
    ...mediaServices(editor),
    ui: {
      selection,
      navigate: ({ slideId, elementIds }) =>
        navigateTo(editor, { slideId, ...(elementIds ? { elementIds: [...elementIds] } : {}) }),
    },
    lint,
    layouts: createLayoutService(),
    // Drafting a template converts its layouts, lints them and takes their picture.
    templates: appTemplateService(editor, { conversion, lint, capture }),
    images: images.service,
    options: gallery.service,
    capture,
    conversion,
    // The isolated page of an HTML import (SPEC 13.2); its tools exist in import sessions only.
    importer: createImporter(editor),
  };
  const deckApi = createDeckApi(editor.bus, services);
  // Every call passes the gallery on its way in: it knows whose images are about to be made,
  // and turns back a call for images that are being made already.
  const api: DeckApi = {
    ...deckApi,
    call: async (turn, name, input) => {
      const refusal = gallery.refusal(turn.scope, name, input);
      if (refusal) return { ok: false, error: { code: 'invalid_state', message: refusal } };
      gallery.noteToolCall(turn.scope, name, input);
      const from = editor.bus.deck.meta.dir;
      const result = await deckApi.call(turn, name, input);
      // The agent turns a deck by setting its direction. The layouts of its template are drawn
      // for one direction, so they turn with it, in the same undo step.
      const follow = followDirection(editor.bus.deck, from, library);
      if (follow.length > 0) editor.bus.batch(follow, { actor: turn.actor, txId: turn.txId });
      return result;
    },
  };
  const harness = inApp ? { client: tauriAgent, connectBridge: connectToolBridge } : pageHarness();

  // The conversations of the chat are kept with the document (AID-01). Conversations of the
  // slide and object chats of earlier versions stay in the file, and are not shown (ADR-072).
  const transcripts: TranscriptStore = inApp
    ? workspaceTranscripts(workspaceId)
    : memoryTranscripts();

  const agent = new AgentService({
    ...harness,
    bus: editor.bus,
    api,
    lint,
    selection,
    transcripts,
    settings: agentSettings,
    // A picture sent with a message is kept with the document, so the agent can place it.
    storeImage: ({ name, mime, bytes }) =>
      editor.assets.import(new File([bytes.slice()], name, { type: mime })),
    onSlideTouched: (slideId) => {
      // Not while the user is typing into a text box: moving the Stage would end their edit.
      if (!useAiPreferences.getState().follow) return;
      if (editor.selection.getState().editingElementId !== null) return;
      editor.selection.getState().setCurrentSlide(slideId);
    },
    onInterrupt: () => void images.service.cancel(),
  });

  const names = new Map<ScopeKind, ReadonlySet<string>>();
  const tools = (scope: ScopeKind) => {
    let known = names.get(scope);
    if (!known) {
      known = new Set(deckApi.list(scope).map((tool) => tool.name));
      names.set(scope, known);
    }
    return known;
  };

  return { agent, gallery, images, sessions: createSessions(agent), tools };
}

const runtimes = new WeakMap<Editor, AiRuntime>();

/** The AI side of an editor. */
export function aiOf(editor: Editor): AiRuntime {
  let ai = runtimes.get(editor);
  if (!ai) {
    ai = createAi(editor);
    runtimes.set(editor, ai);
  }
  return ai;
}

/** The agent of an editor. */
export function agentOf(editor: Editor): AgentService {
  return aiOf(editor).agent;
}
