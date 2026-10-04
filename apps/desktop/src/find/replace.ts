import type { Command, Deck, Paragraph, RichText, Run } from '@slidr/model';
import { matchText, type Match, type TextRange } from './search';

/*
 * Replacing what was found (TXT-12). The replacement takes the formatting of the first character
 * it replaces, and the rest of the paragraph keeps its runs as they are. A change is written with
 * the commands every text change uses: `text.set` for a text box, a shape and a table cell,
 * `slide.update` for speaker notes. A match in a locked element is left alone.
 */

/**
 * A paragraph with the given ranges of its text replaced. The ranges are in order and do not
 * overlap, as `findInText` gives them. A run that no range touches is the same object as before.
 */
export function replaceInParagraph(
  paragraph: Paragraph,
  ranges: readonly TextRange[],
  replacement: string,
): Paragraph {
  const runs: Run[] = [];
  /** The run of the first replaced character, for a paragraph the replacement leaves empty. */
  let first: Run | undefined;
  let offset = 0;
  for (const run of paragraph.runs) {
    const start = offset;
    const end = start + run.text.length;
    offset = end;
    const inside = ranges.filter((range) => range.start < end && range.end > start);
    if (inside.length === 0) {
      runs.push(run);
      continue;
    }
    let text = '';
    let at = start;
    for (const range of inside) {
      text += run.text.slice(at - start, Math.max(range.start, start) - start);
      // The replacement goes where the match begins, so it is formatted like its first character.
      if (range.start >= start) {
        text += replacement;
        first ??= run;
      }
      at = Math.min(range.end, end);
    }
    text += run.text.slice(at - start);
    if (text) runs.push({ ...run, text });
  }
  // An empty line keeps its formatting on an empty run: that run decides how tall the line is.
  if (runs.length === 0 && first?.marks) runs.push({ text: '', marks: first.marks });
  return { ...paragraph, runs };
}

const sameText = (a: Match, b: Match): boolean =>
  a.slideId === b.slideId &&
  a.elementId === b.elementId &&
  a.cell?.row === b.cell?.row &&
  a.cell?.col === b.cell?.col;

export interface Replacement {
  /** One command for every text that changes. Sent as one batch they are one undo step. */
  commands: Command[];
  /** How many matches the commands replace. */
  replaced: number;
  /** How many matches are in locked elements, and so are not replaced. */
  skipped: number;
}

/**
 * The commands that replace the given matches by `replacement`. The matches are those of
 * `findMatches` on this very deck, in its order.
 */
export function replaceCommands(
  deck: Deck,
  matches: readonly Match[],
  replacement: string,
): Replacement {
  const open = matches.filter((match) => !match.locked);
  // The matches of one text follow one another.
  const texts: Match[][] = [];
  for (const match of open) {
    const last = texts.at(-1);
    if (last?.[0] && sameText(last[0], match)) last.push(match);
    else texts.push([match]);
  }
  const commands: Command[] = [];
  let replaced = 0;
  for (const inText of texts) {
    const first = inText[0] as Match;
    const text = matchText(deck, first);
    if (!text) continue;
    const content: RichText = {
      paragraphs: text.paragraphs.map((paragraph, index) => {
        const ranges = inText.filter((match) => match.paragraph === index);
        return ranges.length ? replaceInParagraph(paragraph, ranges, replacement) : paragraph;
      }),
    };
    const { slideId, elementId, cell } = first;
    commands.push(
      elementId
        ? { type: 'text.set', slideId, elementId, content, ...(cell ? { cell } : {}) }
        : { type: 'slide.update', slideId, patch: { notes: content } },
    );
    replaced += inText.length;
  }
  return { commands, replaced, skipped: matches.length - open.length };
}
