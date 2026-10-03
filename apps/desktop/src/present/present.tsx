import type { AssetMeta } from '@slidr/model';
import { createRoot } from 'react-dom/client';
import { i18n } from '../i18n';
import { focusStage, tell, type Editor } from '../shell';
import { Show } from './Show';

/*
 * Starting and ending a show. The show is a React root of its own, over the app: the shell has
 * no place for it and does not need one, and while it runs the editor under it is left as it is.
 */

export interface PresentOptions {
  /** Where the show opens: the first slide that is not hidden, or the one on the Stage. */
  from: 'first' | 'current';
  /** Default true. Tests of the show itself leave the screen alone. */
  fullscreen?: boolean;
}

let ending: (() => void) | undefined;

/** Whether a show is running. */
export function isPresenting(): boolean {
  return ending !== undefined;
}

/** Ends the running show, if there is one. */
export function stopPresenting(): void {
  ending?.();
}

/** Starts a show of the open deck. False when there was nothing to show, or one is running. */
export function startPresenting(editor: Editor, options: PresentOptions): boolean {
  if (ending) return false;
  // The deck as it is now: a change made while the show runs waits for the next one.
  const deck = editor.bus.deck;
  if (deck.slides.length === 0) {
    void tell(i18n.t('present:noSlides'));
    return false;
  }
  const selection = editor.selection.getState();
  // Text being edited is in the model already; the editor's caret has no place under a show.
  selection.stopEditing();
  const current = deck.slides.findIndex((slide) => slide.id === selection.currentSlideId);
  const first = deck.slides.findIndex((slide) => !slide.hidden);
  const start = options.from === 'current' && current !== -1 ? current : Math.max(first, 0);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  ending = () => {
    ending = undefined;
    root.unmount();
    host.remove();
  };
  const onExit = (slide: number) => {
    if (!ending) return;
    ending();
    // Back in the editor on the slide the show ended on.
    const id = deck.slides[slide]?.id;
    if (id) editor.selection.getState().setCurrentSlide(id);
    focusStage();
  };
  root.render(
    <Show
      deck={deck}
      resolveAsset={(asset: AssetMeta) => editor.assets.url(asset)}
      start={start}
      dir={i18n.dir()}
      fullscreen={options.fullscreen ?? true}
      onExit={onExit}
    />,
  );
  return true;
}
