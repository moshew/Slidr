/**
 * Dev page for the renderer (WG2-T11): /dev/slides.html
 *
 * - No parameters: every test deck as thumbnails, in all three render modes, for a quick look.
 * - `?deck=<name>&slide=<n>[&mode=edit|thumbnail|present]`: one slide at 1920x1080, which the
 *   visual regression suite screenshots. `data-ready` on <html> says when fonts, images and frames
 *   have settled.
 */
import type { AssetMeta, Deck } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { ScaledSlide, SlideRenderer, type RenderMode } from '@slidr/renderer';
import { chartDeck, referenceDeck } from '@slidr/renderer/fixtures';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { registerBuiltinFonts } from '../../fonts';
import { testAssetUrl } from './testAssets';

const decks: Record<string, () => Deck> = {
  reference: referenceDeck,
  hebrew: fixtureDecks.hebrewDeck,
  english: fixtureDecks.englishDeck,
  mixed: fixtureDecks.mixedDeck,
  'all-elements': fixtureDecks.allElementsDeck,
  charts: () => chartDeck('ltr'),
  'charts-rtl': () => chartDeck('rtl'),
};

const resolveAsset = (asset: AssetMeta) => testAssetUrl(asset.id);

function Ready({ children }: { children: ReactNode }) {
  useEffect(() => {
    void settle().then(() => (document.documentElement.dataset.ready = 'true'));
  }, []);
  return <>{children}</>;
}

function Single({ deck, index, mode }: { deck: Deck; index: number; mode: RenderMode }) {
  const slide = deck.slides[index];
  if (!slide) return <p>No slide {index}</p>;
  return <SlideRenderer deck={deck} slide={slide} mode={mode} resolveAsset={resolveAsset} />;
}

const MODES: RenderMode[] = ['edit', 'thumbnail', 'present'];

function Overview() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      {Object.entries(decks).map(([name, make]) => {
        const deck = make();
        return (
          <section key={name} style={{ marginBottom: 40 }}>
            <h2 style={{ margin: '0 0 12px' }}>{name}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {deck.slides.map((slide, i) => (
                <a
                  key={slide.id}
                  href={`?deck=${name}&slide=${i}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div style={{ boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
                    <ScaledSlide
                      deck={deck}
                      slide={slide}
                      width={480}
                      mode="thumbnail"
                      resolveAsset={resolveAsset}
                    />
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    {i}. {slide.name ?? slide.id}
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      })}
      <p style={{ fontSize: 13 }}>Modes: {MODES.join(', ')} (add &amp;mode= to a slide link).</p>
    </div>
  );
}

registerBuiltinFonts();
const params = new URLSearchParams(location.search);
const deckName = params.get('deck');
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

createRoot(root).render(
  <StrictMode>
    <Ready>
      {deckName && decks[deckName] ? (
        <Single
          deck={decks[deckName]()}
          index={Number(params.get('slide') ?? 0)}
          mode={(params.get('mode') as RenderMode | null) ?? 'edit'}
        />
      ) : (
        <Overview />
      )}
    </Ready>
  </StrictMode>,
);
