/**
 * Dev page for the Stage (WG2-T03..T06): /dev/stage.html[?deck=<name>&slide=<n>]
 * A deck on a real CommandBus with undo, zoom and a slide picker, without the app shell.
 * `window.slidr` exposes the bus and the selection to Playwright.
 */
import '../../app.css';
import {
  CommandBus,
  createDeck,
  createDeckStore,
  createElement,
  createSelectionStore,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { UiProvider } from '@slidr/ui';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { registerBuiltinFonts } from '../../fonts';
import { Filmstrip } from '../../stage/Filmstrip';
import { insertAssetsCommands } from '../../stage/insert';
import { Stage } from '../../stage/Stage';
import { testAssetUrl } from '../slides/testAssets';

/** 200 slides, for the Filmstrip's virtualization (NFR-05). */
function bigDeck(): Deck {
  return createDeck({
    lang: 'en',
    slides: Array.from({ length: 200 }, (_, i) =>
      createSlide({
        id: `s_big_${i}`,
        elements: [
          createElement.text({
            id: `e_big_${i}`,
            frame: { x: 160, y: 400, w: 1600, h: 280 },
            content: richText(`Slide ${i + 1}`, {
              dir: 'ltr',
              align: 'center',
              styleRef: 'display',
            }),
          }),
        ],
      }),
    ),
  });
}

const decks: Record<string, () => Deck> = {
  reference: referenceDeck,
  big: bigDeck,
  hebrew: fixtureDecks.hebrewDeck,
  english: fixtureDecks.englishDeck,
  mixed: fixtureDecks.mixedDeck,
  'all-elements': fixtureDecks.allElementsDeck,
};

const params = new URLSearchParams(location.search);
const deck = (decks[params.get('deck') ?? 'all-elements'] ?? fixtureDecks.allElementsDeck)();
const bus = new CommandBus(deck);
const deckStore = createDeckStore(bus);
const selection = createSelectionStore(bus);
const start = deck.slides[Number(params.get('slide') ?? 0)];
if (start) selection.getState().setCurrentSlide(start.id);
Object.assign(window, { slidr: { bus, selection } });

/** Assets dropped on the dev page live in memory as data URLs; the app stores them in the workspace. */
const dropped = new Map<string, string>();
const resolveAsset = (asset: AssetMeta) => dropped.get(asset.id) ?? testAssetUrl(asset.id);

async function importFile(file: File): Promise<AssetMeta | undefined> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const url = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
  const kind = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[0];
  if (kind !== 'image' && kind !== 'svg' && kind !== 'video' && kind !== 'audio') return undefined;
  let size: { width?: number; height?: number } = {};
  if (kind === 'image' || kind === 'svg') {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    if (img.naturalWidth) size = { width: img.naturalWidth, height: img.naturalHeight };
  }
  dropped.set(id, url);
  const ext = file.name.split('.').pop() ?? 'bin';
  return {
    id,
    file: `${id}.${ext}`,
    mime: file.type,
    kind,
    bytes: file.size,
    origin: 'upload',
    name: file.name,
    ...size,
  };
}

async function onFiles(files: File[], at: { x: number; y: number }) {
  const slideId = selection.getState().currentSlideId;
  if (!slideId) return;
  const assets = (await Promise.all(files.map(importFile))).filter((a): a is AssetMeta =>
    Boolean(a),
  );
  const { commands, elementIds } = insertAssetsCommands(
    slideId,
    assets,
    bus.deck.size,
    at,
    (id) => id in bus.deck.assets,
  );
  if (!commands.length) return;
  bus.batch(commands, { label: 'Insert' });
  selection.getState().selectElements(elementIds);
}
const button = 'rounded-md px-2 py-1 text-sm hover:bg-ui-hover disabled:opacity-40';

function App() {
  const current = useStore(deckStore, (s) => s.deck);
  const canUndo = useStore(deckStore, (s) => s.canUndo);
  const canRedo = useStore(deckStore, (s) => s.canRedo);
  const slideId = useStore(selection, (s) => s.currentSlideId);
  const selected = useStore(selection, (s) => s.selectedElementIds);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [scale, setScale] = useState(1);
  return (
    <div className="flex h-screen flex-col bg-ui-chrome text-ui-fg">
      <div className="flex items-center gap-1 border-b border-ui-line px-2 py-1">
        <button className={button} disabled={!canUndo} onClick={() => bus.undo()}>
          Undo
        </button>
        <button className={button} disabled={!canRedo} onClick={() => bus.redo()}>
          Redo
        </button>
        <button className={button} onClick={() => setZoom('fit')}>
          Fit
        </button>
        <button className={button} onClick={() => setZoom(1)}>
          100%
        </button>
        <span className="px-2 text-sm text-ui-fg-muted" data-testid="zoom">
          {Math.round(scale * 100)}%
        </span>
        {current.slides.map((s, i) => (
          <button
            key={s.id}
            className={`${button} ${s.id === slideId ? 'bg-ui-accent-soft' : ''}`}
            onClick={() => selection.getState().setCurrentSlide(s.id)}
          >
            {i + 1}
          </button>
        ))}
        <span className="ms-auto px-2 text-sm text-ui-fg-muted" data-testid="selected">
          {selected.join(', ')}
        </span>
      </div>
      <Stage
        bus={bus}
        deck={current}
        selection={selection}
        zoom={zoom}
        onZoomChange={setZoom}
        onViewScale={setScale}
        resolveAsset={resolveAsset}
        onFiles={(files, at) => void onFiles(files, at)}
        className="min-h-0 flex-1 bg-ui-canvas"
      />
      <div
        data-testid="filmstrip"
        className="h-filmstrip shrink-0 border-t border-ui-line bg-ui-chrome"
      >
        <Filmstrip
          bus={bus}
          deck={current}
          selection={selection}
          resolveAsset={resolveAsset}
          className="h-full"
        />
      </div>
    </div>
  );
}

registerBuiltinFonts();
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');
createRoot(root).render(
  <StrictMode>
    <UiProvider dir="ltr">
      <App />
    </UiProvider>
  </StrictMode>,
);
