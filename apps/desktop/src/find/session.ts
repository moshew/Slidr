import { newId, type Command, type Deck } from '@slidr/model';
import { createStore } from 'zustand/vanilla';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
// By file, not through the shell's index: these are plain functions, and the index loads the app.
import { focusStage, stageElement } from '../shell/stageDom';
import { syncGrowHeight } from '../text/actions';
import { editorFor } from '../text/activeEditor';
import { cellsWritten } from '../text/cellScope';
import { replaceCommands } from './replace';
import { findMatches, sameMatch, stepFrom, type FindOptions, type Match } from './search';

/*
 * The find bar's state, and what it does to the editor (TXT-12): going to a match, replacing
 * one, replacing all. The matches themselves are not kept: they are those of the deck as it is
 * now, found again whenever the deck, the query or an option changes. None of this is part of the
 * document or of undo (CMD-05).
 */

export interface FindSession extends FindOptions {
  open: boolean;
  /** The replace row is shown. */
  replacing: boolean;
  query: string;
  replacement: string;
  /**
   * The match the bar went to last. It counts as the current one while it is still a match of the
   * deck and its slide is the one on the Stage; otherwise it is only where the next step goes on
   * from.
   */
  current: Match | null;
  /** What the last "replace" or "replace all" did, until the next step. */
  outcome: { replaced: number; skipped: number } | null;
  /** Goes up whenever the bar is asked for: its find field takes the keyboard. */
  focusRequest: number;
}

export const findSession = createStore<FindSession>(() => ({
  open: false,
  replacing: false,
  query: '',
  replacement: '',
  matchCase: false,
  wholeWord: false,
  current: null,
  outcome: null,
  focusRequest: 0,
}));

type Search = Pick<FindSession, 'query' | 'matchCase' | 'wholeWord'>;

let last: (Search & { deck: Deck; matches: Match[] }) | undefined;

/** The matches of a search in a deck. The last answer is kept: the bar and its keys ask alike. */
export function matchesIn(deck: Deck, { query, matchCase, wholeWord }: Search): Match[] {
  if (
    last?.deck !== deck ||
    last.query !== query ||
    last.matchCase !== matchCase ||
    last.wholeWord !== wholeWord
  ) {
    const matches = findMatches(deck, query, { matchCase, wholeWord });
    last = { deck, query, matchCase, wholeWord, matches };
  }
  return last.matches;
}

/** The match the bar stands on, out of the matches of the deck as it is now. */
export function standingOn(
  matches: readonly Match[],
  current: Match | null,
  slideId: string | null,
): Match | undefined {
  if (!current || current.slideId !== slideId) return undefined;
  return matches.find((match) => sameMatch(match, current));
}

/* ---------------------------------------------------------------- opening and closing */

/** The text selected in the text editor on the Stage, when it is within one line. */
function selectedLine(editor: Editor): string | undefined {
  const active = editorFor(editor.selection.getState().editingElementId);
  if (!active) return undefined;
  const { doc, selection } = active.editor.state;
  const text = doc.textBetween(selection.from, selection.to, '\n', '\n');
  return text && !text.includes('\n') ? text : undefined;
}

/**
 * Opens the bar on its find field (Ctrl+F), with the replace row when asked (Ctrl+H). Text that is
 * selected in the text editor becomes what is looked for.
 */
export function openFind(editor: Editor, replace = false): void {
  const selected = selectedLine(editor);
  findSession.setState((s) => ({
    open: true,
    replacing: replace || (s.open && s.replacing),
    ...(selected === undefined ? {} : { query: selected }),
    outcome: null,
    focusRequest: s.focusRequest + 1,
  }));
}

/** Closes the bar and gives the keyboard back to the Stage. What was looked for is remembered. */
export function closeFind(): void {
  findSession.setState({ open: false, current: null, outcome: null });
  focusStage();
}

/* ---------------------------------------------------------------- going to a match */

const focusInBar = (): boolean =>
  Boolean(document.activeElement?.closest('[data-testid="find-bar"]'));

/**
 * Shows a match: its slide becomes the current one and its element the selection; a child of a
 * group takes the Stage into that group (ADR-016). Text that is being edited is left first: the
 * model is what was searched, and the editor only follows it (ADR-012).
 */
function goTo(editor: Editor, match: Match): void {
  const selection = editor.selection.getState();
  if (selection.editingElementId) {
    selection.stopEditing();
    // The editor had the keyboard, and it goes with it.
    if (!focusInBar()) focusStage();
  }
  selection.setCurrentSlide(match.slideId);
  // A match in the speaker notes has nothing on the Stage to select.
  if (match.elementId) selection.selectElements([match.elementId]);
  else selection.clearSelection();
}

/** Goes to the next match, or to the previous one (Enter and Shift+Enter, F3 and Shift+F3). */
export function step(editor: Editor, direction: 1 | -1): void {
  const session = findSession.getState();
  const { deck } = editor.bus;
  const slideId = editor.selection.getState().currentSlideId;
  // On another slide than the one the bar went to, the search goes on from where the user is.
  const from = session.current?.slideId === slideId ? session.current : null;
  const slide = deck.slides.findIndex((s) => s.id === slideId);
  const target = stepFrom(matchesIn(deck, session), from, direction, slide) ?? null;
  findSession.setState({ current: target, outcome: null });
  if (target) goTo(editor, target);
}

/* ---------------------------------------------------------------- replacing */

/**
 * Sends the commands of a replacement as one undo step. What the Stage draws taller for it takes
 * its new height in the same step, as after any other change of text: a text box that grows with
 * its text, the rows of a table. Only what is on the Stage can be measured.
 */
function send({ bus }: Editor, commands: readonly Command[], label: string): void {
  const txId = newId('tx');
  bus.batch(commands, { txId, label });
  const tables = new Set<string>();
  for (const command of commands) {
    if (command.type !== 'text.set' || !stageElement(command.elementId)) continue;
    if (command.cell) tables.add(command.elementId);
    else syncGrowHeight(bus, command.elementId, txId);
  }
  for (const elementId of tables) cellsWritten(bus, elementId, txId);
}

/**
 * Replaces the match the bar stands on and goes to the next one. Nothing is replaced before it was
 * shown: with no current match, the first press only goes to one. A match in a locked element is
 * passed over.
 */
export function replaceCurrent(editor: Editor): void {
  const session = findSession.getState();
  const { deck } = editor.bus;
  const slideId = editor.selection.getState().currentSlideId;
  const current = standingOn(matchesIn(deck, session), session.current, slideId);
  if (!current) return step(editor, 1);
  const { commands, replaced, skipped } = replaceCommands(deck, [current], session.replacement);
  if (replaced) {
    send(editor, commands, i18n.t('find:history.replace'));
    // The search goes on after what was written, so a replacement that holds the query is not
    // found again and again.
    const end = current.start + session.replacement.length;
    findSession.setState({ current: { ...current, start: end, end } });
  }
  step(editor, 1);
  if (skipped) findSession.setState({ outcome: { replaced, skipped } });
}

/** Replaces every match in the deck that is not in a locked element, as one undo step. */
export function replaceAll(editor: Editor): void {
  const session = findSession.getState();
  const { deck } = editor.bus;
  const matches = matchesIn(deck, session);
  if (matches.length === 0) return;
  const { commands, replaced, skipped } = replaceCommands(deck, matches, session.replacement);
  if (replaced) {
    const selection = editor.selection.getState();
    if (selection.editingElementId) selection.stopEditing();
    send(editor, commands, i18n.t('find:history.replaceAll'));
  }
  findSession.setState({ current: null, outcome: { replaced, skipped } });
}
