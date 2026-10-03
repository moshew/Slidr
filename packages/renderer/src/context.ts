import type { AssetMeta, Direction, Element, ShapeElement, TextElement, Theme } from '@slidr/model';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * Where a slide is shown. The renderer draws the same DOM in every mode (RND-01); the mode only
 * decides what may run or play:
 *
 * | mode        | scripts in `html` | media plays | pointer reaches content | pending placeholders |
 * |-------------|-------------------|-------------|-------------------------|----------------------|
 * | `edit`      | run               | no          | no (the Stage owns it)  | shown                |
 * | `thumbnail` | do not run        | no          | no                      | shown                |
 * | `present`   | run               | as set      | yes                     | hidden               |
 *
 * The capture window (RND-04) uses `edit`, so the agent sees what the user edits. Export uses
 * `present`.
 */
export type RenderMode = 'edit' | 'thumbnail' | 'present';

/** Turns an asset into a URL the document can load: the asset protocol in the app, data URIs in export. */
export type AssetResolver = (asset: AssetMeta) => string | undefined;

/** Lets the host wrap or replace an element's DOM, e.g. hide the one being text-edited. */
export type ElementSlot = (element: Element, rendered: ReactNode) => ReactNode;

/**
 * Puts the host's own content inside an element's text box, in place of the text: the Stage's
 * in-place editor (WG4). The box keeps its frame, padding, alignment and fitting, so the text does
 * not move. `undefined` keeps the rendered text.
 */
export type TextSlot = (element: TextElement | ShapeElement) => ReactNode | undefined;

export interface RenderContext {
  theme: Theme;
  mode: RenderMode;
  /** The deck's content direction and language, for documents that do not inherit them. */
  dir: Direction;
  lang: string;
  /** URL of an asset by id, or undefined when the deck does not have it. */
  assetUrl: (assetId: string) => string | undefined;
  asset: (assetId: string) => AssetMeta | undefined;
  slot?: ElementSlot;
  textSlot?: TextSlot;
}

export const RenderContextValue = createContext<RenderContext | null>(null);

export function useRenderContext(): RenderContext {
  const ctx = useContext(RenderContextValue);
  if (!ctx) throw new Error('Element views render only inside a SlideRenderer');
  return ctx;
}

/** Ids for SVG defs (clip paths, markers, filters) that are unique on the page. */
export function domId(reactId: string, suffix: string): string {
  return `slidr${reactId.replace(/[^\w-]/g, '')}-${suffix}`;
}
