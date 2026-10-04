import type { Editor } from '../shell';
import { DesignCheck } from './check';
import { measureDeckSlide } from './deckLint';

const checks = new WeakMap<Editor, DesignCheck>();

/** The design check of an editor: one for the window, shared by the panel and the status bar. */
export function checkOf(editor: Editor): DesignCheck {
  let check = checks.get(editor);
  if (!check) {
    // The pictures a slide shows are the ones of the open document, looked up at every call.
    check = new DesignCheck(editor.bus, (deck, slide) =>
      measureDeckSlide(deck, slide, (asset) => editor.assets.url(asset)),
    );
    checks.set(editor, check);
  }
  return check;
}
