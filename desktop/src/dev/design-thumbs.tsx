import { flushSync } from 'react-dom';
import '../app.css';
import { createRoot } from 'react-dom/client';
import { ScaledSlide } from '@slidr/renderer';
import { settle } from '../capture/settle';
import { loadDesigns } from '../elements/designs';
import { registerBuiltinFonts } from '../fonts';

/*
 * The designs whose pictures are made ahead (ADR-109), each drawn by the renderer as a gallery
 * draws it: `scripts/generate-design-thumbs.mjs` opens this page in a language (`?lang=de`), has
 * it draw the designs a batch at a time (`window.__draw`) and takes a picture of each.
 */

/** How wide a design is drawn: the widest picture made of it. */
const WIDTH = 640;
/** How many designs are drawn side by side. */
const COLUMNS = 4;

/** Raster artwork inside the SVGs of a design, in the renderer's open shadow roots. */
function embeddedPictures(root: Element | ShadowRoot): string[] {
  const urls = Array.from(root.querySelectorAll('image')).flatMap((picture) => {
    const url = picture.getAttribute('href') ?? picture.getAttribute('xlink:href');
    return url ? [url] : [];
  });
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.shadowRoot) urls.push(...embeddedPictures(element.shadowRoot));
  }
  return urls;
}

const lang = new URLSearchParams(location.search).get('lang') ?? 'he';
registerBuiltinFonts();
const designs = await loadDesigns(lang);
const host = document.getElementById('root')!;
const root = createRoot(host);

/** Draws the designs `ids`, and gives where each is on the page once it shows all it will. */
async function draw(ids: readonly string[]) {
  flushSync(() =>
    root.render(
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, ${WIDTH}px)` }}>
        {ids.map((id) => {
          const { deck, slide, resolveAsset } = designs.designPreview(id, lang);
          return (
            <div key={id} data-thumb={id}>
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={WIDTH}
                mode="thumbnail"
                resolveAsset={resolveAsset}
              />
            </div>
          );
        })}
      </div>,
    ),
  );
  await settle();
  await Promise.all(
    Array.from(new Set(embeddedPictures(host)), (url) => {
      const image = new Image();
      image.src = url;
      return image.decode().catch(() => undefined);
    }),
  );
  await settle();
  return Array.from(document.querySelectorAll<HTMLElement>('[data-thumb]'), (element) => {
    const { x, y, width, height } = element.firstElementChild!.getBoundingClientRect();
    return { id: element.dataset.thumb!, clip: { x, y, width, height } };
  });
}

Object.assign(window, { __designs: designs.ids, __width: WIDTH, __draw: draw });
document.documentElement.dataset.ready = 'true';
