/**
 * The M2 path without a harness and without the shell: what happens between an agent's tool call
 * and the answer it reads. The Deck API runs with the real conversion engine and the real lint
 * service, the system prompt is built from the tool list the bridge would publish, and every
 * call goes through the bridge's reply mapping, so what is asserted is what the agent would get.
 */
import { createDeckApi, startTurn, type SessionScope } from '@slidr/agent-tools';
import { createConversionService } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import {
  ChangeDigest,
  CommandBus,
  createDeck,
  findSlide,
  plainText,
  type TextElement,
} from '@slidr/model';
import { contextBlock, systemPrompt } from '@slidr/prompts';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createLintService } from '../lint/deckLint';
import { toReply, type BridgeTool, type ToolHandler } from './toolBridge';

const SESSION = 'sess_deck';
const SCOPE: SessionScope = { kind: 'deck' };

/** A deck session as `AgentService` will set it up (WG11), minus the process on the other end. */
function session() {
  const host = testHost();
  const bus = new CommandBus(createDeck({ lang: 'he', dir: 'rtl' }), { validate: true });
  const api = createDeckApi(bus, {
    conversion: createConversionService(host),
    lint: createLintService(host.resolveAsset),
  });
  const digest = new ChangeDigest(bus);
  digest.track(SESSION);
  const turn = startTurn(SESSION, SCOPE);
  const handler: ToolHandler = (_sessionKey, name, input) => api.call(turn, name, input);
  /** One tool call as the agent sees it: the reply's JSON text. */
  const call = async (name: string, input: unknown) => {
    const reply = toReply(await handler(SESSION, name, input));
    const first = reply.content[0];
    const text = first?.type === 'text' ? first.text : '';
    return { isError: reply.isError, text };
  };
  return { api, bus, digest, turn, call };
}

interface WriteData {
  slideId: string;
  editability: number;
  notes: string[];
  lint: { rule: string; severity: string; message: string }[];
}

const written = (text: string) => JSON.parse(text) as WriteData;

const GOOD = `<div data-archetype="bigNumber" dir="rtl" lang="he" style="position:relative;width:1920px;height:1080px;background:var(--color-bg);font-family:var(--font-body)">
  <div data-name="card" style="position:absolute;left:96px;top:80px;width:1728px;height:920px;border-radius:32px;background:var(--color-surface)"></div>
  <h1 data-role="title" style="position:absolute;right:176px;top:160px;margin:0;font-size:80px;line-height:1.2;color:var(--color-text);font-family:var(--font-heading)">צמיחה בהכנסות</h1>
  <div data-role="number" style="position:absolute;right:176px;top:330px;font-size:240px;line-height:1;font-weight:800;color:var(--color-primary)">87%</div>
  <p data-role="body" style="position:absolute;right:176px;top:660px;width:1100px;margin:0;font-size:36px;line-height:1.5;color:var(--color-text)">גידול שנתי לעומת 2025, בכל שלושת קווי המוצר.</p>
</div>`;

const FLAWED = `<div style="position:relative;width:1920px;height:1080px;background:#ffffff">
  <p style="position:absolute;left:200px;top:200px;margin:0;font-size:18px;color:#d9d9d9;font-family:Arial,sans-serif">Small print nobody at the back of the room will read</p>
</div>`;

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('a deck session that writes slides as HTML', () => {
  it('is told about exactly the tools it can call, and how to write for them', () => {
    const { api } = session();
    const tools = api.list(SCOPE.kind);
    // The Deck API's listing is what the bridge publishes for the session, as it is.
    const published: readonly BridgeTool[] = tools;
    const names = published.map((tool) => tool.name);
    const prompt = systemPrompt({ scope: SCOPE.kind, tools: names });

    expect(names).toEqual(expect.arrayContaining(['slide_create_from_html', 'slide_lint']));
    expect(prompt).toContain('`slide_create_from_html`');
    expect(prompt).toContain('## Writing a slide as HTML');
    expect(prompt).toContain('- **The design check.**');
    // No capture service in this session, so the prompt does not send the agent to a tool
    // it does not have.
    expect(names).not.toContain('slide_render');
    expect(prompt).not.toContain('slide_render');
  });

  it('turns a well-made slide into editable elements linked to the theme', async () => {
    const { bus, call } = session();
    const { isError, text } = await call('slide_create_from_html', { html: GOOD, name: 'מספר' });
    expect(isError, text).toBe(false);
    const data = written(text);

    expect(data.editability).toBe(1);
    const slide = findSlide(bus.deck, data.slideId)!;
    expect(slide.archetype).toBe('bigNumber');
    expect(slide.background).toEqual({ fill: { kind: 'solid', color: { token: 'bg' } } });
    expect(slide.elements.map((e) => e.type).sort()).toEqual(['shape', 'text', 'text', 'text']);

    const texts = slide.elements.filter((e): e is TextElement => e.type === 'text');
    const number = texts.find((t) => plainText(t.content) === '87%')!;
    expect(number.role).toBe('number');
    expect(number.content.paragraphs[0]!.runs[0]!.marks).toMatchObject({
      color: { token: 'primary' },
    });
    expect(texts.every((t) => t.content.paragraphs[0]!.dir === 'rtl')).toBe(true);

    // The design check ran on the new slide, and has nothing at error level to send back.
    expect(data.lint.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('sends a weak slide back with findings the agent can act on', async () => {
    const { call } = session();
    const { text } = await call('slide_create_from_html', { html: FLAWED });
    const { lint } = written(text);
    const rules = lint.map((finding) => finding.rule);

    // Under 24px, too faint on white, nearly all of the slide empty, and nothing but text.
    expect(rules).toEqual(expect.arrayContaining(['L04', 'L05', 'L07', 'L16']));
    expect(lint.find((finding) => finding.rule === 'L05')).toMatchObject({ severity: 'error' });
    expect(lint.find((finding) => finding.rule === 'L04')!.message).toMatch(/18/);
  });

  it('keeps a turn one undo step, and tells the next turn what the user changed', async () => {
    const { bus, digest, turn, call } = session();
    const first = written((await call('slide_create_from_html', { html: GOOD })).text);
    await call('slide_create_from_html', { html: FLAWED });
    expect(bus.deck.slides).toHaveLength(2);

    // The agent's own writes are not news to it.
    const own = digest.take(SESSION);
    expect([own.slides, own.elements, own.slideOrder]).toEqual([[], [], false]);

    // The user nudges an element between turns.
    const slide = findSlide(bus.deck, first.slideId)!;
    const moved = slide.elements[0]!;
    bus.dispatch({
      type: 'element.update',
      slideId: slide.id,
      elementId: moved.id,
      patch: { frame: { ...moved.frame, x: moved.frame.x + 8 } },
    });
    const block = contextBlock({
      scope: SCOPE,
      deck: bus.deck,
      selection: {
        currentSlideId: slide.id,
        selectedSlideIds: [slide.id],
        selectedElementIds: [],
        editingElementId: null,
      },
      changes: digest.take(SESSION),
    });
    expect(block).toMatch(/^<slidr_context>/);
    expect(block).toContain(
      `changed_since_last_turn: {"slides":["${slide.id}"],"elements":["${moved.id}"]}`,
    );

    // "Undo the changes" of the chat: the whole turn, and the user's edit inside it, go.
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 2, otherEdits: 1 });
    expect(bus.undoTransaction(turn.txId)).toBe(true);
    expect(bus.deck.slides).toHaveLength(0);
  });
});
