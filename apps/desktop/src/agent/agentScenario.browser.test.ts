/**
 * The M2 scenario end to end, minus the harness process and the shell: the real `AgentService`
 * drives a scripted agent (the scripts the Rust mock plays), whose tool calls run through the
 * Deck API with the real conversion engine and the real lint service, in a real browser. These
 * are WG10's acceptance scenarios: a slide made from HTML and the turn undone, and a turn that
 * ends with overflowing text, which the design check sends back until the slide is valid.
 */
import { createDeckApi, type CaptureService, type LintFinding } from '@slidr/agent-tools';
import { createConversionService } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { CommandBus, createDeck, findSlide } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import deckBuild from '../../src-tauri/src/harness/fixtures/scripts/deck-build.json';
import gateStuck from '../../src-tauri/src/harness/fixtures/scripts/gate-stuck.json';
import qualityGate from '../../src-tauri/src/harness/fixtures/scripts/quality-gate.json';
import { createLintService } from '../lint/deckLint';
import { AgentService, type ChatThread } from './agentService';
import { holdsTurn } from './qualityGate';
import { createScriptedAgent, type Script } from './scriptedAgent';
import { memoryTranscripts, type AssistantEntry, type GatePart, type ToolPart } from './transcript';

const SCRIPTS: Record<string, Script> = {
  'deck-build': deckBuild,
  'quality-gate': qualityGate,
  'gate-stuck': gateStuck,
};

/** A capture service that answers with a picture of nothing: the gate counts looks, not pixels. */
const capture: CaptureService = {
  renderSlide: (_deck, _slideId, { width }) =>
    Promise.resolve({
      mimeType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/PNQAAAABJRU5ErkJggg==',
      width,
      height: Math.round((width * 9) / 16),
    }),
  renderContactSheet: () => Promise.reject(new Error('not in this test')),
};

/** A deck chat as the app sets it up, on the script named by `model`. */
function chat(model: string) {
  const host = testHost();
  const bus = new CommandBus(createDeck({ lang: 'he', dir: 'rtl' }), { validate: true });
  const lint = createLintService(host.resolveAsset);
  const api = createDeckApi(bus, {
    conversion: createConversionService(host),
    lint,
    capture,
  });
  const agent = createScriptedAgent(SCRIPTS, { speed: 0 });
  const service = new AgentService({
    client: agent.client,
    connectBridge: agent.connectBridge,
    bus,
    api,
    lint,
    selection: () => ({
      currentSlideId: bus.deck.slides[0]?.id ?? null,
      selectedSlideIds: [],
      selectedElementIds: [],
      editingElementId: null,
    }),
    transcripts: memoryTranscripts(),
    settings: () => ({ harnessId: 'mock', model }),
  });
  return { bus, lint, service, thread: service.thread({ kind: 'deck' }) };
}

/** Resolves when the thread's turn, with every round of the design check, has ended. */
function settled(thread: ChatThread): Promise<void> {
  return new Promise((resolve) => {
    if (!thread.store.getState().busy) return resolve();
    const stop = thread.store.subscribe((state) => {
      if (state.busy) return;
      stop();
      resolve();
    });
  });
}

const assistants = (thread: ChatThread) =>
  thread.store.getState().entries.filter((e): e is AssistantEntry => e.type === 'assistant');
const tools = (entry: AssistantEntry) =>
  entry.parts.filter((p): p is ToolPart => p.type === 'tool');
const gates = (entry: AssistantEntry) =>
  entry.parts.filter((p): p is GatePart => p.type === 'gate');
