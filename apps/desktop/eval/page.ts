/**
 * The evaluation set's hands inside the app's window. The runner (`scripts/run.mjs`) connects to
 * the real Tauri window over CDP, imports this module from the dev server (`/eval/page.ts`) and
 * calls `window.slidrEval`. Everything here goes through what the app itself uses: the editor's
 * document service, the deck chat's thread, the capture window, the lint service.
 *
 * Development builds only: it needs `window.slidr`.
 */
import type { LintFinding, ToolResult } from '@slidr/agent-tools';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  slideFromLayout,
  type Deck,
  type Paragraph,
  type Slide,
} from '@slidr/model';
import { applyTemplate, deckFromTemplate } from '@slidr/templates';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import type { AgentSettings } from '../src/agent/agentService';
import type { ChatEntry } from '../src/agent/transcript';
import { agentOf } from '../src/ai/runtime';
import { captureSlide } from '../src/capture/client';
import { createLintService } from '../src/lint/deckLint';
import { newDeck, syncFileState, type Editor } from '../src/shell/editor';
import { library } from '../src/templates/app';
import { scoreRequest, toolRecord, type RequestScore, type ToolRecord } from './metrics';

export interface PrepareOptions {
  /** Written to `slidr.agent`: the harness model, web access, the design check. */
  settings: AgentSettings;
  /** The image provider jobs use when they name none (`mock` while iterating). */
  imageProvider: string;
  /** A deck to start from; absent for the app's own new deck. */
  base?: 'warehouse';
  /**
   * The template of the library the deck starts on, as if the user had made it their default:
   * its theme, its layouts and an opening slide. Absent for the plain deck of the base theme.
   */
  template?: string;
}

export interface Status {
  /** The chat was read from the deck and can take a message. */
  ready: boolean;
  busy: boolean;
  activity: string | null;
  /** Assistant entries so far. */
  turns: number;
  /** How the last turn ended; absent while it runs. */
  outcome?: string;
  /** The last turn changed the deck. */
  wrote: boolean;
  problem?: string;
  slides: number;
  /** Image jobs the agent's tools started in this request. */
  imageCalls: number;
}

export interface Collected {
  before: Deck | null;
  deck: Deck;
  entries: ChatEntry[];
  tools: ToolRecord[];
  findings: LintFinding[];
  score: RequestScore;
}

const IMAGE_TOOLS = new Set(['image_generate', 'image_edit']);

function editor(): Editor {
  if (!window.slidr) throw new Error('window.slidr is missing: this is not a development build.');
  return window.slidr;
}

const thread = () => agentOf(editor()).thread({ kind: 'deck' });

let tools: ToolRecord[] = [];
let before: Deck | null = null;
let tapped = false;

/** Keeps every tool call of the deck chat as the Deck API answered it. */
function tapTools(): void {
  if (tapped) return;
  tapped = true;
  const chat = thread();
  const call = chat.callTool.bind(chat);
  chat.callTool = async (name: string, input: unknown): Promise<ToolResult> => {
    const started = performance.now();
    const result = await call(name, input);
    tools.push(toolRecord(name, input, result, Math.round(performance.now() - started)));
    return result;
  };
}

const bullets = (lines: readonly string[]): Paragraph[] =>
  lines.map((text) => ({
    dir: 'auto',
    align: 'start',
    styleRef: 'body',
    list: { kind: 'bullet', level: 0 },
    runs: [{ text }],
  }));

const title = (text: string): Paragraph[] => [
  { dir: 'auto', align: 'start', styleRef: 'title', runs: [{ text }] },
];

function plainSlide(name: string, heading: string, lines: readonly string[]): Slide {
  return createSlide({
    name,
    elements: [
      createElement.text({
        frame: { x: 96, y: 80, w: 1728, h: 120 },
        content: { paragraphs: title(heading) },
        role: 'title',
      }),
      createElement.text({
        frame: { x: 96, y: 240, w: 1728, h: 720 },
        content: { paragraphs: bullets(lines) },
        role: 'body',
      }),
    ],
  });
}

/**
 * The deck the edit request starts from (AID-04): five slides as someone types them by hand, a
 * title and bullets each, with numbers on slide 3 and long sentences on slide 5.
 */
