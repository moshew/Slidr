// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  createDeck,
  createDeckStore,
  createElement,
  createSelectionStore,
  createSlide,
  findElementInDeck,
  plainText,
  richText,
  type Deck,
  type Frame,
} from '@slidr/model';
import { registerMessages } from '../i18n';
import type { Editor } from '../shell';
import { en, he } from './messages';
import {
  closeFind,
  findSession,
  matchesIn,
  openFind,
  replaceAll,
  replaceCurrent,
  standingOn,
  step,
} from './session';

registerMessages('find', { he, en });

const box: Frame = { x: 0, y: 0, w: 400, h: 200 };

const text = (id: string, content: string, extra: { locked?: boolean } = {}) =>
  createElement.text({ id, frame: box, content: richText(content), ...extra });

/** Three slides: "old" twice on the first, in a group and in a locked box on the second. */
function threeSlides(): Deck {
  return createDeck({
    lang: 'he',
    slides: [
      createSlide({ id: 's_one', elements: [text('e_a', 'old and old'), text('e_b', 'nothing')] }),
      createSlide({
        id: 's_two',
        elements: [
          createElement.group({ id: 'e_group', frame: box, children: [text('e_c', 'an old box')] }),
          text('e_locked', 'old and locked', { locked: true }),
        ],
        notes: richText('an old note'),
      }),
      createSlide({ id: 's_three', elements: [text('e_d', 'the last old one')] }),
    ],
  });
}

/** The parts of the editor the find bar works with. */
function editorOn(deck: Deck): Editor {
  const bus = new CommandBus(deck, { validate: true });
  return {
    bus,
    deck: createDeckStore(bus),
    selection: createSelectionStore(bus),
  } as unknown as Editor;
}

function read(editor: Editor, id: string): string {
  const element = findElementInDeck(editor.bus.deck, id)?.element;
  if (element?.type !== 'text') throw new Error(`No text box ${id}`);
  return plainText(element.content);
}

/** Where the bar stands: the slide, the selection, and the number of the match among all. */
function standing(editor: Editor) {
  const { currentSlideId, selectedElementIds } = editor.selection.getState();
  const session = findSession.getState();
  const matches = matchesIn(editor.bus.deck, session);
  const current = standingOn(matches, session.current, currentSlideId);
  return {
    slide: currentSlideId,
    selected: selectedElementIds,
    match: current ? matches.indexOf(current) + 1 : 0,
    of: matches.length,
  };
}

let editor: Editor;

beforeEach(() => {
  editor = editorOn(threeSlides());
  findSession.setState(findSession.getInitialState());
  openFind(editor);
  findSession.setState({ query: 'old', replacement: 'new' });
});

describe('going through the matches', () => {
  it('opens on the find field, and with the replace row when asked', () => {
    const { focusRequest } = findSession.getState();
    expect(findSession.getState()).toMatchObject({ open: true, replacing: false });
    openFind(editor, true);
    expect(findSession.getState()).toMatchObject({ open: true, replacing: true });
    // Asking for the bar again keeps the row, and asks for the keyboard again.
    openFind(editor);
    expect(findSession.getState().replacing).toBe(true);
    expect(findSession.getState().focusRequest).toBe(focusRequest + 2);
    closeFind();
    expect(findSession.getState()).toMatchObject({ open: false, current: null, query: 'old' });
    openFind(editor);
    expect(findSession.getState().replacing).toBe(false);
  });

  it('stands nowhere until a step, then goes from match to match across the slides', () => {
    expect(standing(editor)).toEqual({ slide: 's_one', selected: [], match: 0, of: 6 });
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_one', selected: ['e_a'], match: 1, of: 6 });
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_one', selected: ['e_a'], match: 2, of: 6 });
    // A child of a group is selected itself: the Stage goes into the group for it (ADR-016).
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_two', selected: ['e_c'], match: 3, of: 6 });
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_two', selected: ['e_locked'], match: 4, of: 6 });
    // Speaker notes have nothing to select.
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_two', selected: [], match: 5, of: 6 });
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_three', selected: ['e_d'], match: 6, of: 6 });
    step(editor, 1);
    expect(standing(editor)).toMatchObject({ slide: 's_one', match: 1 });
    step(editor, -1);
    expect(standing(editor)).toMatchObject({ slide: 's_three', match: 6 });
    step(editor, -1);
    expect(standing(editor)).toMatchObject({ slide: 's_two', match: 5 });
  });

  it('goes on from the slide the user moved to', () => {
    step(editor, 1);
    editor.selection.getState().setCurrentSlide('s_three');
    expect(standing(editor)).toMatchObject({ slide: 's_three', match: 0 });
    step(editor, -1);
    expect(standing(editor)).toMatchObject({ slide: 's_three', match: 6 });
    editor.selection.getState().setCurrentSlide('s_two');
    step(editor, 1);
    expect(standing(editor)).toMatchObject({ slide: 's_two', selected: ['e_c'], match: 3 });
  });

  it('leaves the text that is being edited before it shows a match', () => {
    editor.selection.getState().startEditing('e_b');
    expect(editor.selection.getState().editingElementId).toBe('e_b');
    step(editor, 1);
    expect(editor.selection.getState()).toMatchObject({
      editingElementId: null,
      selectedElementIds: ['e_a'],
    });
  });

  it('follows the deck: a match that is gone is no longer the current one', () => {
    step(editor, 1);
    step(editor, 1);
    editor.bus.dispatch({
      type: 'text.set',
      slideId: 's_one',
      elementId: 'e_a',
      content: richText('old and gone'),
    });
    expect(standing(editor)).toMatchObject({ match: 0, of: 5 });
    // The step goes on from where the match was.
    step(editor, 1);
    expect(standing(editor)).toMatchObject({ slide: 's_two', selected: ['e_c'], match: 2 });
  });

  it('has nowhere to go without a match', () => {
    findSession.setState({ query: 'absent' });
    step(editor, 1);
    expect(standing(editor)).toEqual({ slide: 's_one', selected: [], match: 0, of: 0 });
  });
});

