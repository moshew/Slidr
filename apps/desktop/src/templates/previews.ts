/**
 * The preview of a template, as the library opens it under the template's card: a deck whose
 * slides show the template, and where its pictures load from.
 *
 * A built-in template is shown by its sample deck. A personal one carries no sample: it is
 * shown by one slide for each of its layouts, with the app's own words for each role.
 *
 * A preview is made once, with its pictures, for each language and direction: the library starts
 * making it when the picture of a template is pointed at, so it is there when it is pressed, and
 * the card opens with the slides in it (`readyPreview`).
 */
import type { AssetMeta, Deck } from '@slidr/model';
import { loadCharts } from '@slidr/renderer';
import type { Template } from '@slidr/templates';
import { sampleDeckOf } from '@slidr/templates';
import { i18n } from '../i18n';
import { coverAsset } from './covers';
import type { LibraryEntry } from './library';

export interface TemplatePreview {
  deck: Deck;
  resolveAsset: (asset: AssetMeta) => string | undefined;
}

/** The longest the pictures of a preview are waited for before it is ready anyway, in ms. */
const PICTURES_WAIT = 700;

/** One slide for each layout of a template, in the language and direction of `like`. */
function layoutsDeck({ template }: LibraryEntry, like: Deck): Deck {
  return sampleDeckOf(
    template,
    {},
    {
      lang: like.meta.lang,
      dir: like.meta.dir,
      assets: template.assets ?? {},
      fallback: (role) => {
        const key = `templates:sample.${role}`;
        return i18n.exists(key) ? i18n.t(key, { lng: like.meta.lang }) : undefined;
      },
    },
  );
}

/** The preview, and whether it is the one to keep: not the stand-in for a sample that failed. */
async function previewOf(
  entry: LibraryEntry,
  like: Deck,
): Promise<{ preview: TemplatePreview; lasting: boolean }> {
  if (!entry.personal) {
    try {
      const { builtInSampleDeck, pictureUrl } = await import('./samples');
      const deck = await builtInSampleDeck(entry.template, like);
      if (deck) {
        const resolveAsset = (asset: AssetMeta) => pictureUrl(asset) ?? coverAsset(asset);
        return { preview: { deck, resolveAsset }, lasting: true };
      }
    } catch (error) {
      console.error(
        `The sample of the template "${entry.template.theme.id}" could not be read`,
        error,
      );
      return {
        preview: { deck: layoutsDeck(entry, like), resolveAsset: coverAsset },
        lasting: false,
      };
    }
  }
  return { preview: { deck: layoutsDeck(entry, like), resolveAsset: coverAsset }, lasting: true };
}

/**
 * Waits for the pictures the slides of a preview show, and for the chart library when they have
 * a chart, so that these are in the slides when the slides come in and do not arrive one by one
 * after them. Not for long: a picture that is slow or missing does not hold the slides back.
 */
async function picturesOf({ deck, resolveAsset }: TemplatePreview): Promise<void> {
  const drawn = JSON.stringify([deck.slides, deck.layouts]);
  const loads: Promise<void>[] = Object.values(deck.assets)
    .filter((asset) => asset.mime.startsWith('image/') && drawn.includes(asset.id))
    .flatMap((asset) => {
      const url = resolveAsset(asset);
      if (!url) return [];
      const image = new Image();
      image.src = url;
      return [image.decode().catch(() => undefined)];
    });
  if (drawn.includes('"type":"chart"')) loads.push(loadCharts().catch(() => undefined));
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, PICTURES_WAIT)),
  ]);
}

/** A preview on its way, and the preview once it has come. */
interface Making {
  promise: Promise<TemplatePreview>;
  done?: TemplatePreview;
}

/**
 * The previews made or on their way, by template and by the language and direction they are in.
 * A personal template that is updated or renamed is another object, and is made again.
 */
const made = new WeakMap<Template, Map<string, Making>>();

const lookOf = (like: Deck) => `${like.meta.lang} ${like.meta.dir}`;

/**
 * The preview of a template in the language and direction of `like`, with its pictures loaded:
 * made the first time it is asked for, and the same one after.
 */
export function readyPreview(entry: LibraryEntry, like: Deck): Promise<TemplatePreview> {
  const key = lookOf(like);
  let looks = made.get(entry.template);
  if (!looks) made.set(entry.template, (looks = new Map<string, Making>()));
  const known = looks.get(key);
  if (known) return known.promise;
  const making: Making = {
    promise: previewOf(entry, like).then(async ({ preview, lasting }) => {
      await picturesOf(preview);
      // A sample that could not be read is tried again the next time.
      if (lasting) making.done = preview;
      else looks.delete(key);
      return preview;
    }),
  };
  looks.set(key, making);
  return making.promise;
}

/** The preview `readyPreview` has made already, to be drawn at once; undefined until it has. */
export function madePreview(entry: LibraryEntry, like: Deck): TemplatePreview | undefined {
  return made.get(entry.template)?.get(lookOf(like))?.done;
}

/** Reads the samples of the built-in templates ahead, so the first preview waits for nothing. */
export async function readSamplesAhead(): Promise<void> {
  const { readSamples } = await import('./samples');
  await readSamples();
}
