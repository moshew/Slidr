/**
 * Files on their way into a message (CHT-U05): chosen in the file dialog, or pasted, which is
 * how a screenshot arrives. A file is read here, once; the agent service stores it with the
 * conversation and, when it is a picture, with the document.
 */
import type { Attachment } from '../agent/agentService';

/** What the file dialog offers: the documents a deck is made from, and pictures. */
export const ATTACHABLE =
  'image/*,.pdf,.md,.txt,.docx,.pptx,.html,.htm,.csv,.json,text/plain,text/markdown,text/html';

/** The most files one message takes, and the largest of them: what the harness layer accepts. */
export const MAX_FILES = 10;
export const MAX_BYTES = 50 * 1024 * 1024;

/** The media type of a file the browser gave none for, by its name. */
function mimeOf(file: File): string {
  if (file.type) return file.type;
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const known: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    csv: 'text/csv',
    json: 'application/json',
    pdf: 'application/pdf',
  };
  return (extension && known[extension]) || '';
}

export async function readAttachment(file: File, use?: string): Promise<Attachment> {
  return {
    name: file.name,
    mime: mimeOf(file),
    bytes: new Uint8Array(await file.arrayBuffer()),
    ...(use ? { use } : {}),
  };
}

/**
 * The files of a paste that is files and no words. A screenshot comes as a file named
 * `image.png`: it gets a name of its own.
 *
 * A clipboard that has words is pasted as words, whatever comes beside them: a spreadsheet
 * puts a picture of the copied cells next to their text, and a slide program a picture of the
 * copied object, and neither is what the user meant to send.
 */
export function pastedFiles(data: DataTransfer | null, taken: number): File[] {
  if (data?.getData('text/plain').trim()) return [];
  return Array.from(data?.files ?? []).map((file, index) =>
    file.name && file.name !== 'image.png'
      ? file
      : new File([file], `pasted-${taken + index + 1}.${file.type.split('/')[1] ?? 'png'}`, {
          type: file.type,
        }),
  );
}

/** The files a message can still take, of those offered. */
export function accepted(offered: readonly File[], taken: number): File[] {
  return offered.filter((file) => file.size <= MAX_BYTES).slice(0, Math.max(0, MAX_FILES - taken));
}
