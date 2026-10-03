/**
 * The agent of an editing window: the Deck API over the editor's bus with the services the app
 * has (ADR-026, ADR-027), and the `AgentService` on top of it. One per editor, made when the
 * first AI panel asks for it; nothing agent-related runs before that.
 */
import { createDeckApi, type Services } from '@slidr/agent-tools';
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
import { memoryTranscripts, workspaceTranscripts, type ToolTarget } from '../agent/transcript';
import { createCaptureService } from '../capture/deckCapture';
import { createAppImages } from '../images/appImages';
import { createLintService } from '../lint/deckLint';
import type { Editor } from '../shell';
import { createLayoutService } from '../templates/layoutService';
import { createTemplateService } from '../templates/templateService';

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

/** Where the agent's settings are kept until the settings screen exists (WG3-T08). */
const SETTINGS_KEY = 'slidr.agent';

interface StoredSettings extends AgentSettings {
  /** A plain browser page only: how fast the scripted agent plays (1 = as recorded). */
  mockSpeed?: number;
}

/**
 * The agent's settings: harness, model, effort, web access, the design check. There is no
 * screen for them yet, so they are read from `localStorage` (`slidr.agent`, a JSON object) and
 * the defaults stand when it is absent: the first harness the app offers, on its own default
 * model, with web access and the design check on.
 */
export function agentSettings(): StoredSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return typeof stored === 'object' && stored !== null ? stored : {};
  } catch {
    return {};
  }
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
      send: async (...args) => (await loaded).client.send(...args),
      interrupt: async (id) => (await loaded).client.interrupt(id),
      close: async (id) => (await loaded).client.close(id),
    },
    connectBridge: async (handler: ToolHandler): Promise<ToolBridge> =>
      (await loaded).connectBridge(handler),
  };
}

function createAgent(editor: Editor): AgentService {
  const inApp = isTauri();
  const workspaceId = () => editor.document?.workspace?.id ?? null;
  const images = createAppImages(editor.document, editor.assets);
  const lint = createLintService((asset) => editor.assets.url(asset));
  const selection = () => {
    const { currentSlideId, selectedSlideIds, selectedElementIds, editingElementId } =
      editor.selection.getState();
    return { currentSlideId, selectedSlideIds, selectedElementIds, editingElementId };
  };

  // Every service the app has today (ADR-011). `icons`, `stock` and `options` are not built.
  const services: Services = {
    ui: {
      selection,
      navigate: ({ slideId, elementIds }) =>
        navigateTo(editor, { slideId, ...(elementIds ? { elementIds: [...elementIds] } : {}) }),
    },
    lint,
    layouts: createLayoutService(),
    // The built-in templates are WG7-T04; until then the library is empty.
    templates: createTemplateService({ builtIn: [] }),
    images: images.service,
    // A plain browser page has no capture window: it converts in the page, unguarded, and
    // answers captures with a blank picture, so the agent's tools are the app's.
    capture: inApp ? createCaptureService(workspaceId) : pageCapture(),
    conversion: inApp ? captureWindowConversion(workspaceId) : pageConversion(editor.assets),
  };
  const api = createDeckApi(editor.bus, services);
  const harness = inApp ? { client: tauriAgent, connectBridge: connectToolBridge } : pageHarness();

  return new AgentService({
    ...harness,
    bus: editor.bus,
    api,
    lint,
    selection,
    transcripts: inApp ? workspaceTranscripts(workspaceId) : memoryTranscripts(),
    settings: agentSettings,
    onSlideTouched: (slideId) => {
      // Not while the user is typing into a text box: moving the Stage would end their edit.
      if (!useAiPreferences.getState().follow) return;
      if (editor.selection.getState().editingElementId !== null) return;
      editor.selection.getState().setCurrentSlide(slideId);
    },
    onInterrupt: () => void images.service.cancel(),
  });
}

const agents = new WeakMap<Editor, AgentService>();

/** The agent of an editor. */
export function agentOf(editor: Editor): AgentService {
  let agent = agents.get(editor);
  if (!agent) {
    agent = createAgent(editor);
    agents.set(editor, agent);
  }
  return agent;
}
