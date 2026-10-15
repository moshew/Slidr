/**
 * Scratch review page (not part of the app):
 *   ?t=<template>&lang=he|en[&slide=<n>][&w=1920]      a template's sample deck, or one slide of it
 *   ?d=<id,id,...>|all&src=managed|new&lang=he|en[&w=]  ready-made slides
 *   &cols=<n>                                         columns of a sheet
 * `window.__lines()` measures text against its boxes, `window.__lint()` runs the design check.
 */
import { readMediaJson, mediaUrl } from '@slidr/media-library';
import {
  createDeck,
  duplicateSlide,
  walkElements,
  type AssetMeta,
  type Deck,
  type Slide,
} from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { builtInSamples, builtInTemplates, sampleDeck } from '@slidr/templates/builtin';
import { authored } from '../../../../../packages/templates/src/authoring/registry';
import { newDesigns } from '../../../../../packages/templates/src/authoring/designs/registry';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { registerBuiltinFonts } from '../../fonts';
import { lintSlides } from '../../lint/deckLint';
import { pictureUrl } from '../../templates/pictures';

const query = new URLSearchParams(location.search);
const lang = query.get('lang') ?? 'he';
const dir = lang === 'he' ? 'rtl' : 'ltr';
const width = Number(query.get('w') ?? 1920);
const cols = Number(query.get('cols') ?? 4);

/** The pictures of the authored samples and designs, by file name (`designs/<id>.webp`). */
const PICTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../../../../packages/templates/src/authoring/pictures/**/*.webp', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.split('/authoring/pictures/')[1]!, url]),
);

interface Drawn {
  key: string;
  deck: Deck;
  slide: Slide;
  subject?: [number, number];
}

let resolve: (asset: AssetMeta) => string | undefined = () => undefined;

type ManagedCatalog = {
  slides: Record<string, { he: Slide; en: Slide }>;
  sizes: Record<string, number[]>;
  groupIds: Record<string, string[]>;
  subjects?: Record<string, [number, number]>;
};

async function load(): Promise<Drawn[]> {
  const t = query.get('t');
  if (t) {
    const own = authored[t];
    const template = own ? own.template() : builtInTemplates().find((x) => x.theme.id === t);
    const samples = own ? own.samples : builtInSamples[t];
    if (!template || !samples) throw new Error(`no template ${t}`);
    const deck = sampleDeck(template, lang === 'he' ? samples.he : samples.en, { lang, dir });
    const local = new Map(Object.values(template.assets ?? {}).map((a) => [a.id, a.name]));
    resolve = (asset) =>
      pictureUrl(asset) ?? (local.has(asset.id) ? PICTURES[local.get(asset.id)!] : undefined);
    const only = query.get('slide');
    const slides = only === null ? deck.slides : [deck.slides[Number(only)]!];
    return slides.map((slide, i) => ({ key: `${i + 1}. ${slide.name ?? ''}`, deck, slide }));
  }
  const src = query.get('src') ?? 'new';
  const catalog: ManagedCatalog =
    src === 'managed'
      ? ((await readMediaJson<ManagedCatalog>('elements/designs/managed.json')) as ManagedCatalog)
      : newDesigns();
  const want = query.get('d') ?? 'all';
  const ids =
    want === 'all'
      ? Object.values(catalog.groupIds).flat()
      : want.startsWith('group:')
        ? catalog.groupIds[want.slice(6)]!
        : want.split(',');
  const urls = new Map<string, string>();
  const drawn = ids.map((id) => {
    const authoredSlide = catalog.slides[id]![lang === 'he' ? 'he' : 'en'];
    const slide = duplicateSlide(createDeck({ slides: [authoredSlide] }), authoredSlide.id).slide;
    const deck = createDeck({ lang, slides: [slide] });
    for (const [name, suffix] of [
      ['__subject__', ''],
      ['__backdrop__', '-bg'],
    ] as const) {
      const assetId = `pic-${id}${suffix}`;
      let used = false;
      for (const element of walkElements(slide.elements)) {
        if (element.type === 'image' && element.assetId === name) {
          element.assetId = assetId;
          used = true;
        }
      }
      if (!used) continue;
      const size = catalog.sizes[`${id}${suffix}`];
      deck.assets[assetId] = {
        id: assetId,
        file: `${id}${suffix}.webp`,
        mime: 'image/webp',
        kind: 'image',
        origin: 'import',
        bytes: 0,
        name: `${id}${suffix}.webp`,
        ...(size ? { width: size[0], height: size[1] } : {}),
      };
      urls.set(
        assetId,
        src === 'managed'
          ? mediaUrl(`images/designs/${id}${suffix}.webp`)
          : (PICTURES[`designs/${id}${suffix}.webp`] ?? ''),
      );
    }
    return { key: id, deck, slide, subject: catalog.subjects?.[id] };
  });
  resolve = (asset) => urls.get(asset.id);
  return drawn;
}

