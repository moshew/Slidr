import type { SessionScope } from '@slidr/agent-tools';
import { plainText, walkElements, type Deck, type Element, type Slide } from '@slidr/model';

/**
 * What a slide or object session is told about its subject (AIS-01, AIO-01): the slide's model
 * and the deck's outline for a slide session; the elements' models and a map of their slide for
 * an object session. It rides with the turn's context block, so the session's first move can be
 * the change itself and not three reads. The app attaches a picture of the slide next to it.
 *
 * The block is data from the deck: slide text, names and notes are the user's, or an imported
 * file's. Like the context block it is JSON on single lines, with `<` and `>` written as
 * escapes, so nothing in it can close the block or pose as an instruction.
 */

/** The tag the brief is sent in. The role module says text in `<slidr_…>` tags is the app's. */
export const SESSION_TAG = 'slidr_session';

export interface SessionBriefInput {
  /** The scope the session was started with. */
  scope: SessionScope;
  /** The deck as it is when the turn starts. */
  deck: Deck;
  /** A picture of the slide is attached to the turn. */
  picture?: boolean;
}

/** Longest model the block carries, in characters of JSON; a longer one is left to the tools. */
const MAX_MODEL = 24_000;
/** Longest text a line of a map carries. */
const MAX_SNIPPET = 80;
/** Longest list of a map. */
const MAX_ROWS = 60;

const UNSAFE = new RegExp(`[<>${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/** A value as JSON on one line, whole: a model has to arrive as it is to be of use. */
function line(value: unknown): string {
  return JSON.stringify(value).replace(
    UNSAFE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function clip(text: string): string {
  const chars = [...text];
  return chars.length > MAX_SNIPPET ? `${chars.slice(0, MAX_SNIPPET).join('')}…` : text;
}

function capped<T>(rows: readonly T[]): (T | string)[] {
  return rows.length > MAX_ROWS
    ? [...rows.slice(0, MAX_ROWS), `… ${rows.length - MAX_ROWS} more`]
    : [...rows];
}

/** A model in full, or, when it is too long to send with every change, where to read it. */
function model(value: unknown, readWith: string): string {
  const text = line(value);
  return text.length > MAX_MODEL
    ? line(`left out: ${text.length} characters of JSON. Read it with ${readWith}.`)
    : text;
}

function textOf(element: Element): string | undefined {
  if (element.type !== 'text' && element.type !== 'shape') return undefined;
  const text = element.content ? plainText(element.content).replace(/\s+/g, ' ').trim() : '';
  return text ? clip(text) : undefined;
}

/** The slide's title, as far as the model says which text that is. */
function titleOf(slide: Slide): string | undefined {
  for (const element of walkElements(slide.elements)) {
    if (element.role === 'title') return textOf(element);
  }
  return undefined;
}

/** The deck in a line per slide: where the session's slide sits, and what its neighbours are. */
function outline(deck: Deck) {
  return capped(
    deck.slides.map((slide, i) => {
      const title = titleOf(slide);
      return {
        number: i + 1,
        id: slide.id,
        ...(slide.name ? { name: clip(slide.name) } : {}),
        ...(title ? { title } : {}),
        ...(slide.archetype ? { archetype: slide.archetype } : {}),
        ...(slide.hidden ? { hidden: true } : {}),
      };
    }),
  );
}

/** One element of a slide's map; `within` is the group it is a child of. */
function mapRow(element: Element, within?: string) {
  const text = textOf(element);
  return {
    id: element.id,
    type: element.type,
    ...(element.name ? { name: clip(element.name) } : {}),
    ...(element.role ? { role: element.role } : {}),
    // The frame is the model's, which is what a change has to write: a child's is relative to
    // its group, so the row names the group.
    ...(within ? { in: within } : {}),
    frame: element.frame,
    ...(text ? { text } : {}),
  };
}

/** The rows of a tree, each group followed by what is in it: a card is a group (ADR-073). */
function mapRows(elements: readonly Element[], within?: string): ReturnType<typeof mapRow>[] {
  return elements.flatMap((element) => [
    mapRow(element, within),
    ...(element.type === 'group' ? mapRows(element.children, element.id) : []),
  ]);
}

/** A slide in a line per element: what an element's neighbours are, and where they sit. */
function slideMap(deck: Deck, slide: Slide) {
  return {
    id: slide.id,
    number: deck.slides.indexOf(slide) + 1,
    ...(slide.name ? { name: clip(slide.name) } : {}),
    elements: capped(mapRows(slide.elements)),
  };
}

/**
 * The `<slidr_session>` block of a slide or object session; null for a deck or import session,
 * whose subject is the whole deck, and when the session's slide is gone.
 */
export function sessionBrief({ scope, deck, picture = false }: SessionBriefInput): string | null {
  if (scope.kind !== 'slide' && scope.kind !== 'object') return null;
  const slide = deck.slides.find((s) => s.id === scope.slideId);
  if (!slide) return null;

  const lines: string[] = [];
  let say: string;
  if (scope.kind === 'slide') {
    lines.push(`slide: ${model(slide, 'slide_get')}`);
    lines.push(`deck_outline: ${line(outline(deck))}`);
    say =
      'The slide this session works on, in full and as it is now, and the outline of the deck around it. You need not read them again before your first change.';
  } else {
    const byId = new Map([...walkElements(slide.elements)].map((e) => [e.id, e]));
    const elements = scope.elementIds.flatMap((id) => byId.get(id) ?? []);
    if (elements.length === 0) return null;
    lines.push(`elements: ${model(elements, 'element_get')}`);
    lines.push(`slide: ${line(slideMap(deck, slide))}`);
    say =
      'The elements this session works on, in full and as they are now, and a map of the slide around them. You need not read them again before your first change.';
    if (slide.elements.some((element) => element.type === 'group')) {
      say +=
        " An element of the map with `in` is inside that group, and its frame counts from that group's top-left corner.";
    }
  }
  if (picture) say += ' A picture of the slide as the user sees it now is attached.';
  return [`<${SESSION_TAG}>`, ...lines, say, `</${SESSION_TAG}>`].join('\n');
}
