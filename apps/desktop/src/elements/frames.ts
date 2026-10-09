import {
  createElement,
  type ElementPatch,
  type Fill,
  type Frame,
  type ImageElement,
  type Shadow,
  type SmartImageFrame,
} from '@slidr/model';
import { presetPath } from '@slidr/renderer';
import { lazy } from '../media/icons/library';
import { searchIcons, wordsOf, type SearchWords } from '../media/icons/search';

/*
 * The photo frames of the Elements panel. A frame is a picture that waits for its photograph:
 * it goes onto a slide as an `image` element with no file yet, and whatever photograph it is
 * given is cut to the frame's outline. A decorated frame also draws artwork around the
 * photograph (an instant photo, a phone, a picture frame), which the element carries with it,
 * so a deck shows it wherever it is opened.
 *
 * The catalogue says what is offered, group by group; `scripts/generate-frames-catalog.mjs`
 * writes it. It is read as text and parsed the first time the frames are shown.
 */

/** The groups of frames, in the order the panel shows them. */
export const FRAME_GROUPS = [
  'basic',
  'photo',
  'framed',
  'devices',
  'arches',
  'organic',
  'brush',
  'composed',
  'hebrew',
  'latin',
  'digits',
  'nature',
  'bubbles',
  'labels',
] as const;
export type FrameGroup = (typeof FRAME_GROUPS)[number];

export type FrameMask = NonNullable<ImageElement['mask']>;

interface Size {
  w: number;
  h: number;
}

/** One layer of a decorated frame: an outline in the frame's box, and what it is painted with. */
export interface FrameLayer {
  d: string;
  fill: Fill;
  shadow?: Shadow;
}

/**
 * The artwork of a decorated frame, in the frame's own box. The photograph shows through
 * `opening`; `clip` cuts it there, as path data in the opening's box.
 */
export interface FrameArt {
  opening: Frame;
  clip?: string;
  layers: readonly FrameLayer[];
}

/** A frame as the catalogue has it: `d` cuts the photograph to an outline in a box of w by h. */
interface CatalogFrame extends Size {
  id: string;
  en: string;
  he: string;
  mask?: FrameMask;
  d?: string;
  art?: FrameArt;
  /** More words it is found by. */
  tags?: { en?: string; he?: string };
}

export interface FramesCatalog {
  /** The frames shown first, by id. */
  featured: readonly string[];
  groups: readonly { id: string; frames: readonly CatalogFrame[] }[];
}

export interface PhotoFrame extends SearchWords {
  /** `frame:instant`: the name of the element it becomes. */
  id: string;
  group: FrameGroup;
  /** What it is called, by the language of the interface. */
  label: { en: string; he: string };
  /** Its box on a slide when it is added, in slide pixels. The artwork is drawn in this box. */
  size: Size;
  /** What cuts the photograph, at that size. A plain box and a decorated frame may have none. */
  mask?: FrameMask;
  art?: FrameArt;
  /** Its place among the frames shown first, when it is one of them. */
  featured?: number;
}

/** Every frame of the catalogue, group by group. */
export function framesOf(catalog: FramesCatalog): PhotoFrame[] {
  return catalog.groups.flatMap(({ id: group, frames }) =>
    frames.map(({ id, en, he, w, h, mask, d, art, tags }): PhotoFrame => {
      const nameWords = wordsOf(en);
      const nameHebrew = wordsOf(he);
      const cut = d ? ({ kind: 'path', d, viewBox: { w, h } } as const) : mask;
      const featured = catalog.featured.indexOf(id);
      return {
        id: `frame:${id}`,
        group: group as FrameGroup,
        label: { en, he },
        size: { w, h },
        ...(cut ? { mask: cut } : {}),
        ...(art ? { art } : {}),
        ...(featured < 0 ? {} : { featured }),
        filled: false,
        nameWords,
        tagWords: wordsOf(tags?.en ?? '').filter((word) => !nameWords.includes(word)),
        nameTerms: [nameHebrew.join(' ')],
        nameHebrew,
        tagTerms: [],
        tagHebrew: wordsOf(tags?.he ?? '').filter((word) => !nameHebrew.includes(word)),
      };
    }),
  );
}

