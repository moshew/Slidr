import { referencedAssetIds, type AssetMeta, type Deck } from '@slidr/model';
import { CHART_SELECTOR, CHART_STILL } from '@slidr/runtime';
import { playerBundle } from '@slidr/runtime/bundle';
import { embedAsset, measureNeeds, typed, type EmbeddedAsset, type LoadedAsset } from './assets';
import { buildDocument } from './document';
import { embedFonts, type EmbeddedFont } from './fonts';
import { markHeadings, persistMediaState, renderSlides } from './render';
import type { ExportWarning } from './warnings';

export interface ExportOptions {
  /** The bytes of an asset, or undefined when the deck's asset cannot be read. */
  loadAsset: (asset: AssetMeta) => Promise<Blob | undefined>;
  /**
   * `@font-face` rules for the fonts the slides use that are not assets of the deck, i.e. the
   * built-in library. Called once the slides are drawn and their fonts have loaded. Without it
   * the export embeds the faces the page has loaded itself, cut down to the characters in use
   * (`embedFonts`); a host passes this only to take that over.
   */
  fontCss?: () => Promise<string>;
  /** Only these slides, in the order of the deck. Default: all of them. */
  slideIds?: readonly string[];
  /** Hidden slides are left out unless this is set. */
  includeHidden?: boolean;
  /** `false` leaves the transitions and the animations out: every slide is shown whole. */
  animations?: boolean;
  /** The highest device pixel ratio pictures stay sharp at. Default 2. */
  pixelRatio?: number;
  /** WebP quality of re-encoded pictures, 0..1. Default 0.9. */
  imageQuality?: number;
  /**
   * The name of a folder beside the file for video and audio (MED-05, EXP-08). With it they are
   * not put into the file and are not read at all: the file refers to each as
   * `<mediaFolder>/<asset.file>`, and the host copies them there. Without it they go into the
   * file like every other asset.
   */
  mediaFolder?: string;
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
  /** The faces `embedFonts` put in the file; empty when the host supplied `fontCss`. */
  fonts: EmbeddedFont[];
  /** The charts in the file, and the bytes of the chart library they brought with them. */
  charts: { count: number; bytes: number };
  /** The folder the file expects its video and audio in, when they are not inside it. */
  mediaFolder?: string;
  /** What could not be exported as it is in the deck. */
  warnings: ExportWarning[];
}

/** Video and audio: what an export may leave beside the file instead of inside it. */
const isMedia = (asset: AssetMeta): boolean => asset.kind === 'video' || asset.kind === 'audio';

