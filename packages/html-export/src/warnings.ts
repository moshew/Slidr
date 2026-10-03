/**
 * What an export could not carry over as it is in the deck. This package has no strings of a UI:
 * `code` says what happened, for a host to say in its own words and language, and `message` says
 * it in English, for a log.
 */
export type ExportWarningCode =
  /** An asset of the deck could not be read: it is missing from the file. */
  | 'asset-unreadable'
  /** A font file could not be read: its face is missing from the file. */
  | 'font-unreadable'
  /** A face could not be cut down to the characters in use: it is in the file whole. */
  | 'font-whole'
  /** The subsetter could not be loaded: every face is in the file whole. */
  | 'fonts-whole'
  /** The browser cannot write shadow roots: `html` elements are empty in the file. */
  | 'shadow-roots';

export interface ExportWarning {
  code: ExportWarningCode;
  /** The asset or the face the warning is about, when it is about one. */
  subject?: string;
  message: string;
}
