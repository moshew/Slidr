import type { Editor as TextEditorInstance } from '@tiptap/core';
import { createStore } from 'zustand/vanilla';

/*
 * The text editor that is open on the Stage, for the code that formats text from outside it: the
 * tools of row B and the keyboard shortcuts. The Stage mounts the editor through the renderer's
 * `textSlot` and knows nothing of the toolbar, so the editor announces itself here.
 */

export interface ActiveEditor {
  editor: TextEditorInstance;
  slideId: string;
  elementId: string;
}

interface ActiveEditorState {
  active: ActiveEditor | null;
  /** Goes up with every transaction of the editor: the selection or the text may have changed. */
  version: number;
}

export const activeEditor = createStore<ActiveEditorState>(() => ({ active: null, version: 0 }));

/** Announces the editor while it is mounted. Returns the function that withdraws it. */
export function announceEditor(active: ActiveEditor): () => void {
  const bump = () => activeEditor.setState((s) => ({ version: s.version + 1 }));
  activeEditor.setState((s) => ({ active, version: s.version + 1 }));
  active.editor.on('transaction', bump);
  return () => {
    active.editor.off('transaction', bump);
    if (activeEditor.getState().active === active)
      activeEditor.setState((s) => ({ active: null, version: s.version + 1 }));
  };
}

/** The editor open on this element, if it is the one being edited. */
export function editorFor(elementId: string | null): ActiveEditor | null {
  const { active } = activeEditor.getState();
  return active && active.elementId === elementId && !active.editor.isDestroyed ? active : null;
}
