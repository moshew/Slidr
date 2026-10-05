import type { Deck } from '@slidr/model';
import { SlideRenderer, type AssetResolver } from '@slidr/renderer';
import { bindControls, createPlayer, type Player, type PlayerState } from '@slidr/runtime';
import { UiProvider, type Dir } from '@slidr/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '../i18n';
import { Controls } from './Controls';
import { opensInShow } from './links';
import { showScreen, type Screen } from './screen';

/*
 * Present mode (WG8-T06, PRS-01, PRS-02): the deck over the whole window, played by the same
 * runtime as the editor's preview and an exported file (SPEC 5.6). React draws every slide with
 * `SlideRenderer` in `present` mode; the runtime's player shows one at a time and plays the
 * transitions and the timelines; `bindControls` gives it the keyboard, the mouse and a clicker.
 *
 * This file draws on the screen itself, in the slide's own terms: black around the slide, like
 * the Stage it is exempt from the design-system scan. The bar over it (`Controls.tsx`) is not.
 */

export interface ShowProps {
  deck: Deck;
  resolveAsset: AssetResolver;
  /** The slide the show opens on. */
  start: number;
  /** The direction of the app's own UI, for the bar. */
  dir: Dir;
  /** Whether to take the whole screen at once. */
  fullscreen: boolean;
  /** The show ended; `slide` is the one it ended on. */
  onExit: (slide: number) => void;
}

/** The pointer and the bar go out of sight when the pointer has been still this long. */
const IDLE_MS = 2500;

/** Above the editor; below the app's dialogs and menus, which may still have to be answered. */
const LAYER = 40;

/** Fonts in, and text that shrinks to fit measured again after them. */
async function drawn(doc: Document): Promise<void> {
  await doc.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    // A window in the background gets no frames.
    setTimeout(resolve, 250);
  });
  await doc.fonts.ready;
}

/** Every slide of the deck, drawn once: a step of the show changes nothing React draws here. */
const Slides = memo(function Slides({
  deck,
  resolveAsset,
}: Pick<ShowProps, 'deck' | 'resolveAsset'>) {
  return deck.slides.map((slide) => (
    <section key={slide.id} data-slide={slide.id}>
      <SlideRenderer
        deck={deck}
        slide={slide}
        mode="present"
        resolveAsset={resolveAsset}
        opensLink={opensInShow}
      />
    </section>
  ));
});

