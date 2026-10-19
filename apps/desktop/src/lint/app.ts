import type { Editor } from '../shell';
import { stageGestureActive } from '../stage/gesture';
import { DesignCheck } from './check';
import { measureDeckSlide } from './deckLint';

const checks = new WeakMap<Editor, DesignCheck>();

/** How long after the last change to a text that is being edited the user is still typing, in ms. */
const TYPING_MS = 1000;

/** The design check of an editor: one for the window, shared by the panel and the status bar. */
export function checkOf(editor: Editor): DesignCheck {
  let check = checks.get(editor);
  if (!check) {
    let changedAt = -Infinity;
    editor.bus.subscribe(() => {
      changedAt = performance.now();
    });
    // Not in the middle of a drag, and not in a pause between two words: the check waits until
    // the hand is off the slide and the text has been left alone for a moment.
    const busy = () =>
      stageGestureActive() ||
      (editor.selection.getState().editingElementId !== null &&
        performance.now() - changedAt < TYPING_MS);
    // The pictures a slide shows are the ones of the open document, looked up at every call.
    check = new DesignCheck(
      editor.bus,
      (deck, slide) => measureDeckSlide(deck, slide, (asset) => editor.assets.url(asset)),
      { busy },
    );
    checks.set(editor, check);
  }
  return check;
}
