import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { accepted, MAX_BYTES, MAX_FILES, pastedFiles, refusals } from './attachments';
import { en, he } from './messages';

/* Files on their way into a message (CHT-U05): what a paste and a choice of files give it. */

const picture = (name: string) =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

/** What a paste event carries, as far as `pastedFiles` reads it. */
function clipboard(files: File[], text = ''): DataTransfer {
  return {
    files,
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
}

describe('a paste into the chat', () => {
  it('is a file when the clipboard holds a picture and no words: a screenshot', () => {
    const pasted = pastedFiles(clipboard([picture('image.png')]), 2);
    // A screenshot has no name of its own: it is numbered after the files the message has.
    expect(pasted.map((file) => [file.name, file.type])).toEqual([['pasted-3.png', 'image/png']]);
    expect(pastedFiles(clipboard([picture('chart.png')]), 0)[0]!.name).toBe('chart.png');
  });

  // The bug hunt's `ai-ui.md`, finding 4: copied cells of a spreadsheet come with a picture of
  // them, and the picture was attached in place of the text.
  it('is words when the clipboard holds words, whatever picture comes beside them', () => {
    expect(pastedFiles(clipboard([picture('image.png')], 'Q1\t120\nQ2\t150'), 0)).toEqual([]);
    // White space alone is not words.
    expect(pastedFiles(clipboard([picture('image.png')], ' \n'), 0)).toHaveLength(1);
  });

  it('is nothing to attach when there is no file, or no clipboard', () => {
    expect(pastedFiles(clipboard([], 'words'), 0)).toEqual([]);
    expect(pastedFiles(clipboard([]), 0)).toEqual([]);
    expect(pastedFiles(null, 0)).toEqual([]);
  });
});

/** A file of a size, without the bytes. */
const sized = (name: string, size: number) => ({ name, size }) as File;

describe('the files offered to a message', () => {
  // The bug hunt's `ai-ui.md`, finding 11: a file over the limit, and an eleventh file, were
  // left out and nothing said so.
  it('are taken as far as they fit, and what is left out is told apart by why', () => {
    const big = sized('last-year.pptx', MAX_BYTES + 1);
    const edge = sized('exactly.pdf', MAX_BYTES);
    const small = sized('notes.md', 10);
    expect(accepted([big, small, edge], 0)).toEqual({
      files: [small, edge],
      tooLarge: [big],
      tooMany: 0,
    });
    // A message that has eight files has room for two more.
    const many = Array.from({ length: 5 }, (_, i) => sized(`${i}.png`, 10));
    expect(accepted(many, MAX_FILES - 2)).toEqual({
      files: many.slice(0, 2),
      tooLarge: [],
      tooMany: 3,
    });
    // A file too large for a message does not count against the room it has.
    expect(accepted([big, small], MAX_FILES - 1)).toMatchObject({ files: [small], tooMany: 0 });
    expect(accepted([small], MAX_FILES)).toEqual({ files: [], tooLarge: [], tooMany: 1 });
  });

  it('are refused in words that name the file and the limit, in both languages', () => {
    for (const messages of [he, en]) {
      // The translator of the chat, as far as these two strings go.
      const t = ((key: 'composer.tooLarge' | 'composer.tooMany', values: Record<string, unknown>) =>
        messages.composer[key === 'composer.tooLarge' ? 'tooLarge' : 'tooMany'].replace(
          /\{\{(\w+)\}\}/g,
          (_, name: string) => String(values[name]),
        )) as unknown as TFunction<'ai'>;
      const big = [sized('last-year.pptx', MAX_BYTES + 1), sized('film.mp4', MAX_BYTES * 3)];
      const [large, many] = refusals(t, { files: [], tooLarge: big, tooMany: 2 });
      expect(large).toContain('last-year.pptx, film.mp4');
      expect(large).toMatch(/50 ?MB/);
      expect(many).toContain(String(MAX_FILES));
      expect(refusals(t, { files: [big[0]!], tooLarge: [], tooMany: 0 })).toEqual([]);
    }
  });
});
