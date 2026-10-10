import {
  createDeck,
  duplicateSlide,
  walkElements,
  type AssetMeta,
  type Command,
  type CommandBus,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import source from '../../../../../Slidr-media/elements/designs/index.json?raw';
import { designAssetUrl, previewAsset, previewBackdrop } from './designAssets';

/** Authored slide content is installed in media; this module only inserts it into a deck. */
interface DesignCatalog {
  groups: string[];
  groupIds: Record<string, string[]>;
  slides: Record<string, { he: Slide; en: Slide }>;
  subjects: Record<string, [number, number]>;
}

const catalog = JSON.parse(source) as DesignCatalog;
export type DesignGroup = string;
export type DesignId = string;
export const DESIGN_GROUPS: readonly DesignGroup[] = catalog.groups;
export const DESIGN_IDS: readonly DesignId[] = catalog.groups.flatMap(
  (group) => catalog.groupIds[group] ?? [],
);
export const DESIGN_SUBJECTS: Readonly<Record<string, [number, number]>> = catalog.subjects;

export function designsOf(group: DesignGroup): DesignId[] {
  return catalog.groupIds[group]?.slice() ?? [];
}

/** Each insertion gets new slide and element ids; the media file is never changed in place. */
export function designSlide(
  id: DesignId,
  lang: string,
  assetId: string,
  backdropId = assetId,
): Slide {
  const authored = catalog.slides[id]?.[lang.startsWith('he') ? 'he' : 'en'];
  if (!authored) throw new Error(`No design in media: ${id}`);
  const slide = duplicateSlide(createDeck({ slides: [authored] }), authored.id).slide;
  for (const element of walkElements(slide.elements)) {
    if (element.type !== 'image') continue;
    if (element.assetId === '__subject__') element.assetId = assetId;
    if (element.assetId === '__backdrop__') element.assetId = backdropId;
  }
  return slide;
}

/** The gallery renders the same slide model using image URLs in media. */
export function designPreview(id: DesignId, lang: string) {
  const asset = previewAsset(id);
  const backdrop = previewBackdrop(id);
  const slide = designSlide(id, lang, asset.id, backdrop?.id);
  const deck = createDeck({ lang, slides: [slide] });
  deck.assets[asset.id] = asset;
  if (backdrop) deck.assets[backdrop.id] = backdrop;
  return { slide, deck, resolveAsset: designAssetUrl };
}

/** Adds the imported pictures and a fresh slide together, in one undo step. */
export function insertDesign(
  bus: CommandBus,
  selection: SelectionStore,
  id: DesignId,
  name: string,
  historyLabel: string,
  asset: AssetMeta,
  backdrop?: AssetMeta,
): Slide {
  const current = selection.getState().currentSlideId;
  const position = bus.deck.slides.findIndex((candidate) => candidate.id === current);
  const added = designSlide(id, bus.deck.meta.lang, asset.id, backdrop?.id);
  added.name = name;
  const pictures = backdrop && backdrop.id !== asset.id ? [asset, backdrop] : [asset];
  const commands: Command[] = [
    ...pictures
      .filter((picture) => !bus.deck.assets[picture.id])
      .map((picture) => ({ type: 'asset.add' as const, asset: picture })),
    {
      type: 'slide.add',
      slide: added,
      index: position < 0 ? bus.deck.slides.length : position + 1,
    },
  ];
  bus.batch(commands, { label: historyLabel });
  selection.getState().setCurrentSlide(added.id);
  return added;
}
