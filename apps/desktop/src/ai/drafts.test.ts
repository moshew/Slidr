import { describe, expect, it } from 'vitest';
import type { Attachment } from '../agent/agentService';
import { createDrafts, NO_DRAFT } from './drafts';

/*
 * What is being written in the chats, outside the components that show them (the bug hunt's
 * `ai-ui.md`, finding 3: it was state of the chat's component, and went with it).
 */

const file = (name: string): Attachment => ({ name, mime: 'image/png', bytes: new Uint8Array(1) });

describe('what is being written in a chat', () => {
  it('is kept by what the chat is about, each apart from the others', () => {
    const drafts = createDrafts();
    drafts.change('deck', (draft) => ({ ...draft, text: 'A deck about the plan' }));
    drafts.change('slide-s_1', (draft) => ({ ...draft, text: 'A larger title' }));
    expect(drafts.store.getState()).toEqual({
      deck: { text: 'A deck about the plan', files: [] },
      'slide-s_1': { text: 'A larger title', files: [] },
    });
  });

  it('takes a file into the draft as it is by then, not as it was when the file was chosen', () => {
    const drafts = createDrafts();
    // Two files chosen one after the other, each read in its own time.
    const add = (name: string) => (draft: typeof NO_DRAFT) => ({
      ...draft,
      files: [...draft.files, file(name)],
    });
    drafts.change('deck', add('logo.png'));
    drafts.change('deck', (draft) => ({ ...draft, text: 'Use this logo' }));
    drafts.change('deck', add('photo.png'));
    const { text, files } = drafts.store.getState().deck!;
    expect(text).toBe('Use this logo');
    expect(files.map((f) => f.name)).toEqual(['logo.png', 'photo.png']);
  });

  it('is forgotten once it is empty: the message was sent, or wiped', () => {
    const drafts = createDrafts();
    drafts.change('deck', (draft) => ({ ...draft, text: 'Hello', files: [file('a.png')] }));
    drafts.change('slide-s_1', (draft) => ({ ...draft, text: 'Stays' }));
    drafts.change('deck', () => NO_DRAFT);
    expect(Object.keys(drafts.store.getState())).toEqual(['slide-s_1']);
    // And a subject nobody wrote for has no entry made for it.
    drafts.change('object-e_1', (draft) => ({ ...draft, text: '' }));
    expect(Object.keys(drafts.store.getState())).toEqual(['slide-s_1']);
  });
});
