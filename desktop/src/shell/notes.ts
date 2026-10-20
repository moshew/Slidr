import type { Paragraph, RichText } from '@slidr/model';

/*
 * Speaker notes as the Notes panel edits them (SPEC 4.2, panel 7). The model keeps notes as
 * rich text, and the agent writes them with emphasis and lists; the panel is a plain text field.
 * So a line is a paragraph, and a paragraph the user did not touch keeps everything it had.
 */

/** A paragraph as one line of the field: a break inside it reads as a space. */
function line(paragraph: Paragraph): string {
  return paragraph.runs
    .map((run) => run.text)
    .join('')
    .replaceAll('\n', ' ');
}

/** The notes as the text of the field: a line for each paragraph. */
export function notesText(notes: RichText | undefined): string {
  return notes ? notes.paragraphs.map(line).join('\n') : '';
}

/**
 * The notes for the text of the field, or `null` when it is empty. The paragraphs before and
 * after what was edited are the ones that were there, with their runs and marks. A line that was
 * typed or changed is plain text, in the paragraph format of the line it took the place of.
 */
export function notesFromText(text: string, previous: RichText | undefined): RichText | null {
  if (text.trim() === '') return null;
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const old = previous?.paragraphs ?? [];
  const oldLines = old.map(line);
  // The longest run of untouched lines at the start, then at the end of what is left.
  let head = 0;
  while (head < lines.length && head < old.length && lines[head] === oldLines[head]) head++;
  let tail = 0;
  while (
    tail < lines.length - head &&
    tail < old.length - head &&
    lines[lines.length - 1 - tail] === oldLines[old.length - 1 - tail]
  )
    tail++;
  const changed = lines.slice(head, lines.length - tail).map((value, i): Paragraph => {
    // The format of the line it replaced; past those, of the last one there is.
    const like = old[Math.min(head + i, old.length - tail - 1)] ?? old[head - 1];
    const { runs: _runs, ...format } = like ?? { dir: 'auto' as const, align: 'start' as const };
    return { ...format, runs: value ? [{ text: value }] : [] };
  });
  return {
    paragraphs: [...old.slice(0, head), ...changed, ...old.slice(old.length - tail)],
  };
}
