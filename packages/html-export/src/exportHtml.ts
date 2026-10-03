import { referencedAssetIds, type AssetMeta, type Deck } from '@slidr/model';
import { playerBundle } from '@slidr/runtime/bundle';
import { embedAsset, measureNeeds, typed, type EmbeddedAsset, type LoadedAsset } from './assets';
import { buildDocument } from './document';
import { markHeadings, persistMediaState, renderSlides } from './render';

export interface ExportOptions {
  /** The bytes of an asset, or undefined when the deck's asset cannot be read. */
  loadAsset: (asset: AssetMeta) => Promise<Blob | undefined>;
  /**
   * `@font-face` rules for the fonts the slides use that are not assets of the deck, i.e. the
   * built-in library. Called once the slides are drawn and their fonts have loaded, so the host
   * can see which faces were needed. Embedding and subsetting them is WG9-T09.
   */
  fontCss?: () => Promise<string>;
  /** Hidden slides are left out unless this is set. */
  includeHidden?: boolean;
  /** The highest device pixel ratio pictures stay sharp at. Default 2. */
  pixelRatio?: number;
  /** WebP quality of re-encoded pictures, 0..1. Default 0.9. */
  imageQuality?: number;
  /** The document the slides are drawn in while exporting. Default: this one. */
  document?: Document;
}

export interface ExportResult {
  /** The whole file. */
  html: string;
  /** Size of the file in bytes, as UTF-8. */
  bytes: number;
  slides: number;
  assets: EmbeddedAsset[];
  /** What could not be exported as it is in the deck. */
  warnings: string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A deck as one self-contained HTML file (SPEC 12): the slides as the renderer draws them, every
 * asset inside, and the runtime that plays the transitions and animations. The file does not
 * carry the model.
 *
 * It needs a document with layout, so it runs in the app's webview, not in Node.
 */
export async function exportHtml(deck: Deck, options: ExportOptions): Promise<ExportResult> {
  const doc = options.document ?? document;
  const warnings: string[] = [];
  const slides = deck.slides.filter((slide) => options.includeHidden || !slide.hidden);
  const exported: Deck = { ...deck, slides };

  // The assets the exported slides use, under object URLs for the time of the rendering.
  const loaded = new Map<string, LoadedAsset>();
  await Promise.all(
    Array.from(referencedAssetIds(exported), async (id) => {
      const meta = deck.assets[id];
      if (!meta) return;
      const blob = await options.loadAsset(meta).catch(() => undefined);
      if (!blob) {
        if (meta.kind !== 'font')
          warnings.push(`Asset ${meta.name ?? meta.file} could not be read`);
        return;
      }
      const sized = typed(blob, meta);
      loaded.set(id, { meta, blob: sized, url: URL.createObjectURL(sized) });
    }),
  );
  const assets = Array.from(loaded.values());
  const resolveAsset = (asset: AssetMeta) => loaded.get(asset.id)?.url;

  try {
    const rendered = await renderSlides(doc, exported, slides, resolveAsset);
    let markup: string;
    let needs: ReturnType<typeof measureNeeds>;
    let fontCss = '';
    try {
      needs = measureNeeds(rendered.host, assets);
      fontCss = (await options.fontCss?.()) ?? '';
      markHeadings(rendered.host, slides);
      persistMediaState(rendered.host);
      if (typeof rendered.host.getHTML === 'function') {
        markup = rendered.host.getHTML({ serializableShadowRoots: true });
      } else {
        markup = rendered.host.innerHTML;
        warnings.push('This browser cannot write shadow roots: HTML elements lost their content');
      }
    } finally {
      rendered.dispose();
    }

    // Each object URL in the markup gives way to the asset itself.
    const used = assets.filter((asset) => markup.includes(asset.url));
    const pixelRatio = options.pixelRatio ?? 2;
    const quality = options.imageQuality ?? 0.9;
    const embedded = await Promise.all(
      used.map((asset) => embedAsset(asset, needs.get(asset.meta.id), { pixelRatio, quality })),
    );
    const uris = new Map(used.map((asset, i) => [asset.url, embedded[i]?.uri ?? '']));
    if (used.length) {
      const urls = new RegExp(used.map((asset) => escapeRegExp(asset.url)).join('|'), 'g');
      markup = markup.replace(urls, (url) => uris.get(url) ?? url);
    }

    const html = buildDocument({
      title: deck.meta.title,
      lang: deck.meta.lang,
      dir: deck.meta.dir,
      size: deck.size,
      slides: markup,
      fontCss,
      script: playerBundle,
    });
    return {
      html,
      bytes: new Blob([html]).size,
      slides: slides.length,
      assets: embedded.map((e) => e.report),
      warnings,
    };
  } finally {
    for (const asset of assets) URL.revokeObjectURL(asset.url);
  }
}
