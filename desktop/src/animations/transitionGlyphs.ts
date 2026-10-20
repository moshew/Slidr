import {
  Aperture,
  ArrowLeftRight,
  ArrowRightFromLine,
  ArrowRightToLine,
  Blend,
  Box,
  ChevronsRight,
  CircleDashed,
  Contrast,
  Droplet,
  Expand,
  FlipHorizontal,
  MoveRight,
  PanelLeftDashed,
  RotateCw,
  SquaresExclude,
  UnfoldHorizontal,
  Zap,
  type LucideIcon,
} from '@slidr/ui/icons';

/*
 * The small picture of each kind of transition, for where the picture of its tile has no room:
 * the mark between two slides of the Filmstrip. One for every kind the runtime plays, each its
 * own, so the strip says which transition a slide comes in with and not only that it has one.
 *
 * This file takes nothing from the shell, which reads it for the Filmstrip.
 */

export interface TransitionGlyph {
  icon: LucideIcon;
  /** An arrow: it turns with the reading direction of the UI, as every arrow of the app does. */
  mirror?: boolean;
}

const GLYPHS: Record<string, TransitionGlyph> = {
  // Subtle: the picture changes where it stands.
  fade: { icon: Contrast },
  crossfade: { icon: SquaresExclude },
  dissolve: { icon: CircleDashed },
  blur: { icon: Droplet },
  flash: { icon: Zap },
  // Movement: a slide travels.
  push: { icon: ChevronsRight, mirror: true },
  cover: { icon: ArrowRightToLine, mirror: true },
  reveal: { icon: ArrowRightFromLine, mirror: true },
  wipe: { icon: PanelLeftDashed, mirror: true },
  slide: { icon: MoveRight, mirror: true },
  swap: { icon: ArrowLeftRight },
  // Depth.
  zoom: { icon: Expand },
  flip: { icon: FlipHorizontal },
  cube: { icon: Box },
  rotate: { icon: RotateCw },
  split: { icon: UnfoldHorizontal },
  iris: { icon: Aperture },
};

/** The picture of transitions as such: of a kind this app has none for, and of the offer of one. */
const ANY: TransitionGlyph = { icon: Blend };

export function transitionGlyph(type: string): TransitionGlyph {
  return Object.hasOwn(GLYPHS, type) ? (GLYPHS[type] ?? ANY) : ANY;
}
