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
import { actionMessage, type ActionId, type ActionParams } from '@slidr/prompts';
import {
  applyTemplate,
  deckFromTemplate,
  sampleDeckOf,
  type Draft,
  type Template,
} from '@slidr/templates';
import { invoke } from '@tauri-apps/api/core';
import type { AgentSettings } from '../src/agent/agentService';
import type { ChatEntry } from '../src/agent/transcript';
import { agentOf } from '../src/ai/runtime';
import { captureSlide } from '../src/capture/client';
import { createLintService } from '../src/lint/deckLint';
import { newDeck, syncFileState, type Editor } from '../src/shell/editor';
import { i18n } from '../src/i18n';
import { drafts, library } from '../src/templates/app';
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

/**
 * The folder the app keeps its data in. Asked of a command of the app's own: the diagnostics log
 * is kept there, and reading it writes nothing. The path plugin needs a permission the window no
 * longer has (ADR-066), and the runner asks the same way before this module is loaded.
 */
export async function dataDir(): Promise<string> {
  const { path } = await invoke<{ path: string }>('agent_diagnostics_read', { maxBytes: 1 });
  // <data folder>/agent/diagnostics.jsonl
  return path.replace(/[\\/]agent[\\/][^\\/]+$/, '');
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

/** What the lint says of one layout of a template, filled, in one language. */
export interface LayoutCheck {
  /** `sample`: what the layouts were drawn with. `generic`: the app's own words for each role. */
  content: 'sample' | 'generic';
  lang: 'he' | 'en';
  layout: string;
  rule: string;
  severity: LintFinding['severity'];
  message: string;
}

/**
 * Every layout of a template through the real lint, in Hebrew (right-to-left) and in English
 * (left-to-right): the acceptance criterion of a template (WG7), for one the agent made. The
 * layouts are filled twice: with the sample they were drawn with, and with the app's short
 * words for each role in the language of the deck.
 */
async function checkTemplate(template: Template, fills: Draft['fills']): Promise<LayoutCheck[]> {
  const { bus, assets } = editor();
  const lint = createLintService((asset) => assets.url(asset));
  const found: LayoutCheck[] = [];
  for (const content of ['sample', 'generic'] as const) {
    for (const [lang, dir] of [
      ['he', 'rtl'],
      ['en', 'ltr'],
    ] as const) {
      const deck = sampleDeckOf(template, content === 'sample' ? fills : {}, {
        dir,
        lang,
        assets: bus.deck.assets,
        fallback: (role) => {
          const key = `templates:sample.${role}`;
          return i18n.exists(key) ? i18n.t(key, { lng: lang }) : undefined;
        },
      });
      const names = new Map(deck.slides.map((slide) => [slide.id, slide.name ?? slide.id]));
      for (const finding of await lint.lint(deck, [...names.keys()], 'all')) {
        found.push({
          content,
          lang,
          layout: names.get(finding.slideId) ?? finding.slideId,
          rule: finding.rule,
          severity: finding.severity,
          message: finding.message,
        });
      }
    }
  }
  return found;
}

/**
 * The template the agent drafted last (the one the chat shows, or the latest), with what the
 * lint says of each of its layouts in both languages. Null when nothing was drafted.
 */
export async function draftReport() {
  const { drafts: all, shown } = drafts.state.getState();
  const draft = all.find((d) => d.id === shown) ?? all.at(-1);
  if (!draft) return null;
  return {
    id: draft.id,
    drafts: all.length,
    savedAs: draft.savedAs ?? null,
    name: draft.template.theme.name,
    dir: draft.template.dir,
    theme: draft.template.theme,
    layouts: draft.layouts,
    findings: draft.findings,
    notes: draft.notes,
    checks: await checkTemplate(draft.template, draft.fills),
  };
}

/** The personal templates of the library, as the user's Templates panel lists them. */
export function personalTemplates(): { id: string; name: string; layouts: number }[] {
  return library.state.getState().personal.map((template) => ({
    id: template.theme.id,
    name: template.theme.name,
    layouts: template.layouts.length,
  }));
}

/** A file to send with a message, as the runner hands it over: its bytes in base64. */
export interface SentFile {
  name: string;
  mime: string;
  base64: string;
  use?: string;
}

/**
 * Sends an action of the deck tool as its panel sends it, with the files of its form. For a
 * runner that cannot answer the file dialog of the real window.
 */
export function sendAction(id: ActionId, params: ActionParams, files: readonly SentFile[]): void {
  const attachments = files.map(({ name, mime, base64, use }) => ({
    name,
    mime,
    bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    ...(use ? { use } : {}),
  }));
  void thread().send(actionMessage({ action: id, params, replyIn: 'Hebrew' }), {
    action: { id },
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}

const api = {
  dataDir,
  prepare,
  send,
  stop,
  status,
  collect,
  png,
  save,
  close,
  draftReport,
  personalTemplates,
  sendAction,
};

declare global {
  interface Window {
    slidrEval?: typeof api;
  }
}
window.slidrEval = api;
