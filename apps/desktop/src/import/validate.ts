/**
 * What comes back from the import page is data, not the word of trusted code (SPEC 13.3): the
 * imported file's scripts share that page with the conversion engine and can change what it
 * answers. Before a captured slide reaches the deck it is held to the model's schema here, and
 * to the few things the schema does not say.
 */
import type { ImportedSlide } from '@slidr/agent-tools';
import {
  allElementIds,
  AssetMeta,
  newId,
  Slide,
  walkElements,
  type Deck,
  type Element,
} from '@slidr/model';

/** An asset the app stored is a file named by its content hash, directly in `assets/`. */
const STORED_FILE = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

const MAX_ASSETS = 2000;
const MAX_NOTE = 600;
const MAX_NOTES = 60;

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isShare = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1;

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function invalid(what: string): Error {
  return new Error(
    `The page returned a slide that is not a valid slide (${what}). Nothing was added; capture it again.`,
  );
}

/** A slide's elements with a change applied to each, groups included. */
function mapElements(elements: readonly Element[], change: (e: Element) => Element): Element[] {
  return elements.map((element) =>
    change(
      element.type === 'group'
        ? { ...element, children: mapElements(element.children, change) }
        : element,
    ),
  );
}

/**
 * A capture as the import page reported it, checked against the deck it is for. Throws with a
 * message for the agent when it is not something the deck can take.
 */
export function checkCapture(value: unknown, deck: Deck): ImportedSlide {
  if (!isObject(value)) throw invalid('not an object');
  const { guard, source } = value;
  if (!isObject(guard) || typeof guard.faithful !== 'boolean' || typeof guard.exact !== 'boolean') {
    throw invalid('guard');
  }
  if (typeof guard.wholeSlide !== 'boolean') throw invalid('guard.wholeSlide');
  if (!isShare(value.editability) || !isShare(value.textEditability)) throw invalid('editability');
  if (!isObject(source) || !isSize(source.width) || !isSize(source.height)) {
    throw invalid('source');
  }
  const rawNotes = value.notes;
  if (!Array.isArray(rawNotes) || rawNotes.some((note) => typeof note !== 'string')) {
    throw invalid('notes');
  }
  const notes = rawNotes as string[];

  const parsedSlide = Slide.safeParse(value.slide);
  if (!parsedSlide.success) {
    const issue = parsedSlide.error.issues[0];
    throw invalid(`slide.${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'unknown'}`);
  }
  const parsedAssets = AssetMeta.array().max(MAX_ASSETS).safeParse(value.assets);
  if (!parsedAssets.success) {
    const issue = parsedAssets.error.issues[0];
    throw invalid(`assets.${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'unknown'}`);
  }
  for (const asset of parsedAssets.data) {
    if (!STORED_FILE.test(asset.file) || !asset.file.startsWith(`${asset.id}.`)) {
      throw new Error('The page returned an asset the app did not store. Nothing was added.');
    }
  }

  const taken = allElementIds(deck);
  const seen = new Set<string>();
  for (const element of walkElements(parsedSlide.data.elements)) {
    if (taken.has(element.id) || seen.has(element.id)) {
      throw new Error('The page returned element ids that are already in use. Capture it again.');
    }
    seen.add(element.id);
  }

  const { layoutId: _layout, hidden: _hidden, ...fields } = parsedSlide.data;
  const slide: Slide = {
    ...fields,
    // The id the page chose is free in the page's empty deck, not necessarily in this one.
    id: deck.slides.some((s) => s.id === fields.id)
      ? newId('s', (candidate) => deck.slides.some((s) => s.id === candidate))
      : fields.id,
    // An imported file's scripts never become part of a slide: what was captured is a copy of
    // what they drew. The renderer strips script from the markup of such an element.
    elements: mapElements(fields.elements, (element) =>
      element.type === 'html' ? { ...element, hasScripts: false } : element,
    ),
  };

  return {
    slide,
    assets: parsedAssets.data.map((asset) => ({ ...asset, origin: 'import' })),
    editability: value.editability,
    textEditability: value.textEditability,
    faithful: guard.faithful,
    exact: guard.exact,
    wholeSlideHtml: guard.wholeSlide,
    source: { width: source.width, height: source.height },
    notes: notes.slice(0, MAX_NOTES).map((note) => note.slice(0, MAX_NOTE)),
  };
}

/** A job's answer that should be text, as text of a bounded length. */
export function checkText(value: unknown, limit = 40_000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

const MAX_PICTURE_SIDE = 8000;
const MAX_PICTURE_CHARS = 12_000_000;

const isSide = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_PICTURE_SIDE;

/** A job's answer that should be a PNG in base64. */
export function checkPicture(value: unknown): { data: string; width: number; height: number } {
  if (
    isObject(value) &&
    typeof value.data === 'string' &&
    value.data.length <= MAX_PICTURE_CHARS &&
    /^[A-Za-z0-9+/]+=*$/.test(value.data) &&
    isSide(value.width) &&
    isSide(value.height)
  ) {
    return { data: value.data, width: value.width, height: value.height };
  }
  throw new Error('The page did not return a picture.');
}