const catalog = lazy<FramesCatalog>(() => import('./frames-catalog.json?raw'));

let frames: Promise<PhotoFrame[]> | undefined;

export function loadFrames(): Promise<PhotoFrame[]> {
  frames ??= catalog()
    .then(framesOf)
    .catch((error: unknown) => {
      frames = undefined;
      throw error;
    });
  return frames;
}

/** The frames shown first, in the order the catalogue names them. */
export function featuredFrames(all: readonly PhotoFrame[]): PhotoFrame[] {
  return all
    .filter((frame) => frame.featured !== undefined)
    .sort((a, b) => (a.featured ?? 0) - (b.featured ?? 0));
}

/** The frames that match every word of a query in Hebrew or English, best first. */
export function searchFrames(all: readonly PhotoFrame[], query: string, count: number) {
  return searchIcons(all, query, { count });
}

/* ---------------------------------------------------------------- on a slide */

/**
 * What a frame makes of the picture it holds, in a box of the given size: the cut of the
 * photograph and the artwork around it. Null takes away what another frame left there.
 */
export function frameLook(
  frame: PhotoFrame,
  box: Size,
): { mask: FrameMask | null; smartFrame: SmartImageFrame | null } {
  const { size, art } = frame;
  if (art) {
    const { opening } = art;
    return {
      mask: art.clip
        ? { kind: 'path', d: art.clip, viewBox: { w: opening.w, h: opening.h } }
        : null,
      smartFrame: {
        viewBox: { ...size },
        opening: { ...opening },
        decorations: art.layers.map((layer) =>
          createElement.shape({
            frame: { x: 0, y: 0, ...size },
            geometry: { kind: 'path', d: layer.d, viewBox: { ...size } },
            fill: layer.fill,
            ...(layer.shadow ? { effects: { shadow: layer.shadow } } : {}),
          }),
        ),
      },
    };
  }
  const { mask } = frame;
  if (mask?.kind !== 'rounded') return { mask: mask ?? null, smartFrame: null };
  // Round corners are in slide pixels: in a box of another size they keep their proportion.
  const scale = Math.min(box.w / size.w, box.h / size.h);
  return { mask: { kind: 'rounded', radius: Math.round(mask.radius * scale) }, smartFrame: null };
}

/** A frame as a new element: a picture with no photograph yet, in the given box. */
export function frameElement(frame: PhotoFrame, box: Frame): ImageElement {
  const { mask, smartFrame } = frameLook(frame, box);
  return createElement.image({
    frame: box,
    name: frame.id,
    ...(mask ? { mask } : {}),
    ...(smartFrame ? { smartFrame } : {}),
  });
}

/**
 * The change that puts a picture in a frame. The picture keeps its photograph, its crop and
 * its adjustments; its box takes the proportions of the frame, as large as fits inside the box
 * it had and around the same centre, and the photograph fills the frame.
 */
export function framePatch(frame: PhotoFrame, picture: ImageElement): ElementPatch {
  const { size } = frame;
  const scale = Math.min(picture.frame.w / size.w, picture.frame.h / size.h);
  const w = Math.max(1, Math.round(size.w * scale));
  const h = Math.max(1, Math.round(size.h * scale));
  const box = {
    x: Math.round(picture.frame.x + (picture.frame.w - w) / 2),
    y: Math.round(picture.frame.y + (picture.frame.h - h) / 2),
    w,
    h,
  };
  return { frame: box, fit: 'cover', ...frameLook(frame, box) };
}

/* ---------------------------------------------------------------- in the panel */

/** The outline a frame cuts its photograph to, as path data in the frame's own box. */
export function frameOutline({ mask, size: { w, h } }: PhotoFrame): string {
  if (mask?.kind === 'path') return mask.d;
  const path =
    mask?.kind === 'ellipse'
      ? presetPath('ellipse', w, h)
      : mask?.kind === 'rounded'
        ? presetPath('roundRect', w, h, [mask.radius / Math.min(w, h)])
        : mask?.kind === 'shape'
          ? presetPath(mask.preset, w, h)
          : undefined;
  return (path ?? presetPath('rect', w, h))?.d ?? '';
}
