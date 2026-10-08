/**
 * Dev page for the Stage (WG2-T03..T06, WG5): /dev/stage.html[?deck=<name>&slide=<n>]
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
import { referenceAssets, referenceDeck } from '@slidr/renderer/fixtures';
import { UiProvider } from '@slidr/ui';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { memoryAssets } from '../../document/assets';
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

/**
 * What WG5 added to the Stage (ADR-016), one slide each: images to crop (every fit, a turned and
 * mirrored one), groups to enter (plain, turned, mirrored, nested), and lines to edit. After them,
 * cards whose text a click goes straight into.
 */
function stageDeck(): Deck {
  const L = referenceAssets.landscape;
  const P = referenceAssets.portrait;
  const solid = (token: 'primary' | 'secondary' | 'accent' | 'surface' | 'bg') =>
    ({ kind: 'solid', color: { token } }) as const;
  const line = (id: string, x: number, y: number, w: number, h: number, up = false) => ({
    id,
    frame: { x, y, w, h },
    points: [
      { x: 0, y: up ? h : 0 },
      { x: w, y: up ? 0 : h },
    ],
    stroke: { color: { token: 'text' as const }, width: 6 },
  });

  const crop = createSlide({
    id: 's_crop',
    name: 'Crop',
    elements: [
      createElement.image({
        id: 'e_crop_plain',
        frame: { x: 140, y: 120, w: 600, h: 400 },
        assetId: L,
      }),
      createElement.image({
        id: 'e_crop_turned',
        frame: { x: 1080, y: 160, w: 600, h: 400 },
        rotation: 20,
        flipH: true,
        assetId: L,
      }),
      createElement.image({
        id: 'e_crop_contain',
        frame: { x: 140, y: 640, w: 360, h: 360 },
        assetId: L,
        fit: 'contain',
        css: { outline: '1px dashed rgba(127, 127, 127, 0.6)' },
      }),
      createElement.image({
        id: 'e_crop_fill',
        frame: { x: 620, y: 700, w: 480, h: 280 },
        assetId: P,
        fit: 'fill',
      }),
      createElement.image({
        id: 'e_crop_cover',
        frame: { x: 1240, y: 700, w: 400, h: 280 },
        assetId: P,
        fit: 'cover',
      }),
      createElement.image({
        id: 'e_crop_pending',
        frame: { x: 1700, y: 760, w: 180, h: 180 },
        prompt: 'A picture that is not there yet',
      }),
    ],
  });

  const groups = createSlide({
    id: 's_groups',
    name: 'Groups',
    elements: [
      createElement.group({
        id: 'g_plain',
        frame: { x: 120, y: 120, w: 640, h: 380 },
        children: [
          createElement.shape({
            id: 'g_plain_card',
            frame: { x: 0, y: 0, w: 640, h: 380 },
            geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.08] },
            fill: solid('surface'),
          }),
          createElement.text({
            id: 'g_plain_text',
            frame: { x: 40, y: 30, w: 560, h: 80 },
            content: richText('A plain group', { dir: 'ltr', styleRef: 'heading' }),
          }),
          createElement.image({
            id: 'g_plain_image',
            frame: { x: 40, y: 140, w: 300, h: 200 },
            assetId: L,
          }),
          createElement.shape({
            id: 'g_plain_dot',
            frame: { x: 420, y: 160, w: 160, h: 160 },
            geometry: { kind: 'preset', preset: 'ellipse' },
            fill: solid('accent'),
          }),
        ],
      }),
      createElement.group({
        id: 'g_turned',
        frame: { x: 1040, y: 140, w: 560, h: 320 },
        rotation: 20,
        flipH: true,
        children: [
          createElement.shape({
            id: 'g_turned_card',
            frame: { x: 0, y: 0, w: 560, h: 320 },
            fill: solid('primary'),
          }),
          createElement.shape({
            id: 'g_turned_arrow',
            frame: { x: 40, y: 60, w: 200, h: 120 },
            geometry: { kind: 'preset', preset: 'arrowRight' },
            fill: solid('bg'),
          }),
          createElement.text({
            id: 'g_turned_text',
            frame: { x: 280, y: 200, w: 240, h: 80 },
            content: richText('Turned', {
              dir: 'ltr',
              styleRef: 'heading',
              marks: { color: { token: 'bg' } },
            }),
          }),
        ],
      }),
      createElement.group({
        id: 'g_outer',
        frame: { x: 200, y: 620, w: 700, h: 320 },
        children: [
          createElement.shape({
            id: 'g_outer_box',
            frame: { x: 0, y: 0, w: 260, h: 320 },
            fill: solid('secondary'),
          }),
          createElement.group({
            id: 'g_inner',
            frame: { x: 320, y: 40, w: 380, h: 240 },
            children: [
              createElement.shape({
                id: 'g_inner_a',
                frame: { x: 0, y: 0, w: 180, h: 240 },
                fill: solid('accent'),
              }),
              createElement.shape({
                id: 'g_inner_b',
                frame: { x: 220, y: 60, w: 160, h: 120 },
                geometry: { kind: 'preset', preset: 'ellipse' },
                fill: solid('primary'),
              }),
            ],
          }),
        ],
      }),
      createElement.shape({
        id: 'e_free',
        frame: { x: 1240, y: 700, w: 240, h: 180 },
        fill: solid('accent'),
      }),
    ],
  });

  const lines = createSlide({
    id: 's_lines',
    name: 'Lines',
    elements: [
      createElement.shape({
        id: 'e_lines_box',
        frame: { x: 1400, y: 200, w: 300, h: 200 },
        fill: solid('surface'),
        stroke: { color: { token: 'muted' }, width: 2 },
      }),
      createElement.line({ ...line('e_line_diagonal', 200, 160, 500, 300), endHead: 'triangle' }),
      createElement.line(line('e_line_flat', 200, 600, 500, 0)),
      createElement.line({ ...line('e_line_elbow', 860, 160, 360, 240), curve: 'elbow' }),
      createElement.line({
        ...line('e_line_curved', 860, 520, 360, 240),
        curve: 'curved',
        endHead: 'arrow',
      }),
      createElement.line({
        ...line('e_line_turned', 300, 760, 400, 160, true),
        rotation: -15,
        flipH: true,
        stroke: { color: { token: 'primary' }, width: 8 },
        endHead: 'triangle',
      }),
      createElement.line({
        id: 'e_line_wave',
        frame: { x: 1000, y: 820, w: 720, h: 160 },
        points: [
          { x: 0, y: 160 },
          { x: 240, y: 0 },
          { x: 480, y: 140 },
          { x: 720, y: 20 },
        ],
        stroke: { color: { token: 'accent' }, width: 6, cap: 'round' },
        curve: 'curved',
      }),
    ],
  });

  // A card as a converted slide has it: a group of a background, a title, a chip (a shape with
  // text), a big shape with a short text, and a row that is a group of its own. Beside it a
  // turned and mirrored card, and a text box and a shape that are in no group.
  const label = (text: string) =>
    richText(text, { dir: 'ltr', align: 'center', marks: { color: { token: 'bg' } } });
  const cards = createSlide({
    id: 's_cards',
    name: 'Cards',
    elements: [
      createElement.group({
        id: 'g_card',
        frame: { x: 160, y: 140, w: 760, h: 520 },
        children: [
          createElement.shape({
            id: 'g_card_bg',
            frame: { x: 0, y: 0, w: 760, h: 520 },
            geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.06] },
            fill: solid('surface'),
          }),
          createElement.text({
            id: 'g_card_title',
            frame: { x: 48, y: 40, w: 520, h: 110 },
            content: richText('Card title', { dir: 'ltr', styleRef: 'heading' }),
          }),
          createElement.shape({
            id: 'g_card_chip',
            frame: { x: 48, y: 180, w: 220, h: 64 },
            geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.5] },
            fill: solid('accent'),
            content: label('Chip'),
          }),
          createElement.shape({
            id: 'g_card_panel',
            frame: { x: 320, y: 170, w: 392, h: 200 },
            fill: solid('primary'),
            content: label('Panel'),
          }),
          createElement.group({
            id: 'g_card_row',
            frame: { x: 48, y: 400, w: 350, h: 90 },
            children: [
              createElement.shape({
                id: 'g_card_tag',
                frame: { x: 0, y: 13, w: 200, h: 64 },
                geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.5] },
                fill: solid('secondary'),
                content: label('Nested'),
              }),
              createElement.svg({
                id: 'g_card_icon',
                frame: { x: 260, y: 0, w: 90, h: 90 },
                markup:
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" fill="#3b82f6"/><path d="M23 45h44M45 23v44" stroke="white" stroke-width="6"/></svg>',
              }),
            ],
          }),
        ],
      }),
      createElement.group({
        id: 'g_tilt',
        frame: { x: 1120, y: 480, w: 520, h: 320 },
        rotation: 20,
        flipH: true,
        children: [
          createElement.shape({
            id: 'g_tilt_bg',
            frame: { x: 0, y: 0, w: 520, h: 320 },
            fill: solid('surface'),
          }),
          createElement.shape({
            id: 'g_tilt_panel',
            frame: { x: 60, y: 40, w: 400, h: 240 },
            fill: solid('primary'),
            content: label('Tilted'),
          }),
        ],
      }),
      createElement.text({
        id: 'e_solo',
        frame: { x: 1080, y: 160, w: 600, h: 110 },
        content: richText('On its own', { dir: 'ltr', styleRef: 'heading' }),
      }),
      createElement.shape({
        id: 'e_solo_shape',
        frame: { x: 160, y: 750, w: 600, h: 140 },
        fill: solid('primary'),
        content: label('Standalone shape'),
      }),
    ],
  });

  return {
    ...createDeck({ lang: 'en', title: 'Stage', slides: [crop, groups, lines, cards] }),
    assets: referenceDeck().assets,
  };
}

const decks: Record<string, () => Deck> = {
  reference: referenceDeck,
  big: bigDeck,
  stage: stageDeck,
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

/** Files dropped on the dev page live in memory; the app stores them in the workspace. */
const assets = memoryAssets();
const resolveAsset = (asset: AssetMeta) => assets.url(asset) ?? testAssetUrl(asset.id);

async function onFiles(files: File[], at: { x: number; y: number }) {
  const slideId = selection.getState().currentSlideId;
  if (!slideId) return;
  const imported = await Promise.all(files.map((file) => assets.import(file)));
  const { commands, elementIds } = insertAssetsCommands(
    slideId,
    imported,
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
