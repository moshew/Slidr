/**
 * TEMPORARY review page (not part of the app): /dev/zz-tpl.html?id=<template>&lang=he|en
 *
 * The finished sample slides of a template as `scripts/zz-probe-templates.mjs` wrote it, as the
 * library's preview shows them: all of them as thumbnails of `w` px, or with `slide=<n>` (1-based)
 * one at 1920x1080. `dir` reads another probe folder.
 */
import type { AssetMeta, Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import type { Template } from '@slidr/templates';
import { sampleDeck, type SampleSlide } from '@slidr/templates/builtin/kit';
import { pictures } from '@slidr/templates/builtin/pictures';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { registerBuiltinFonts } from '../../fonts';

const files = import.meta.glob<string>('../../../../../../Slidr-media/images/templates/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urls = new Map<string, string>();
for (const picture of Object.values(pictures)) {
  const path = Object.keys(files).find((file) => file.endsWith(`/${picture.name}`));
  if (path) urls.set(picture.id, files[path]!);
}
const pictureAssets: Record<string, AssetMeta> = Object.fromEntries(
  Object.values(pictures).map((picture) => [picture.id, picture]),
);
const resolveAsset = (asset: AssetMeta) => urls.get(asset.id);

registerBuiltinFonts();
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'shidur';
const lang = params.get('lang') === 'en' ? 'en' : 'he';
const pick = params.get('slide');
const width = Number(params.get('w') ?? 400);
const dir = params.get('dir') ?? 'zz-probe';
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

async function main(host: HTMLElement) {
  const response = await fetch(`/test-results/templates/${dir}/${id}.json?${Date.now()}`);
  const { template, samples } = (await response.json()) as {
    template: Template;
    samples: { he: SampleSlide[]; en: SampleSlide[] };
  };
  const shown = samples[lang].filter(
    (slide) =>
      template.layouts.some((layout) => layout.id === slide.layout) &&
      !Object.values(slide.content)
        .flat()
        .some((fill) => 'imagePrompt' in (fill as object)),
  );
  const deck: Deck = sampleDeck(
    { ...template, assets: { ...pictureAssets, ...template.assets } },
    shown,
    { lang, dir: lang === 'he' ? 'rtl' : 'ltr' },
  );
  const single = pick ? deck.slides[Number(pick) - 1] : undefined;
  createRoot(host).render(
    <StrictMode>
      {single ? (
        <ScaledSlide
          deck={deck}
          slide={single}
          width={1920}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      ) : (
        <div
          id="sheet"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(4, ${width}px)`,
            gap: 12,
            padding: 12,
            width: 'max-content',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {deck.slides.map((slide, i) => (
            <figure key={slide.id} style={{ margin: 0 }}>
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={width}
                mode="thumbnail"
                resolveAsset={resolveAsset}
              />
              <figcaption style={{ fontSize: 12, lineHeight: '16px', color: '#333' }}>
                {i + 1} {slide.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </StrictMode>,
  );
  await settle();
  document.documentElement.dataset.ready = 'true';
}

void main(root);