describe('replace', () => {
  it('goes to a match first, and replaces it at the next press, as one undo step', () => {
    const before = editor.bus.deck;
    replaceCurrent(editor);
    expect(editor.bus.undoStack).toHaveLength(0);
    expect(standing(editor)).toMatchObject({ slide: 's_one', selected: ['e_a'], match: 1 });

    replaceCurrent(editor);
    expect(read(editor, 'e_a')).toBe('new and old');
    expect(editor.bus.undoStack).toHaveLength(1);
    expect(editor.bus.undoStack[0]).toMatchObject({ commands: ['text.set'], label: 'החלפה' });
    // It went on to the next match, which is now the first of five.
    expect(standing(editor)).toMatchObject({ slide: 's_one', selected: ['e_a'], match: 1, of: 5 });

    expect(editor.bus.undo()).toBe(true);
    expect(editor.bus.deck).toEqual(before);
    expect(editor.bus.canUndo).toBe(false);
  });

  it('does not find its own replacement again', () => {
    findSession.setState({ replacement: 'old old' });
    replaceCurrent(editor);
    replaceCurrent(editor);
    expect(read(editor, 'e_a')).toBe('old old and old');
    // The two "old" just written are passed: the next match is the one that was second.
    expect(standing(editor)).toMatchObject({ match: 3, of: 7 });
    replaceCurrent(editor);
    expect(read(editor, 'e_a')).toBe('old old and old old');
    expect(standing(editor)).toMatchObject({ slide: 's_two', selected: ['e_c'] });
  });

  it('passes over a match in a locked element, and says so', () => {
    editor.selection.getState().setCurrentSlide('s_two');
    step(editor, 1);
    step(editor, 1);
    expect(standing(editor)).toMatchObject({ selected: ['e_locked'], match: 4 });
    replaceCurrent(editor);
    expect(read(editor, 'e_locked')).toBe('old and locked');
    expect(editor.bus.undoStack).toHaveLength(0);
    expect(findSession.getState().outcome).toEqual({ replaced: 0, skipped: 1 });
    expect(standing(editor)).toMatchObject({ slide: 's_two', selected: [], match: 5 });
    // The next step takes the remark away.
    step(editor, 1);
    expect(findSession.getState().outcome).toBeNull();
  });

  it('replaces in speaker notes with a slide update', () => {
    editor.selection.getState().setCurrentSlide('s_two');
    step(editor, -1);
    expect(standing(editor)).toMatchObject({ slide: 's_two', selected: [], match: 5 });
    replaceCurrent(editor);
    expect(plainText(editor.bus.deck.slides[1]!.notes!)).toBe('an new note');
    expect(editor.bus.undoStack[0]).toMatchObject({ commands: ['slide.update'] });
  });
});

describe('replace all', () => {
  it('replaces across the deck as one undo step, and counts what a lock kept', () => {
    const before = editor.bus.deck;
    replaceAll(editor);
    expect(read(editor, 'e_a')).toBe('new and new');
    expect(read(editor, 'e_c')).toBe('an new box');
    expect(read(editor, 'e_d')).toBe('the last new one');
    expect(plainText(editor.bus.deck.slides[1]!.notes!)).toBe('an new note');
    expect(read(editor, 'e_locked')).toBe('old and locked');
    expect(findSession.getState()).toMatchObject({
      current: null,
      outcome: { replaced: 5, skipped: 1 },
    });
    expect(standing(editor)).toMatchObject({ slide: 's_one', match: 0, of: 1 });

    expect(editor.bus.undoStack).toHaveLength(1);
    expect(editor.bus.undoStack[0]).toMatchObject({ label: 'החלפת הכול' });
    expect(editor.bus.undo()).toBe(true);
    expect(editor.bus.deck).toEqual(before);
    expect(editor.bus.canUndo).toBe(false);
    expect(editor.bus.redo()).toBe(true);
    expect(read(editor, 'e_d')).toBe('the last new one');
  });

  it('changes nothing where every match is locked, or where there is none', () => {
    findSession.setState({ query: 'locked' });
    replaceAll(editor);
    expect(editor.bus.undoStack).toHaveLength(0);
    expect(findSession.getState().outcome).toEqual({ replaced: 0, skipped: 1 });
    findSession.setState({ query: 'absent', outcome: null });
    replaceAll(editor);
    expect(editor.bus.undoStack).toHaveLength(0);
    expect(findSession.getState().outcome).toBeNull();
  });

  it('leaves the text that is being edited before it changes the deck', () => {
    editor.selection.getState().startEditing('e_a');
    replaceAll(editor);
    expect(editor.selection.getState().editingElementId).toBeNull();
    expect(read(editor, 'e_a')).toBe('new and new');
  });
});
