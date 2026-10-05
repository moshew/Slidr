import { describe, expect, it } from 'vitest';
import { pastedFiles } from './attachments';

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
