/**
 * The Markdown of a chat reply (CHT-U01), parsed into a small tree the chat renders with its
 * own elements. Only what an assistant writes in a chat is here: paragraphs, headings, lists,
 * quotes, code, rules, tables, and emphasis, code and links inside a line. Raw HTML is text,
 * so nothing a model writes can become markup.
 *
 * A reply is parsed again on every streamed piece, so the parser never fails on half a
 * construct: an unclosed fence is a code block to the end, an unclosed `**` is two asterisks.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export interface ListItem {
  children: Block[];
}

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };

const PUNCTUATION = /[!-/:-@[-`{-~]/;

/** The closing run of `mark` after `from`, skipping escapes and code spans. */
function closing(source: string, mark: string, from: number): number {
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') i++;
    else if (char === '`') {
      const end = source.indexOf('`', i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (source.startsWith(mark, i)) {
      // `*` closes `*…*` only where it is not half of a `**`.
      if (mark.length === 1 && source[i + 1] === mark) i++;
      else if (i > from) return i;
    }
  }
  return -1;
}

/** `_` marks emphasis only at a word boundary, so `snake_case` stays as it is. */
function atBoundary(source: string, at: number): boolean {
  return at <= 0 || !/[\p{L}\p{N}]/u.test(source[at - 1] ?? '');
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };
  const wrap = (type: 'strong' | 'em' | 'del', mark: string, at: number): number | undefined => {
    const end = closing(source, mark, at + mark.length);
    if (end < 0) return undefined;
    flush();
    out.push({ type, children: parseInline(source.slice(at + mark.length, end)) });
    return end + mark.length;
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1] ?? '';
    let jump: number | undefined;
    if (char === '\\' && PUNCTUATION.test(next)) {
      buffer += next;
      jump = i + 2;
    } else if (char === '\n') {
      // A line break inside a paragraph is a line break: chat replies are not reflowed prose.
      flush();
      out.push({ type: 'break' });
      jump = i + 1;
    } else if (char === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ type: 'code', text: source.slice(i + 1, end) });
        jump = end + 1;
      }
    } else if (source.startsWith('**', i) || source.startsWith('__', i)) {
      jump = wrap('strong', source.slice(i, i + 2), i);
    } else if (source.startsWith('~~', i)) {
      jump = wrap('del', '~~', i);
    } else if (char === '*' && next !== ' ' && next !== '') {
      jump = wrap('em', '*', i);
    } else if (char === '_' && atBoundary(source, i) && next !== ' ' && next !== '') {
      jump = wrap('em', '_', i);
    } else if (char === '[') {
      const link = /^\[([^\]\n]*)\]\(([^)\s]+)\)/.exec(source.slice(i));
      if (link) {
        flush();
        out.push({ type: 'link', href: link[2]!, children: parseInline(link[1]!) });
        jump = i + link[0].length;
      }
    }
    if (jump === undefined) {
      buffer += char;
      jump = i + 1;
    }
    i = jump;
  }
  flush();
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^( *)([-*+])\s+(.*)$/;
const NUMBER = /^( *)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function cells(line: string): Inline[][] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => parseInline(cell.trim()));
}

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    BULLET.test(line) ||
    NUMBER.test(line) ||
    QUOTE.test(line)
  );
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(fence[1]!))
        body.push(lines[i++]!);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, children: parseInline(heading[2]!) });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) body.push(QUOTE.exec(lines[i++]!)![1]!);
      blocks.push({ type: 'quote', children: parseMarkdown(body.join('\n')) });
      continue;
    }

    const item = BULLET.exec(line) ?? NUMBER.exec(line);
    if (item) {
      const ordered = !BULLET.test(line);
      const indent = item[1]!.length;
      const marker = ordered ? NUMBER : BULLET;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const match = marker.exec(lines[i]!);
        if (!match || match[1]!.length !== indent) break;
        // What is indented under the item belongs to it: more text, or a nested list.
        const body = [match[3]!];
        i++;
        while (i < lines.length) {
          const below = lines[i]!;
          const depth = below.length - below.trimStart().length;
          if (below.trim() && depth <= indent) break;
          if (!below.trim() && !(lines[i + 1] ?? '').startsWith(' '.repeat(indent + 1))) break;
          body.push(below.slice(Math.min(depth, indent + 2)));
          i++;
        }
        items.push({ children: parseMarkdown(body.join('\n')) });
        while (i < lines.length && !lines[i]!.trim() && marker.test(lines[i + 1] ?? '')) i++;
      }
      blocks.push({ type: 'list', ordered, start: ordered ? Number(item[2]) : 1, items });
      continue;
    }

    if (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(cells(lines[i++]!));
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    const body = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !isBlockStart(lines[i]!)) body.push(lines[i++]!);
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n')) });
  }
  return blocks;
}
