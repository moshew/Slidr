import { plainText, type Element, type RichText } from '@slidr/model';

/**
 * Words as a reader counts them, in any script: runs of characters between spaces that hold a
 * letter or a digit. "ה-API" and a URL are one word each; a lone dash or bullet is none.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** The text a free HTML block shows, roughly: its markup without tags, styles and scripts. */
function htmlText(markup: string): string {
  return markup
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ');
}

/** The rich text of an element that is read as running text: a text box or a shape with text. */
export function proseOf(element: Element): RichText | undefined {
  if (element.type === 'text') return element.content;
  if (element.type === 'shape') return element.content;
  return undefined;
}

/**
 * Words of an element's running text. A table is data, not prose, and is not counted; the text
 * of an `html` element is.
 */
export function wordsIn(element: Element): number {
  if (element.type === 'html') return countWords(htmlText(element.markup));
  const prose = proseOf(element);
  return prose ? countWords(plainText(prose)) : 0;
}

/** List items of an element, at any level, that have text. */
export function bulletsIn(element: Element): number {
  const prose = proseOf(element);
  if (!prose) return 0;
  return prose.paragraphs.filter((p) => p.list && p.runs.some((run) => run.text.trim() !== ''))
    .length;
}