function warehouseDeck(): Deck {
  return createDeck({
    lang: 'he',
    title: 'פרויקט המעבר למחסן החדש',
    slides: [
      plainSlide('פתיחה', 'פרויקט המעבר למחסן החדש', ['סיכום והפקת לקחים', 'אוקטובר 2026']),
      plainSlide('מה תכננו', 'מה תכננו', [
        'מעבר מלא בתוך 6 שבועות',
        'בלי לעצור משלוחים אפילו ליום אחד',
        'תקציב של 1.2 מיליון ש"ח',
        'הטמעה של מערכת WMS חדשה',
      ]),
      plainSlide('מה קרה בפועל', 'מה קרה בפועל', [
        'משך המעבר: 9 שבועות (תוכנית: 6)',
        'עלות: 1.45 מיליון ש"ח (תקציב: 1.2)',
        'משלוחים שהתעכבו: 4% (יעד: 0%)',
        'דיוק המלאי אחרי המעבר: 99.2% (לפני: 96.5%)',
      ]),
      plainSlide('מה עבד טוב', 'מה עבד טוב', [
        'צוות משולב של לוגיסטיקה ו-IT מהיום הראשון',
        'מעבר בגלים, לפי קטגוריית מוצר',
        'הדרכה של כל המחסנאים לפני המעבר',
      ]),
      plainSlide('מה לא עבד', 'מה לא עבד', [
        'לא הערכנו נכון את הזמן שנדרש כדי לסרוק ולתייג מחדש את כל המלאי הישן, ולכן הגל הראשון התארך בשבועיים',
        'הספק של המדפים איחר באספקה, ולא היה לנו ספק חלופי שהוכן מראש',
        'הממשק בין ה-WMS למערכת ההזמנות נבדק רק בסביבת הבדיקות ולא בעומס אמיתי, והתגלו בו תקלות בשבוע הראשון',
      ]),
    ],
  });
}

/**
 * The deck a request starts from. With a template: a new deck is what the app opens on the
 * user's default template, and the deck of the edit request is the hand-typed deck after the
 * user switched it to the template, which changes its colours and fonts and gives it layouts.
 */
function startingDeck({ base, template: id }: PrepareOptions): Deck {
  const plain = base === 'warehouse' ? warehouseDeck() : undefined;
  if (!id) return plain ?? newDeck('he');
  const template = library.forDeck(id, 'he');
  if (!template) throw new Error(`The library has no template "${id}".`);
  if (plain) {
    const bus = new CommandBus(plain);
    bus.batch(applyTemplate(plain, template));
    return bus.deck;
  }
  const deck = deckFromTemplate(template, { lang: 'he' });
  const opening = deck.layouts[0];
  deck.slides = [opening ? slideFromLayout(deck, opening.id).slide : createSlide()];
  return deck;
}

/** The folder the app keeps its data in: the runner checks it before anything is written. */
export function dataDir(): Promise<string> {
  return appDataDir();
}

/**
 * A fresh document for one request, with the agent's settings and the image provider in place.
 * The document before it is closed, and so is whatever a killed run left behind: this is the
 * evaluation's own data folder.
 */
export async function prepare(options: PrepareOptions): Promise<{ deckId: string }> {
  const { document } = editor();
  if (!document) throw new Error('The evaluation set runs in the app, not in a plain browser.');
  localStorage.setItem('slidr.agent', JSON.stringify(options.settings));
  await invoke('image_set_default_provider', { providerId: options.imageProvider });
  await document.close();
  for (const leftover of await document.listRecoverable()) {
    await document.discardRecoverable(leftover.id);
  }
  const deck = startingDeck(options);
  await document.create(deck);
  syncFileState(editor());
  tapTools();
  tools = [];
  before = deck;
  return { deckId: deck.id };
}

export function send(message: string): void {
  void thread().send(message);
}

export function stop(): void {
  void thread().stop();
}

export function status(): Status {
  const state = thread().store.getState();
  const assistants = state.entries.filter((entry) => entry.type === 'assistant');
  const last = assistants.at(-1);
  return {
    ready: state.ready,
    busy: state.busy,
    activity: state.activity?.kind ?? null,
    turns: assistants.length,
    ...(last?.outcome ? { outcome: last.outcome } : {}),
    wrote: Boolean(last?.txId),
    ...(last?.problem ? { problem: `${last.problem.kind}: ${last.problem.message}` } : {}),
    slides: editor().bus.deck.slides.length,
    imageCalls: tools.filter((call) => IMAGE_TOOLS.has(call.name)).length,
  };
}

/** The request's deck, transcript and tool calls, with the lint of the finished deck. */
export async function collect(): Promise<Collected> {
  const { bus, assets } = editor();
  const deck = bus.deck;
  const lint = createLintService((asset) => assets.url(asset));
  const findings = await lint.lint(
    deck,
    deck.slides.map((slide) => slide.id),
    'all',
  );
  const entries = thread().store.getState().entries;
  return {
    before,
    deck,
    entries,
    tools,
    findings,
    score: scoreRequest({ before, deck, entries, tools, findings }),
  };
}

/** A slide as the capture window draws it, PNG in base64. */
export async function png(slideId: string, width: number): Promise<string> {
  const { bus, document } = editor();
  const bytes = await captureSlide(bus.deck, slideId, {
    width,
    workspaceId: document?.workspace?.id ?? null,
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Saves the document as a `.slidr` file, chat included. */
export async function save(path: string): Promise<void> {
  await editor().document?.saveAs(path);
  syncFileState(editor());
}

/** Lets go of the document, so a stopped app leaves nothing to recover. */
export async function close(): Promise<void> {
  await editor().document?.close();
}

const api = { dataDir, prepare, send, stop, status, collect, png, save, close };

declare global {
  interface Window {
    slidrEval?: typeof api;
  }
}
window.slidrEval = api;
