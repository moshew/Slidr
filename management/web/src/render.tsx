/**
 * The page the server opens in a headless browser (`tools/snap.mjs`): it converts a variant's
 * HTML files, one for each language of its request, with the app's engine, checks them, and
 * shows each language at full size and as the gallery's thumbnail (`<lang>-full`,
 * `<lang>-thumb`), for the script to take pictures of. When everything is drawn it sets
 * `window.__snap`.
 */
import { languagesOf } from '@slidr/model';
import { ScaledSlide, settle } from '@slidr/renderer';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  convertDesign,
  designDeck,
  pictureResolver,
  type DesignResult,
  type Lang,
  type Picture,
} from './design';
import { registerLibraryFonts } from './fonts';

declare global {
  interface Window {
    __snap?: { done: boolean; result?: DesignResult; error?: string };
  }
}

const THUMB_WIDTH = 384;

function Views({ result, picture }: { result: DesignResult; picture: Picture }) {
  const resolve = pictureResolver(picture);
  return (
    <>
      {languagesOf(result.langs).map((lang) => {
        const slide = result.langs[lang]?.slide;
        if (!slide) return null;
        const deck = designDeck(lang, picture, [slide]);
        return (
          <div key={lang}>
            <div data-snap={`${lang}-full`} style={{ width: 1920 }}>
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={1920}
                mode="thumbnail"
                resolveAsset={resolve}
              />
            </div>
            <div data-snap={`${lang}-thumb`} style={{ width: THUMB_WIDTH }}>
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={THUMB_WIDTH}
                mode="thumbnail"
                resolveAsset={resolve}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

async function run(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const vid = params.get('v');
  if (!vid) throw new Error('No variant named (?v=).');
  const response = await fetch(`/api/variants/${encodeURIComponent(vid)}/render-input`);
  if (!response.ok) throw new Error(`render-input: ${response.status} ${await response.text()}`);
  const input = (await response.json()) as {
    designId: string;
    revision: number;
    /** The variant's languages; a server from before there was a choice sends none. */
    languages?: Lang[];
    html: Partial<Record<Lang, string>>;
    image: Picture;
  };
  await registerLibraryFonts();
  const picture = { ...input.image, url: new URL(input.image.url, location.href).href };
  const result = await convertDesign({
    ...input,
    image: picture,
    debug: params.has('debug'),
  });
  const root = createRoot(document.getElementById('root')!);
  flushSync(() => root.render(<Views result={result} picture={picture} />));
  await settle(document);
  window.__snap = { done: true, result };
}

run().catch((error: unknown) => {
  window.__snap = {
    done: true,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});