function Page({ drawn }: { drawn: Drawn[] }) {
  useEffect(() => {
    void settle().then(() => (document.documentElement.dataset.ready = 'true'));
  }, []);
  if (drawn.length === 1 && !query.has('sheet')) {
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
        direction: dir,
        gridTemplateColumns: `repeat(${cols}, ${width}px)`,
        gap: 12,
        padding: 12,
        font: '600 14px system-ui',
        color: '#ddd',
      }}
    >
      {drawn.map(({ key, deck, slide }) => (
        <div key={key + slide.id}>
          <ScaledSlide
            deck={deck}
            slide={slide}
            width={width}
            mode="thumbnail"
            resolveAsset={resolve}
          />
          <div style={{ padding: '4px 2px 0', direction: 'ltr' }}>{key}</div>
        </div>
      ))}
    </div>
  );
}

const hooks = window as unknown as {
  __lines: () => unknown;
  __lint: () => Promise<unknown>;
  __subject: () => unknown;
};

async function main() {
  registerBuiltinFonts();
  const drawn = await load();

  hooks.__lines = () => {
    const scale = width / 1920;
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-element-type="text"], [data-element-type="shape"]',
      ),
    ).flatMap((el) => {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
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
        }
      }
      if (left === Infinity) return [];
      const px = (v: number) => Math.round(v / scale);
      return [
        {
          text: (el.textContent ?? '').slice(0, 50),
          outX: px(Math.max(0, box.left - left, right - box.right)),
          outY: px(Math.max(0, box.top - top, bottom - box.bottom)),
          zoom: Number(
            el.style.zoom || el.querySelector<HTMLElement>('[style*="zoom"]')?.style.zoom || 1,
          ),
        },
      ];
    });
  };

  hooks.__lint = async () => {
    const out: unknown[] = [];
    for (const { key, deck, slide } of drawn) {
      const findings = await lintSlides(deck, [slide.id], 'all', resolve);
      for (const { rule, severity, message } of findings)
        out.push({ key, rule, severity, message: message.slice(0, 200) });
    }
    return out;
  };

  /** Per design: what is on top at its subject point, and the runs of text without a font. */
  hooks.__subject = () =>
    drawn.map(({ key, slide, subject }) => {
      const images = slide.elements.filter((element) => element.type === 'image');
      const bare = slide.elements.flatMap((element) =>
        element.type === 'text' || element.type === 'shape'
          ? (element.content?.paragraphs ?? []).flatMap((paragraph) =>
              paragraph.runs
                .filter((run) => run.text.trim() && !run.marks?.font)
                .map((run) => run.text),
            )
          : [],
      );
      if (!subject) return { key, images: images.length, bare };
      const [x, y] = subject;
      const at = lang.startsWith('he') ? 1920 - x : x;
      const top = slide.elements.findLast(
        ({ frame }) =>
          at >= frame.x && at <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h,
      );
      return { key, images: images.length, top: top?.type ?? 'nothing', bare };
    });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Page drawn={drawn} />
    </StrictMode>,
  );
}

main().catch((error: unknown) => {
  document.documentElement.dataset.ready = 'failed';
  document.body.style.color = '#fff';
  document.body.textContent = String(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
});
