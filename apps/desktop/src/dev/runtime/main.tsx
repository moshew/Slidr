/**
 * Dev page for the runtime and the HTML export (WG8-T01..T03, WG9B): /dev/runtime.html
 *
 * `?deck=<name>` picks a deck (see `decks.ts`); the default is the animated reference deck.
 * `&bare` leaves the toolbar out, so the show fills the window as an exported file does.
 * The slides are drawn by `SlideRenderer` in `present` mode and driven by the runtime's player,
 * which is how present mode will use it. "Export" writes the same deck to one HTML file, with the
 * same runtime inside. `data-ready` on <html> says the player has started; `window.slidrDev`
 * hands the player and the export to the end-to-end tests.
 */
import { exportHtml, type ExportResult } from '@slidr/html-export';
import type { AssetMeta, Deck } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import { bindControls, createPlayer, type Player, type PlayerState } from '@slidr/runtime';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { registerBuiltinFonts } from '../../fonts';
import { testAssetUrl } from '../slides/testAssets';
import { deckByName, deckNames } from './decks';

declare global {
  interface Window {
    slidrDev?: {
      player: Player | undefined;
      warnings: string[];
      exportDeck: () => Promise<ExportResult>;
    };
  }
}

const resolveAsset = (asset: AssetMeta) => testAssetUrl(asset.id);

const loadAsset = async (asset: AssetMeta): Promise<Blob | undefined> => {
  const url = testAssetUrl(asset.id);
  return url ? (await fetch(url)).blob() : undefined;
};

const exportDeck = (deck: Deck) => exportHtml(deck, { loadAsset });

const kB = (bytes: number) => `${(bytes / 1024).toFixed(0)} kB`;

function Show({ deck, onState }: { deck: Deck; onState: (state: PlayerState) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = viewport.current;
    const root = stage.current;
    if (!view || !root) return;
    let player: Player | undefined;
    let unbind: (() => void) | undefined;
    let stopped = false;
    const warnings: string[] = [];
    window.slidrDev = { player: undefined, warnings, exportDeck: () => exportDeck(deck) };
    // The show starts once the fonts are in, so the first animation does not play over a reflow.
    // Until then the slides are a column of unscaled pages: keep them out of sight.
    root.style.visibility = 'hidden';
    void settle().then(() => {
      if (stopped) return;
      root.style.visibility = '';
      const sections = Array.from(root.children) as HTMLElement[];
      player = createPlayer({
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
        onWarn: (message) => warnings.push(message),
      });
      unbind = bindControls(player, { viewport: view });
      player.subscribe(onState);
      onState(player.state);
      window.slidrDev = { player, warnings, exportDeck: () => exportDeck(deck) };
      document.documentElement.dataset.ready = 'true';
    });
    return () => {
      stopped = true;
      delete document.documentElement.dataset.ready;
      unbind?.();
      player?.destroy();
    };
  }, [deck, onState]);

  return (
    <div
      ref={viewport}
      data-testid="viewport"
      lang={deck.meta.lang}
      dir={deck.meta.dir}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div ref={stage}>
        {deck.slides.map((slide) => (
          <section key={slide.id} data-slide={slide.id}>
            <SlideRenderer deck={deck} slide={slide} mode="present" resolveAsset={resolveAsset} />
          </section>
        ))}
      </div>
    </div>
  );
}

function App({ deck, name, bare }: { deck: Deck; name: string; bare: boolean }) {
  const [state, setState] = useState<PlayerState>({ slide: 0, step: 0 });
  const [result, setResult] = useState<{ url: string; text: string } | string>();
  const run = () => {
    setResult('Exporting…');
    const started = performance.now();
    exportDeck(deck).then(
      (out) => {
        const url = URL.createObjectURL(new Blob([out.html], { type: 'text/html' }));
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const notes = out.warnings.length ? `, ${out.warnings.length} warnings` : '';
        setResult({
          url,
          text: `${out.slides} slides, ${kB(out.bytes)}, ${seconds} s${notes}`,
        });
      },
      (error: unknown) => setResult(error instanceof Error ? error.message : String(error)),
    );
  };
  const player = () => window.slidrDev?.player;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }}
    >
      <header
        hidden={bare}
        style={{
          display: bare ? 'none' : 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          background: '#f3f4f6',
          borderBottom: '1px solid #d9dce1',
        }}
      >
        <select
          aria-label="Deck"
          value={name}
          onChange={(event) => (location.search = `?deck=${event.target.value}`)}
        >
          {deckNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button type="button" onClick={() => player()?.prev()}>
          Back
        </button>
        <button type="button" onClick={() => player()?.next()}>
          Next
        </button>
        <span data-testid="state">
          slide {state.slide + 1} / {deck.slides.length}, step {state.step}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={run}>
          Export HTML
        </button>
        {typeof result === 'string' ? <span>{result}</span> : null}
        {result && typeof result !== 'string' ? (
          <>
            <span>{result.text}</span>
            <a href={result.url} target="_blank" rel="noreferrer">
              Open
            </a>
            <a href={result.url} download={`${name}.html`}>
              Save
            </a>
          </>
        ) : null}
      </header>
      <Show deck={deck} onState={setState} />
    </div>
  );
}

registerBuiltinFonts();
const params = new URLSearchParams(location.search);
const name = params.get('deck') ?? 'reference';
const deck = deckByName(name);
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

createRoot(root).render(
  <StrictMode>
    {deck ? <App deck={deck} name={name} bare={params.has('bare')} /> : <p>No deck named {name}</p>}
  </StrictMode>,
);
