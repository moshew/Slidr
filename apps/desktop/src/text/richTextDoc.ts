import type { Marks, Paragraph, RichText, Run } from '@slidr/model';
import type { JSONContent } from '@tiptap/core';

/**
 * RichText (SPEC 5.4) <-> the editor's document (WG4-T01).
 *
 * The editor schema mirrors RichText one to one: a document is a flat list of paragraphs, and a
 * list item is a paragraph with a `list` attribute, as in the model, rather than ProseMirror's
 * nested lists. Every key of `Marks` is its own mark type, so each can be toggled on a range
 * without touching the others. That keeps the mapping lossless both ways.
 */

/** Mark types, in nesting order: an outer mark is listed first (size wraps script, so 0.65em works). */
export const MARK_TYPES = [
  'link',
  'font',
  'size',
  'weight',
  'italic',
  'underline',
  'strike',
  'color',
  'highlight',
  'letterSpacing',
  'script',
  'case',
] as const satisfies readonly (keyof Marks)[];

export type MarkType = (typeof MARK_TYPES)[number];

/** Marks that are on or off; the others carry their value in a `value` attribute. */
export const BOOLEAN_MARKS = new Set<MarkType>(['italic', 'underline', 'strike']);

/** Paragraph fields that are attributes of the editor's paragraph node. */
export const PARAGRAPH_ATTRS = [
  'dir',
  'align',
  'lineHeight',
  'spaceBefore',
  'spaceAfter',
  'indent',
  'list',
  'styleRef',
] as const satisfies readonly (keyof Paragraph)[];

interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

function marksToPm(marks: Marks | undefined): PmMark[] | undefined {
  if (!marks) return undefined;
  const out: PmMark[] = [];
  for (const type of MARK_TYPES) {
    const value = marks[type];
    if (value === undefined || value === false) continue;
    out.push(BOOLEAN_MARKS.has(type) ? { type } : { type, attrs: { value } });
  }
  return out.length ? out : undefined;
}

function pmToMarks(marks: readonly PmMark[] | undefined): Marks | undefined {
  if (!marks?.length) return undefined;
  const out: Record<string, unknown> = {};
  for (const mark of marks) {
    const type = mark.type as MarkType;
    if (!MARK_TYPES.includes(type)) continue;
    out[type] = BOOLEAN_MARKS.has(type) ? true : mark.attrs?.value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Marks without empty or "off" keys, so that equal formatting compares equal. */
function cleanMarks(marks: Marks | undefined): Marks | undefined {
  if (!marks) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(marks)) {
    if (value !== undefined && value !== false) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * The canonical form of a paragraph's runs: adjacent runs with the same marks are one run, and
 * empty runs are dropped. An empty paragraph keeps one empty run if it had formatting, because
 * that run decides the height of the empty line.
 */
function normalizeRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const marks = cleanMarks(run.marks);
    const last = out[out.length - 1];
    if (last && sameValue(last.marks, marks)) last.text += run.text;
    else out.push(marks ? { text: run.text, marks } : { text: run.text });
  }
  if (out.length === 0) {
    const formatted = runs.find((r) => cleanMarks(r.marks));
    if (formatted) return [{ text: '', marks: cleanMarks(formatted.marks) }];
  }
  return out;
}

function cleanParagraph(p: Paragraph): Paragraph {
  const out: Record<string, unknown> = { dir: p.dir, align: p.align };
  for (const key of PARAGRAPH_ATTRS) {
    const value = p[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  out.runs = normalizeRuns(p.runs);
  return out as Paragraph;
}

/** The canonical form of a rich text; the editor round trip is the identity on it. */
export function normalizeRichText(rich: RichText): RichText {
  return { paragraphs: rich.paragraphs.map(cleanParagraph) };
}

function paragraphToPm(p: Paragraph): JSONContent {
  const attrs: Record<string, unknown> = {};
  for (const key of PARAGRAPH_ATTRS) attrs[key] = p[key] ?? null;
  const runs = normalizeRuns(p.runs);
  const content: JSONContent[] = [];
  for (const run of runs) {
    const marks = marksToPm(run.marks);
    run.text.split('\n').forEach((part, i) => {
      if (i > 0) content.push(marks ? { type: 'hardBreak', marks } : { type: 'hardBreak' });
      if (part)
        content.push(marks ? { type: 'text', text: part, marks } : { type: 'text', text: part });
    });
  }
  // An empty line keeps its formatting on the paragraph: an empty text node is not allowed.
  attrs.emptyMarks = content.length === 0 && runs[0]?.marks ? runs[0].marks : null;
  return content.length ? { type: 'paragraph', attrs, content } : { type: 'paragraph', attrs };
}

/** The editor document for a rich text. An empty rich text becomes one empty paragraph. */
export function richTextToDoc(rich: RichText): JSONContent {
  const paragraphs = rich.paragraphs.length
    ? rich.paragraphs
    : [{ dir: 'auto', align: 'start', runs: [] } satisfies Paragraph];
  return { type: 'doc', content: paragraphs.map(paragraphToPm) };
}

/** The rich text of an editor document, in canonical form. */
export function docToRichText(doc: JSONContent): RichText {
  const paragraphs: Paragraph[] = [];
  for (const node of doc.content ?? []) {
    if (node.type !== 'paragraph') continue;
    const attrs = node.attrs ?? {};
    const runs: Run[] = [];
    for (const child of node.content ?? []) {
      const marks = pmToMarks(child.marks);
      const text =
        child.type === 'hardBreak' ? '\n' : child.type === 'text' ? (child.text ?? '') : '';
      if (text) runs.push(marks ? { text, marks } : { text });
    }
    if (runs.length === 0 && attrs.emptyMarks)
      runs.push({ text: '', marks: attrs.emptyMarks as Marks });
    paragraphs.push(
      cleanParagraph({
        ...(Object.fromEntries(PARAGRAPH_ATTRS.map((k) => [k, attrs[k] ?? undefined])) as Omit<
          Paragraph,
          'runs'
        >),
        dir: (attrs.dir as Paragraph['dir'] | undefined) ?? 'auto',
        align: (attrs.align as Paragraph['align'] | undefined) ?? 'start',
        runs,
      }),
    );
  }
  return { paragraphs };
}
