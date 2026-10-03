import type { SelectionSnapshot, SessionScope } from '@slidr/agent-tools';
import { walkElements, type ChangeSummary, type Deck, type Element } from '@slidr/model';

export interface ContextInput {
  /** The scope the session was started with. */
  scope: SessionScope;
  /** The deck as it is when the turn starts. */
  deck: Deck;
  /** The user's selection: the state of the app's `SelectionStore`. */
  selection: SelectionSnapshot;
  /**
   * `ChangeDigest.take(sessionId)`, taken when the turn starts (CMD-08), with the session id
   * the turns are started with (`startTurn`): the digest leaves out that session's own changes.
   */
  changes: ChangeSummary;
  /** The clock, for `today`: the prompt replaces the one that used to tell the agent the date. */
  now?: Date;
}

/** Longest string the block carries (a title, a name); longer ones are cut. */
const MAX_TEXT = 120;
/** The image style is a sentence or two of prose. */
const MAX_IMAGE_STYLE = 400;
/** Longest list the block carries; a longer one is cut and says how much is missing. */
const MAX_LIST = 40;

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

/** `<`, `>`, and the two Unicode line separators, which JSON leaves as they are. */
const UNSAFE = new RegExp(`[<>${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * A value as JSON on one line. Titles and names are the user's text, or an imported file's, and
 * must stay data whatever they contain: JSON escapes quotes and line breaks, `<` and `>` are
 * written as escapes too, and every string is cut to a bounded length. So a name cannot close
 * the block, open a tag of its own, start a line, or carry a page of text.
 */
function json(value: unknown): string {
  const text = JSON.stringify(value, (key, item: unknown) =>
    typeof item === 'string'
      ? clip(item, key === 'image_style' ? MAX_IMAGE_STYLE : MAX_TEXT)
      : item,
  );
  return text.replace(UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function capped<T>(items: readonly T[]): (T | string)[] {
  return items.length > MAX_LIST
    ? [...items.slice(0, MAX_LIST), `… ${items.length - MAX_LIST} more`]
    : [...items];
}

/** A slide as the agent refers to it. `number` counts from 1, like the Deck API (ADR-011). */
function slideRef(deck: Deck, slideId: string) {
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  const slide = deck.slides[index];
  if (!slide) return { id: slideId, missing: true };
  return { id: slide.id, number: index + 1, ...(slide.name ? { name: slide.name } : {}) };
}

function elementRef(element: Element) {
  return {
    id: element.id,
    type: element.type,
    ...(element.name ? { name: element.name } : {}),
    ...(element.role ? { role: element.role } : {}),
  };
}

/** The given elements of a slide, in the order of the ids; one that is gone is marked missing. */
function elementRefs(deck: Deck, slideId: string | null, ids: readonly string[]) {
  const slide = deck.slides.find((s) => s.id === slideId);
  const byId = new Map([...walkElements(slide?.elements ?? [])].map((e) => [e.id, e]));
  return ids.map((id) => {
    const element = byId.get(id);
    return element ? elementRef(element) : { id, missing: true };
  });
}

/** Only what changed: an empty object says the agent's picture of the deck is still good. */
function changed(changes: ChangeSummary) {
  return {
    ...(changes.slides.length > 0 ? { slides: capped(changes.slides) } : {}),
    ...(changes.elements.length > 0 ? { elements: capped(changes.elements) } : {}),
    ...(changes.removedSlides.length > 0 ? { removed_slides: capped(changes.removedSlides) } : {}),
    ...(changes.removedElements.length > 0
      ? { removed_elements: capped(changes.removedElements) }
      : {}),
    ...(changes.slideOrder ? { slide_order: true } : {}),
    ...(changes.theme ? { theme: true } : {}),
  };
}

/** The local date, `YYYY-MM-DD`. */
function isoDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/**
 * The `<slidr_context>` block of one turn (SPEC 11.6): what the agent cannot know from its
 * frozen system prompt or from earlier turns. It goes in `UserTurn.context`, apart from what
 * the user wrote. The keys and their meaning are explained to the agent in the role module;
 * conversations that were started with an older prompt keep that explanation, so keys may be
 * added but should not change meaning.
 *
 * Every line is `key: <JSON>`. The keys come from here; every value passes through `json`.
 */
export function contextBlock(input: ContextInput): string {
  const { scope, deck, selection, changes, now = new Date() } = input;
  const lines: string[] = [];
  const line = (key: string, value: unknown) => lines.push(`${key}: ${json(value)}`);

  line('today', isoDate(now));
  line('scope', scope.kind);
  line('deck', {
    title: deck.meta.title,
    lang: deck.meta.lang,
    dir: deck.meta.dir,
    slides: deck.slides.length,
    theme: deck.theme.name,
    ...(deck.meta.imageStyle ? { image_style: deck.meta.imageStyle } : {}),
  });

  if (scope.kind === 'slide' || scope.kind === 'object') {
    line('session_slide', slideRef(deck, scope.slideId));
  }
  if (scope.kind === 'object') {
    line('session_elements', elementRefs(deck, scope.slideId, scope.elementIds));
  }
  if (scope.kind === 'import' && scope.file) line('import_file', scope.file);

  const current = selection.currentSlideId;
  line('current_slide', current ? slideRef(deck, current) : null);
  if (selection.selectedSlideIds.length > 1) {
    line('selected_slides', capped(selection.selectedSlideIds.map((id) => slideRef(deck, id))));
  }
  // A selected element that is gone is simply no longer selected.
  const selected = elementRefs(deck, current, selection.selectedElementIds).filter(
    (ref) => !('missing' in ref),
  );
  line('selection', capped(selected));
  line('changed_since_last_turn', changed(changes));

  return ['<slidr_context>', ...lines, '</slidr_context>'].join('\n');
}
