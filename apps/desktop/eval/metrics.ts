/**
 * What the evaluation set measures on one request (SPEC 14.5, QG-07): pure functions over the
 * deck the agent left, the chat's transcript, the tool calls as the app answered them, and the
 * lint findings of the finished deck. No DOM, so the same inputs always score the same.
 *
 * The visual score is not here: it is the user's, given on the review page.
 */
import type { LintFinding } from '@slidr/agent-tools';
import {
  plainText,
  slideArchetype,
  walkElements,
  type Deck,
  type Element,
  type Slide,
} from '@slidr/model';
import type { Usage } from '../src/agent/agent';
import type { ChatEntry } from '../src/agent/transcript';

/** One tool call of the session as the Deck API answered it, images left out. */
export interface ToolRecord {
  name: string;
  /** In full: the transcript cuts a slide's HTML at 2,000 characters. */
  input: unknown;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  ms: number;
}

export interface SlideScore {
  id: string;
  number: number;
  name?: string;
  archetype?: string;
  /** Leaf elements by type. */
  elements: Record<string, number>;
  /** The share of leaf elements the user can edit with handles (everything but `html`). */
  editability: number;
  /** A title and bullets on an empty background, which PLAN's acceptance for WG11 forbids. */
  titleAndBullets: boolean;
  /** Emoji in the slide's text: what the agent reaches for when it has no icons. */
  emoji: boolean;
  findings: Pick<LintFinding, 'rule' | 'severity' | 'message'>[];
  /** HTML writes that made or replaced this slide. */
  writes: number;
  /** Its first HTML write came back without lint findings; null when it had none. */
  cleanFirstWrite: boolean | null;
}

export interface GateRound {
  round: number;
  unseen: string[];
  findings: { slideId: string; rule: string }[];
}

export interface RequestScore {
  slides: SlideScore[];
  findings: { error: number; warning: number; info: number; byRule: Record<string, number> };
  gate: {
    /** Slides the request created or changed, and that still exist. */
    judged: number;
    /** Of those, the ones the design check did not name in its first follow-up (QG-07). */
    passedFirstRound: number;
    /** What the design check sent back, round by round. */
    rounds: GateRound[];
    /** Findings and unseen slides it gave up on after its rounds (QG-05). */
    remaining: number;
  };
  /** The mean of the slides' editability. */
  editability: number;
  /**
   * Among the slides the agent designed: the ones it created, and the ones it wrote anew as
   * HTML. A slide it left alone, or only reworded, is the user's design.
   */
  titleAndBullets: string[];
  emoji: string[];
  conversions: {
    /** Calls that wrote a slide as HTML and succeeded. */
    writes: number;
    /** Of those, the ones where part of the slide stayed `html`. */
    partlyHtml: number;
    /** Of those, the ones where nothing became a regular element. */
    wholeSlideHtml: number;
    /** Of those, the ones that came back with lint findings. */
    withFindings: number;
  };
  toolErrors: { name: string; code: string; message: string }[];
  /** Assistant entries: 2 when the agent proposed an outline and waited for the go-ahead. */
  turns: number;
  durationMs: number;
  /** Null when the harness could not attribute a cost to a turn. */
  costUsd: number | null;
  usage: Usage;
}

const HTML_WRITES = new Set(['slide_create_from_html', 'slide_replace_from_html']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function leaves(slide: Slide): Element[] {
  return [...walkElements(slide.elements)].filter((element) => element.type !== 'group');
}

/** The text a viewer reads on a slide: text elements, table cells aside, and what `html` holds. */
function slideText(slide: Slide): string {
  return leaves(slide)
    .map((element) =>
      element.type === 'text'
        ? plainText(element.content)
        : element.type === 'html'
          ? element.markup.replace(/<[^>]*>/g, ' ')
          : '',
    )
    .join('\n');
}

const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);

/** A character drawn as a colour picture: emoji by default, or made one by a variation selector. */
export function hasEmoji(text: string): boolean {
  return /\p{Emoji_Presentation}/u.test(text) || text.includes(VARIATION_SELECTOR);
}

/**
 * A title and bullets on an empty background: nothing on the slide is drawn except text and
 * lines, the background is one flat colour, and the text is a list. The lint's L16 asks a
 * narrower question (is there a visual that carries the message) and excuses three archetypes;
 * this one is about the look PLAN's acceptance names, whatever the slide calls itself.
 */
export function isTitleAndBullets(deck: Deck, slide: Slide): boolean {
  const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
  const background = slide.background ?? layout?.background ?? deck.theme.background;
  if (background.fill.kind !== 'solid' && background.fill.kind !== 'none') return false;
  const drawn = leaves(slide);
  if (drawn.some((element) => element.type !== 'text' && element.type !== 'line')) return false;
  let listed = 0;
  for (const element of drawn) {
    if (element.type !== 'text') continue;
    listed += element.content.paragraphs.filter((p) => p.list && p.runs.length > 0).length;
  }
  return listed >= 2;
}