export function Show({ deck, resolveAsset, start, dir, fullscreen, onExit }: ShowProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const player = useRef<Player | undefined>(undefined);
  const screen = useRef<Screen | undefined>(undefined);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<PlayerState>({ slide: start, step: 0 });
  const [full, setFull] = useState(false);
  const [awake, setAwake] = useState(false);
  const [onBar, setOnBar] = useState(false);

  const exiting = useRef(false);
  const exit = useCallback(() => {
    // A second Esc while the window is still leaving full screen is the same exit.
    if (exiting.current) return;
    exiting.current = true;
    const at = player.current?.state.slide ?? start;
    void (screen.current?.set(false) ?? Promise.resolve()).then(() => onExit(at));
  }, [onExit, start]);

  const toggleFull = useCallback(() => {
    const current = screen.current;
    if (current) void current.set(!current.full).then(setFull);
  }, []);

  // ---- The screen: the keyboard goes to the show, and the show to the whole screen ----

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    view.focus({ preventScroll: true });
    const current = showScreen(view);
    screen.current = current;
    if (fullscreen) void current.set(true).then(setFull);
    // Esc in a browser's full screen never reaches the page: the show ends with it.
    const stop = current.onLeft(() => onExit(player.current?.state.slide ?? start));
    return () => {
      stop();
      screen.current = undefined;
    };
  }, [fullscreen, onExit, start]);

  // ---- The player ----

  useEffect(() => {
    const view = viewport.current;
    const root = stage.current;
    if (!view || !root) return;
    let stopped = false;
    let unbind: (() => void) | undefined;
    // Until the fonts are in the slides are a column of unscaled pages: keep them out of sight.
    root.style.visibility = 'hidden';
    void drawn(view.ownerDocument).then(() => {
      if (stopped) return;
      root.style.visibility = '';
      const sections = Array.from(root.children) as HTMLElement[];
      const show = createPlayer({
        viewport: view,
        stage: root,
        slides: deck.slides.map((slide, i) => ({
          el: sections[i] as HTMLElement,
          id: slide.id,
          transition: slide.transition,
          timeline: slide.timeline,
          hidden: slide.hidden,
        })),
        size: deck.size,
        start,
        // Past the last step the screen goes black and says so; one more step is the way out.
        end: { text: i18n.t('present:end'), leave: exit },
        onWarn: (message) => console.warn(message),
      });
      // No hash: the address is the app's. F is the window's full screen, not the browser's.
      unbind = bindControls(show, { viewport: view, hash: false, fullscreen: toggleFull });
      show.subscribe(setState);
      setState(show.state);
      player.current = show;
      view.dataset.ready = 'true';
    });
    return () => {
      stopped = true;
      unbind?.();
      player.current?.destroy();
      player.current = undefined;
    };
  }, [deck, start, toggleFull, exit]);

  // ---- Keys: Esc ends the show, and nothing the show does not take reaches the editor ----

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    // A dialog of the app over the show (a question before the window closes) keeps its keys.
    const ours = (event: Event) =>
      event.target === document.body ||
      (event.target instanceof Node && view.contains(event.target));
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !ours(event)) return;
      event.preventDefault();
      event.stopPropagation();
      exit();
    };
    const guard = (event: KeyboardEvent) => {
      if (!ours(event)) return;
      // The editor's shortcuts listen on the window: undo, save and the rest wait for the end.
      event.stopPropagation();
      // The webview's own keys too (reload, find, print). Alt+F4 still closes the window, and
      // F12 still opens the developer tools.
      const closes = event.altKey && event.key === 'F4';
      const browserKey = event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.key);
      if (browserKey && !closes && event.key !== 'F12') event.preventDefault();
    };
    // Before the runtime's listener, which is on the document too.
    window.addEventListener('keydown', onEscape, true);
    document.addEventListener('keydown', guard);
    return () => {
      window.removeEventListener('keydown', onEscape, true);
      document.removeEventListener('keydown', guard);
    };
  }, [exit]);

  // ---- The pointer shows itself and the bar while it moves ----

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: { x: number; y: number } | undefined;
    const wake = (event: PointerEvent) => {
      // A slide changing under a still pointer sends a move too.
      if (last?.x === event.clientX && last.y === event.clientY) return;
      last = { x: event.clientX, y: event.clientY };
      setAwake(true);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), IDLE_MS);
    };
    view.addEventListener('pointermove', wake);
    return () => {
      view.removeEventListener('pointermove', wake);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  // After a click on the bar the keys are the show's again, not the button's.
  const refocus = () => viewport.current?.focus({ preventScroll: true });
  const previous = () => {
    player.current?.prev();
    refocus();
  };
  const next = () => {
    player.current?.next();
    refocus();
  };
  const fullScreen = () => {
    toggleFull();
    refocus();
  };
  const shown = awake || onBar;

  return (
    <div
      ref={viewport}
      data-testid="present"
      data-slide={state.slide}
      data-step={state.step}
      data-ended={state.ended}
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: LAYER,
        overflow: 'hidden',
        background: '#000',
        outline: 'none',
        cursor: shown ? 'default' : 'none',
      }}
    >
      <div ref={stage}>
        <Slides deck={deck} resolveAsset={resolveAsset} />
      </div>
      {/* Tooltips are drawn inside the show: in a browser's full screen nothing else is seen. */}
      <div ref={setLayer} />
      <UiProvider dir={dir} portalContainer={layer}>
        <div onPointerEnter={() => setOnBar(true)} onPointerLeave={() => setOnBar(false)}>
          <Controls
            visible={shown}
            slide={state.slide + 1}
            total={deck.slides.length}
            full={full}
            onPrevious={previous}
            onNext={next}
            onFullscreen={fullScreen}
            onExit={exit}
          />
        </div>
      </UiProvider>
    </div>
  );
}
