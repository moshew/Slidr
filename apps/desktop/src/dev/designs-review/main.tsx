/**
 * Temporary review page for Elements → Designs.
 *   /dev/designs-review.html?pack=<pack>&id=<id>&lang=he|en&w=1920   one design of a pack file
 *   /dev/designs-review.html?id=<id>&lang=he|en&w=1920               one design of the collection
 *   /dev/designs-review.html?pack=<pack>&sheet=1&lang=he&w=460       every design of a pack
 *   /dev/designs-review.html?sheet=1&lang=he&w=460&from=0&count=30   designs of the collection
 * Draws a design as the gallery does. `window.__lines()` measures every text line against its
 * box, `window.__lint()` runs the app's design check on the slide, and `window.__subject()`
 * says what the top element is at the point the design names on its picture's subject.
 */
import type { AssetMeta, Deck, Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { designAssetUrl } from '../../elements/designAssets';
import {
  DESIGN_IDS,
  DESIGN_SUBJECTS,
  designPreview,
  designsOf,
} from '../../elements/designs';
import { registerBuiltinFonts } from '../../fonts';
import { lintSlides } from '../../lint/deckLint';

const query = new URLSearchParams(location.search);
const pack = query.get('pack');
const lang = query.get('lang') ?? 'he';
const width = Number(query.get('w') ?? 1920);
const sheet = query.has('sheet');

interface Drawn {
  id: string;
  deck: Deck;
  slide: Slide;
  subject?: [number, number];
}

async function load(): Promise<Drawn[]> {
  const from = Number(query.get('from') ?? 0);
  const available = pack ? designsOf(pack) : DESIGN_IDS;
  const ids = sheet
    ? available.slice(from, from + Number(query.get('count') ?? 30))
    : [query.get('id') ?? available[0]!];
  return ids.map((id) => {
    const { deck, slide } = designPreview(id, lang);
    return { id, deck, slide, subject: DESIGN_SUBJECTS[id] };
  });
}

const resolve: (asset: AssetMeta) => string | undefined = designAssetUrl;

function Page({ drawn }: { drawn: Drawn[] }) {
  useEffect(() => {
    void settle().then(() => (document.documentElement.dataset.ready = 'true'));
  }, []);
  if (!sheet) {
    const { deck, slide } = drawn[0]!;
    return (
      <ScaledSlide
        deck={deck}
        slide={slide}
        width={width}
        mode="thumbnail"
        resolveAsset={resolve}
      />
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${query.get('cols') ?? 4}, ${width}px)`,
        gap: 14,
        padding: 14,
        font: '600 15px system-ui',
        color: '#222',
      }}
    >
      {drawn.map(({ id, deck, slide }) => (
        <div key={id}>
          <ScaledSlide
            deck={deck}
            slide={slide}
            width={width}
            mode="thumbnail"
            resolveAsset={resolve}
          />
          <div style={{ padding: '4px 2px 0' }}>{id}</div>
        </div>
      ))}
    </div>
  );
}

const hooks = window as unknown as {
  __ids: string[];
  __lines: () => unknown;
  __lint: () => Promise<unknown>;
  __subject: () => unknown;
};

async function main() {
  registerBuiltinFonts();
  const drawn = await load();
  hooks.__ids = drawn.map(({ id }) => id);

  /** Every element with words: the widest line and the content height against its box, in slide px. */
  hooks.__lines = () => {
    const scale = width / 1920;
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-element-type="text"], [data-element-type="shape"]',
      ),
    ).flatMap((el) => {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      let font = '';
      let size = 0;
      const rows = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (!rect.width) continue;
          left = Math.min(left, rect.left);
          right = Math.max(right, rect.right);
          top = Math.min(top, rect.top);
          bottom = Math.max(bottom, rect.bottom);
          rows.add(Math.round(rect.top / scale / 8));
          const style = getComputedStyle(node.parentElement!);
          font ||= style.fontFamily.split(',')[0]!.replace(/["']/g, '');
          size ||= Math.round(parseFloat(style.fontSize) / scale);
        }
      }
      if (left === Infinity) return [];
      const px = (value: number) => Math.round(value / scale);
      return [
        {
          type: el.dataset.elementType,
          turned: /rotate/.test(el.style.transform),
          text: (el.textContent ?? '').slice(0, 40),
          font,
          size,
          rows: rows.size,
          box: [px(box.left), px(box.top), px(box.width), px(box.height)],
          ink: [px(left), px(top), px(right - left), px(bottom - top)],
          fill: Math.round(((right - left) / box.width) * 100),
          // Text too tall for its box is drawn smaller, silently (`autoFit: 'shrink'`).
          zoom: Number(
            (el.style.zoom || el.querySelector<HTMLElement>('[style*="zoom"]')?.style.zoom) ?? 1,
          ),
          outX: px(Math.max(0, box.left - left, right - box.right)),
          outY: px(Math.max(0, box.top - top, bottom - box.bottom)),
        },
      ];
    });
  };

  hooks.__lint = async () => {
    const { deck, slide } = drawn[0]!;
    const findings = await lintSlides(deck, [slide.id], 'all', resolve);
    return findings.map(({ rule, severity, message }) => ({ rule, severity, message }));
  };

  /** The type of the top element at the design's subject point, and how many pictures it has. */
  hooks.__subject = () => {
    const { deck, slide, subject } = drawn[0]!;
    const images = slide.elements.filter((element) => element.type === 'image');
    // A picture whose file is not in media: the slide shows an empty frame.
    const missing = images.flatMap((image) => {
      const asset =
        image.type === 'image' && image.assetId ? deck.assets[image.assetId] : undefined;
      return asset && resolve(asset) ? [] : [asset?.file ?? 'no asset'];
    });
    if (!subject) return { images: images.length, missing };
    const [x, y] = subject;
    const at = lang.startsWith('he') ? 1920 - x : x;
    const top = slide.elements.findLast(
      ({ frame }) =>
        at >= frame.x && at <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h,
    );
    return {
      images: images.length,
      missing,
      assets: new Set(images.map((image) => (image.type === 'image' ? image.assetId : ''))).size,
      top: top?.type ?? 'nothing',
      // A run with no face of its own takes the design's; one that is still bare is a bug.
      bare: slide.elements.flatMap((element) =>
        element.type === 'text' || element.type === 'shape'
          ? (element.content?.paragraphs ?? []).flatMap((paragraph) =>
              paragraph.runs.filter((run) => !run.marks?.font).map((run) => run.text),
            )
          : [],
      ),
    };
  };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Page drawn={drawn} />
    </StrictMode>,
  );
}

main().catch((error: unknown) => {
  document.documentElement.dataset.ready = 'failed';
  document.body.textContent = String(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
});
