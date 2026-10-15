import { flushSync } from 'react-dom';
import '../app.css';
import { createRoot } from 'react-dom/client';
import { createDeck } from '@slidr/model';
import { settle } from '../capture/settle';
import { DrawnFrame } from '../elements/FramesCollection';
import { frameRev, loadFrames, picturedAhead } from '../elements/frames';
import { registerBuiltinFonts } from '../fonts';

/*
 * The frames whose small pictures are made ahead, each drawn by the renderer as the panel would
 * draw it, on a clear ground: `scripts/generate-frames-thumbs.mjs` takes a picture of each
 * (`?lang=he` or `en`, for the words of the frames).
 */

/** How large a picture is to its frame's box: 420 by 300 for a magnet of 1050 by 750. */
const SCALE = 0.4;
/** The room around the box, for the shadow of the frame, in pixels of the picture. */
const BLEED = 16;

/** Raster artwork inside the SVGs of a frame, which live in the renderer's open shadow roots. */
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
const frames = (await loadFrames()).filter(picturedAhead);
const theme = createDeck().theme;
const root = document.getElementById('root')!;
flushSync(() =>
  createRoot(root).render(
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: 8 }}>
      {frames.map((frame) => (
        <div
          key={frame.id}
          data-thumb={frame.id.replace(/^frame:/, '')}
          data-rev={frameRev(frame)}
          style={{
            boxSizing: 'border-box',
            width: frame.size.w * SCALE + 2 * BLEED,
            height: frame.size.h * SCALE + 2 * BLEED,
            padding: BLEED,
          }}
        >
          <DrawnFrame
            frame={frame}
            lang={lang}
            theme={theme}
            width={frame.size.w * SCALE}
            bleed={BLEED}
          />
        </div>
      ))}
    </div>,
  ),
);
await settle();
await Promise.all(
  Array.from(new Set(embeddedPictures(root)), (url) => {
    const image = new Image();
    image.src = url;
    return image.decode();
  }),
);
await settle();
Object.assign(window, { __thumbs: { scale: SCALE, bleed: BLEED } });
document.documentElement.dataset.ready = 'true';