/** The address of a file in the media folder, as the exported file writes it: relative to itself. */
export function mediaUrl(folder: string, file: string): string {
  return `${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
}

/** A media asset that stays outside the file: its address in the folder, and its line of the report. */
function besideFile(meta: AssetMeta, folder: string): { uri: string; report: EmbeddedAsset } {
  return {
    uri: mediaUrl(folder, meta.file),
    report: { id: meta.id, mime: meta.mime, originalBytes: meta.bytes, bytes: 0, file: meta.file },
  };
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
  const warnings: ExportWarning[] = [];
  const only = options.slideIds ? new Set(options.slideIds) : undefined;
  const slides = deck.slides.filter(
    (slide) => (options.includeHidden || !slide.hidden) && (!only || only.has(slide.id)),
  );
  const exported: Deck = { ...deck, slides };
  const animations = options.animations !== false;
  const { mediaFolder } = options;

  // The assets the exported slides use, under object URLs for the time of the rendering.
  const loaded = new Map<string, LoadedAsset>();
  await Promise.all(
    Array.from(referencedAssetIds(exported), async (id) => {
      const meta = deck.assets[id];
      if (!meta) return;
      if (mediaFolder !== undefined && isMedia(meta)) {
        // Not read: a video may be hundreds of megabytes. A stand-in gives the slides an address
        // to carry while they are drawn, which the address in the folder then replaces. One byte,
        // not none: a browser asked to play an empty file reports a failed request.
        const blob = new Blob([new Uint8Array(1)], { type: meta.mime });
        loaded.set(id, { meta, blob, url: URL.createObjectURL(blob), external: true });
        return;
      }
      const blob = await options.loadAsset(meta).catch(() => undefined);
      if (!blob) {
        if (meta.kind !== 'font') {
          const subject = meta.name ?? meta.file;
          warnings.push({
            code: 'asset-unreadable',
            subject,
            message: `Asset ${subject} could not be read`,
          });
        }
        return;
      }
      const sized = typed(blob, meta);
      loaded.set(id, { meta, blob: sized, url: URL.createObjectURL(sized) });
    }),
  );
  const assets = Array.from(loaded.values());
  const resolveAsset = (asset: AssetMeta) => loaded.get(asset.id)?.url;

  try {
    const rendered = await renderSlides(doc, exported, slides, resolveAsset, animations);
    let markup: string;
    let needs: ReturnType<typeof measureNeeds>;
    let fontCss = '';
    let fonts: EmbeddedFont[] = [];
    let chartCount = 0;
    try {
      needs = measureNeeds(rendered.host, assets);
      const charts = Array.from(rendered.host.querySelectorAll(CHART_SELECTOR));
      chartCount = charts.length;
      // Without animations a chart is shown whole, like everything else on its slide.
      if (!animations) for (const chart of charts) chart.setAttribute(CHART_STILL, '');
      if (options.fontCss) fontCss = await options.fontCss();
      else {
        const embedded = await embedFonts(rendered.host);
        fontCss = embedded.css;
        fonts = embedded.fonts;
        warnings.push(...embedded.warnings);
      }
      markHeadings(rendered.host, slides);
      persistMediaState(rendered.host);
      if (typeof rendered.host.getHTML === 'function') {
        markup = rendered.host.getHTML({ serializableShadowRoots: true });
      } else {
        markup = rendered.host.innerHTML;
        warnings.push({
          code: 'shadow-roots',
          message: 'This browser cannot write shadow roots: HTML elements lost their content',
        });
      }
    } finally {
      rendered.dispose();
    }

    // Each object URL in the markup gives way to the asset itself.
    const used = assets.filter((asset) => markup.includes(asset.url));
    const pixelRatio = options.pixelRatio ?? 2;
    const quality = options.imageQuality ?? 0.9;
    const embedded = await Promise.all(
      used.map((asset) =>
        asset.external && mediaFolder !== undefined
          ? Promise.resolve(besideFile(asset.meta, mediaFolder))
          : embedAsset(asset, needs.get(asset.meta.id), { pixelRatio, quality }),
      ),
    );
    const uris = new Map(used.map((asset, i) => [asset.url, embedded[i]?.uri ?? '']));
    if (used.length) {
      const urls = new RegExp(used.map((asset) => escapeRegExp(asset.url)).join('|'), 'g');
      markup = markup.replace(urls, (url) => uris.get(url) ?? url);
    }

    // The chart library goes into a file only with a chart to draw (EXP-12), and is loaded
    // here only then: a deck without charts never pays for it.
    const chartScript = chartCount
      ? (await import('@slidr/renderer/chart-bundle')).chartBundle
      : undefined;
    const html = buildDocument({
      title: deck.meta.title,
      lang: deck.meta.lang,
      dir: deck.meta.dir,
      size: deck.size,
      slides: markup,
      fontCss,
      script: playerBundle,
      chartScript,
    });
    return {
      html,
      bytes: new Blob([html]).size,
      slides: slides.length,
      assets: embedded.map((e) => e.report),
      fonts,
      charts: { count: chartCount, bytes: chartScript ? new Blob([chartScript]).size : 0 },
      ...(embedded.some((e) => e.report.file !== undefined) && mediaFolder !== undefined
        ? { mediaFolder }
        : {}),
      warnings,
    };
  } finally {
    for (const asset of assets) URL.revokeObjectURL(asset.url);
  }
}