function slideScore(
  deck: Deck,
  slide: Slide,
  findings: readonly LintFinding[],
  tools: readonly ToolRecord[],
): SlideScore {
  const elements: Record<string, number> = {};
  for (const element of leaves(slide)) elements[element.type] = (elements[element.type] ?? 0) + 1;
  const count = Object.values(elements).reduce((sum, n) => sum + n, 0);
  const writes = tools.filter(
    (call) => call.ok && HTML_WRITES.has(call.name) && call.data?.slideId === slide.id,
  );
  const first = writes[0]?.data?.lint;
  const archetype = slideArchetype(deck, slide);
  return {
    id: slide.id,
    number: deck.slides.indexOf(slide) + 1,
    ...(slide.name ? { name: slide.name } : {}),
    ...(archetype ? { archetype } : {}),
    elements,
    editability: count === 0 ? 1 : (count - (elements.html ?? 0)) / count,
    titleAndBullets: isTitleAndBullets(deck, slide),
    emoji: hasEmoji(slideText(slide)),
    findings: findings
      .filter((finding) => finding.slideId === slide.id)
      .map(({ rule, severity, message }) => ({ rule, severity, message })),
    writes: writes.length,
    cleanFirstWrite: writes.length === 0 ? null : !Array.isArray(first) || first.length === 0,
  };
}

/** The slides of `after` that `before` does not have as they are now. */
export function changedSlides(before: Deck | null, after: Deck): string[] {
  const was = new Map((before?.slides ?? []).map((slide) => [slide.id, JSON.stringify(slide)]));
  return after.slides
    .filter((slide) => was.get(slide.id) !== JSON.stringify(slide))
    .map((slide) => slide.id);
}

export interface ScoreInput {
  /** The deck the request started from: the app's new deck with its one empty slide, or a base deck. */
  before: Deck | null;
  deck: Deck;
  entries: readonly ChatEntry[];
  tools: readonly ToolRecord[];
  /** Every rule, on every slide of `deck`. */
  findings: readonly LintFinding[];
}

export function scoreRequest({ before, deck, entries, tools, findings }: ScoreInput): RequestScore {
  const slides = deck.slides.map((slide) => slideScore(deck, slide, findings, tools));
  const byRule: Record<string, number> = {};
  const levels = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    levels[finding.severity]++;
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
  }

  const rounds: GateRound[] = [];
  let remaining = 0;
  let turns = 0;
  let durationMs = 0;
  let costUsd: number | null = 0;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const entry of entries) {
    if (entry.type !== 'assistant') continue;
    turns++;
    durationMs += entry.durationMs ?? 0;
    costUsd = costUsd === null || entry.costUsd == null ? null : costUsd + entry.costUsd;
    for (const key of Object.keys(usage) as (keyof Usage)[]) usage[key] += entry.usage?.[key] ?? 0;
    remaining += (entry.remaining?.unseen.length ?? 0) + (entry.remaining?.findings.length ?? 0);
    for (const part of entry.parts) {
      if (part.type !== 'gate') continue;
      rounds.push({
        round: part.round,
        unseen: part.unseen,
        findings: part.findings.map(({ slideId, rule }) => ({ slideId, rule })),
      });
    }
  }
  const judged = changedSlides(before, deck);
  const existed = new Set((before?.slides ?? []).map((slide) => slide.id));
  const sentBack = new Set(
    rounds
      .filter((round) => round.round === 1)
      .flatMap((round) => [...round.unseen, ...round.findings.map((f) => f.slideId)]),
  );

  const writes = tools.filter((call) => call.ok && HTML_WRITES.has(call.name));
  const editabilityOf = (call: ToolRecord) =>
    typeof call.data?.editability === 'number' ? call.data.editability : 1;

  return {
    slides,
    findings: { ...levels, byRule },
    gate: {
      judged: judged.length,
      passedFirstRound: judged.filter((id) => !sentBack.has(id)).length,
      rounds,
      remaining,
    },
    editability:
      slides.length === 0 ? 1 : slides.reduce((sum, s) => sum + s.editability, 0) / slides.length,
    titleAndBullets: slides
      .filter((s) => s.titleAndBullets && (!existed.has(s.id) || s.writes > 0))
      .map((s) => s.id),
    emoji: slides.filter((s) => s.emoji).map((s) => s.id),
    conversions: {
      writes: writes.length,
      partlyHtml: writes.filter((call) => editabilityOf(call) < 1).length,
      wholeSlideHtml: writes.filter((call) => editabilityOf(call) === 0).length,
      withFindings: writes.filter((call) => {
        const lint = call.data?.lint;
        return Array.isArray(lint) && lint.length > 0;
      }).length,
    },
    toolErrors: tools
      .filter((call) => !call.ok)
      .map((call) => ({
        name: call.name,
        code: call.error?.code ?? 'failed',
        message: call.error?.message ?? '',
      })),
    turns,
    durationMs,
    costUsd,
    usage,
  };
}

/** A tool result without its pictures, as the tool log keeps it. */
export function toolRecord(name: string, input: unknown, result: unknown, ms: number): ToolRecord {
  if (isRecord(result) && result.ok === true && isRecord(result.data)) {
    return { name, input, ok: true, data: result.data, ms };
  }
  const error = isRecord(result) && isRecord(result.error) ? result.error : {};
  return {
    name,
    input,
    ok: false,
    error: {
      code: typeof error.code === 'string' ? error.code : 'failed',
      message: typeof error.message === 'string' ? error.message : '',
    },
    ms,
  };
}