const rules = (findings: readonly LintFinding[]) => [...new Set(findings.map((f) => f.rule))];

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('the deck chat, through AgentService', () => {
  it('builds a slide from HTML, and "undo the changes" takes the turn back', async () => {
    const { bus, service, thread } = chat('deck-build');
    await thread.send('צור שקף פתיחה');
    await settled(thread);

    const [entry] = assistants(thread);
    expect(entry?.outcome, JSON.stringify(entry?.problem)).toBe('completed');
    expect(bus.deck.slides).toHaveLength(1);
    const slide = bus.deck.slides[0]!;
    expect(slide.archetype).toBe('hero');
    expect(slide.name).toBe('פתיחה');
    expect(slide.elements.map((e) => e.type).sort()).toEqual([
      'shape',
      'shape',
      'text',
      'text',
      'text',
    ]);

    // One chip, finished, pointing at the slide it made; and the reply around it.
    const [chip] = tools(entry!);
    expect(chip).toMatchObject({
      name: 'slide_create_from_html',
      state: 'ok',
      target: { slideId: slide.id },
    });
    expect(entry!.parts.at(-1)).toMatchObject({ type: 'text' });
    // A slide that passes the design check holds nothing open.
    expect(gates(entry!), JSON.stringify(gates(entry!))).toEqual([]);
    expect(entry!.remaining).toBeUndefined();

    // The turn is one undo step, and undoing it restores the deck.
    expect(service.undoInfo(entry!.txId!)).toEqual({ steps: 1, otherEdits: 0 });
    expect(service.undoTurn(entry!.txId!)).toBe(true);
    expect(bus.deck.slides).toHaveLength(0);
    expect(service.undoInfo(entry!.txId!)).toBeUndefined();
  });

  it('carries ids from one turn into the next, and warns before undoing over a user edit', async () => {
    const { bus, service, thread } = chat('deck-build');
    await thread.send('צור שקף פתיחה');
    await settled(thread);
    await thread.send('הוסף שקף עם המספר המרכזי');
    await settled(thread);

    const [first, second] = assistants(thread);
    // Speaker notes written after the render do not change the picture: nothing to look at
    // again, and the slide itself passes the design check.
    expect(gates(second!), JSON.stringify(gates(second!))).toEqual([]);
    expect(bus.deck.slides.map((s) => s.archetype)).toEqual(['hero', 'bigNumber']);
    expect(bus.deck.slides[1]!.notes).toBeDefined();
    expect(tools(second!).map((t) => [t.name, t.state])).toEqual([
      ['slide_create_from_html', 'ok'],
      ['slide_update', 'ok'],
    ]);

    // The user renames the first slide; undoing the first turn would take that along.
    bus.dispatch({ type: 'slide.update', slideId: bus.deck.slides[0]!.id, patch: { name: 'x' } });
    expect(service.undoInfo(first!.txId!)).toEqual({ steps: 3, otherEdits: 2 });
    expect(service.undoInfo(second!.txId!)).toEqual({ steps: 2, otherEdits: 1 });
    expect(service.undoTurn(second!.txId!)).toBe(true);
    expect(bus.deck.slides.map((s) => s.archetype)).toEqual(['hero']);
  });

  it('sends back a turn that ends with overflowing text, until the slide is valid', async () => {
    const { bus, lint, service, thread } = chat('quality-gate');
    await thread.send('צור שקף פתיחה');
    await settled(thread);

    const [entry] = assistants(thread);
    expect(entry?.outcome, JSON.stringify(entry?.problem)).toBe('completed');
    // One follow-up, for the text that runs off the slide.
    const sent = gates(entry!);
    expect(sent.map((g) => g.round)).toEqual([1]);
    expect(rules(sent[0]!.findings)).toContain('L02');
    // The render that came back with the write counted as a look (QG-01).
    expect(sent[0]!.unseen).toEqual([]);

    // The agent fixed the slide in place, and nothing is left for the user.
    expect(tools(entry!).map((t) => [t.name, t.state])).toEqual([
      ['slide_create_from_html', 'ok'],
      ['slide_replace_from_html', 'ok'],
    ]);
    expect(entry!.remaining).toBeUndefined();
    expect(bus.deck.slides).toHaveLength(1);
    const slideId = bus.deck.slides[0]!.id;
    expect(tools(entry!)[0]!.target).toEqual({ slideId });
    const left = await lint.lint(bus.deck, [slideId], 'agent');
    expect(left.filter(holdsTurn), JSON.stringify(left)).toEqual([]);

    // The turn and its follow-up are one undo step.
    expect(service.undoInfo(entry!.txId!)).toEqual({ steps: 1, otherEdits: 0 });
    expect(service.undoTurn(entry!.txId!)).toBe(true);
    expect(findSlide(bus.deck, slideId)).toBeUndefined();
  });

  it('gives up after two rounds, shows what is left, and fixes it when asked again', async () => {
    const { bus, lint, thread } = chat('gate-stuck');
    await thread.send('צור שקף פתיחה');
    await settled(thread);

    const [entry] = assistants(thread);
    expect(entry?.outcome).toBe('completed');
    expect(gates(entry!).map((g) => g.round)).toEqual([1, 2]);
    expect(rules(entry!.remaining?.findings ?? [])).toContain('L02');

    await thread.retryFixes(entry!.id);
    await settled(thread);
    const [, retry] = assistants(thread);
    expect(retry?.outcome).toBe('completed');
    // The retry is a turn of the app's own: it opens with the follow-up, and has no user entry.
    expect(retry!.parts[0]).toMatchObject({ type: 'gate', round: 1 });
    expect(thread.store.getState().entries.filter((e) => e.type === 'user')).toHaveLength(1);
    expect(retry!.remaining).toBeUndefined();
    const left = await lint.lint(bus.deck, [bus.deck.slides[0]!.id], 'agent');
    expect(left.filter(holdsTurn), JSON.stringify(left)).toEqual([]);
  });
});
