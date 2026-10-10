import {
  slideFromLayout,
  type CommandBus,
  type Color,
  type Deck,
  type Fill,
  type Layout,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { colorRgb, ScaledSlide, type AssetResolver } from '@slidr/renderer';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  cx,
  Icon,
  keyboardInUse,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tooltip,
  useKeyboardInUse,
} from '@slidr/ui';
import {
  Blend,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Plus,
  Scissors,
  Trash2,
  type LucideIcon,
} from '@slidr/ui/icons';
import { useStore } from 'zustand';
import {
  addSlide,
  allHidden,
  duplicateSlides,
  removeSlides,
  setSlidesHidden,
} from '../arrange/slides';
import { isCtrlLetter } from './keys';
import { setStripCommands, stageKeys, type StageCommand } from './keyboardSession';

/**
 * The Filmstrip (WG2-T07, WG5-T08, FLM-01..04): thumbnails of every slide, in the reading
 * direction of the UI. Only the thumbnails in view are rendered, so 200 slides scroll as smoothly
 * as 10 (NFR-05). Click picks a slide, Ctrl adds to the selection, Shift selects a range; dragging
 * reorders; a right click opens the slide menu, which acts on the whole selection. Between two
 * slides is the transition from the one to the other, and a press on it opens it.
 *
 * For the keyboard and for a screen reader (UI-06) the slides are a list with a name: the list
 * has the keyboard and says which slide it is on and how many there are; the strip around it
 * scrolls, takes the pointer, and holds the "new slide" button beside the list, not in it.
 *
 * It is a standalone component: it knows the bus and the selection, and gets its labels and the
 * clipboard from the host.
 */
export interface FilmstripProps {
  bus: CommandBus;
  deck: Deck;
  selection: SelectionStore;
  resolveAsset?: AssetResolver;
  /**
   * Copy, cut and paste of slides. The clipboard belongs to the host (it needs the window's
   * clipboard events); without it the menu leaves these three out.
   */
  clipboard?: FilmstripClipboard;
  /** Labels in the UI language. Default: English. */
  labels?: FilmstripLabels;
  /**
   * What other areas mark a slide with, drawn over the thumbnail (FLM-04): the design
   * check's findings. A screen reader hears it as the thumbnail's description.
   */
  mark?: (slideId: string) => ReactNode;
  /**
   * Opens the transition into a slide, where the host has an editor for it; the slide is the
   * current one by then. With it the marks between the slides are buttons, and a gap without a
   * transition offers to add one. Without it a transition is marked, and that is all.
   */
  onTransition?: (slideId: string) => void;
  /**
   * The picture of a kind of transition, for its mark between two slides; `mirror` for one that
   * is an arrow. Without it every kind is marked alike.
   */
  transitionGlyph?: (type: string) => { icon: LucideIcon; mirror?: boolean };
  className?: string;
}

export interface FilmstripClipboard {
  copy: (slideIds: string[]) => void;
  cut: (slideIds: string[]) => void;
  /** Pastes after the current slide. */
  paste: () => void;
  /** Whether there is something to paste; asked when the menu opens. */
  canPaste: () => boolean;
}

export interface FilmstripLabels {
  /** The name of the list of slides, for a screen reader. */
  strip: string;
  addSlide: string;
  slide: (n: number) => string;
  /** What a screen reader hears of a slide that comes in with a transition (FLM-04). */
  transition: string;
  /** The mark between two slides: the transition into slide `n`, by its kind (FLM-04). */
  transitionInto: (n: number, type: string) => string;
  /** The same place without a transition: the offer to add one into slide `n`. */
  addTransition: (n: number) => string;
  /** The accessible description of a slide with animated elements, by how many animations (FLM-04). */
  animations: (count: number) => string;
  /** The mark on a slide that is left out of the presentation. */
  hidden: string;
  /** The first choice among the layouts of a new slide. */
  blank: string;
  duplicate: string;
  delete: string;
  hide: string;
  show: string;
  copy: string;
  cut: string;
  paste: string;
  /** The undo step of slides moved along the strip, by a drag or by the keyboard. */
  move: string;
}

export const THUMB_W = 160;
export const THUMB_H = 90;
const GAP = 16;
const PAD = 16;
const VERTICAL_PAD = 7;
/** Matches the filmstrip scrollbar in theme.css; reserve it even with overlay scrollbars. */
const SCROLLBAR_HEIGHT = 6;
/** Thumbnails rendered beyond each edge of the view. */
const OVERSCAN = 3;
/** What one line of a wheel that counts in lines scrolls the strip, in pixels. */
const WHEEL_LINE = 40;
const DRAG_PX = 4;
/** A layout in the "new slide" popover. */
const LAYOUT_W = 120;
/** The round mark of a transition: wider than the gap it sits in, so it lies over both slides. */
const MARK = 24;
/** How far over the slides on either side of a gap the pointer brings out the offer of one. */
const REACH = 12;

const DEFAULT_LABELS: FilmstripLabels = {
  strip: 'Slides',
  addSlide: 'New slide',
  slide: (n: number) => `Slide ${n}`,
  transition: 'Has a transition',
  transitionInto: (n: number, type: string) => `Transition into slide ${n}: ${type}`,
  addTransition: (n: number) => `Add a transition into slide ${n}`,
  animations: (count: number) => (count === 1 ? '1 animation' : `${count} animations`),
  hidden: 'Hidden',
  blank: 'Blank slide',
  duplicate: 'Duplicate',
  delete: 'Delete',
  hide: 'Hide',
  show: 'Show',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  move: 'Move slides',
};

interface Drag {
  pointerId: number;
  startX: number;
  ids: string[];
  active: boolean;
  /** Slot the slides would land in, 0..n, counted in the full list. */
  slot: number;
}

/** The id of a slide's place in the list, which the list names as where the keyboard is. */
const optionId = (slideId: string) => `filmstrip-slide-${slideId}`;

/** Whether a slide comes in with a transition. A transition of "none" is no transition. */
const comesIn = (slide: Slide) => Boolean(slide.transition && slide.transition.type !== 'none');

type Rgba = [number, number, number, number];

function sampleColor(deck: Deck, color: Color): Rgba {
  const [r, g, b] = colorRgb('token' in color ? deck.theme.colors[color.token] : color.value);
  return [r * 255, g * 255, b * 255, color.alpha ?? 1];
}

/** A model fill at the thumbnail's lower end corner, where its number sits. */
function sampleFill(deck: Deck, fill: Fill): Rgba | undefined {
  if (fill.kind === 'solid') return sampleColor(deck, fill.color);
  if (fill.kind !== 'linear' && fill.kind !== 'radial' && fill.kind !== 'conic') return undefined;
  const x = deck.meta.dir === 'rtl' ? 0 : 1;
  const y = 1;
  let at: number;
  if (fill.kind === 'linear') {
    const angle = (fill.angle * Math.PI) / 180;
    const dx = Math.sin(angle) * THUMB_W;
    const dy = -Math.cos(angle) * THUMB_H;
    at = (x * dx + y * dy - Math.min(0, dx) - Math.min(0, dy)) / (Math.abs(dx) + Math.abs(dy) || 1);
  } else if (fill.kind === 'radial') {
    const center = fill.center ?? { x: 0.5, y: 0.5 };
    const distance = (px: number, py: number) =>
      Math.hypot((px - center.x) * THUMB_W, (py - center.y) * THUMB_H);
    at =
      distance(x, y) / Math.max(distance(0, 0), distance(0, 1), distance(1, 0), distance(1, 1), 1);
  } else {
    const center = fill.center ?? { x: 0.5, y: 0.5 };
    const angle = (Math.atan2(x - center.x, center.y - y) * 180) / Math.PI;
    at = ((((angle - fill.angle) % 360) + 360) % 360) / 360;
  }
  const stops = [...fill.stops].sort((a, b) => a.at - b.at);
  const first = stops[0]!;
  if (at <= first.at) return sampleColor(deck, first.color);
  for (let i = 1; i < stops.length; i++) {
    const next = stops[i]!;
    if (at > next.at) continue;
    const before = stops[i - 1]!;
    const fraction = (at - before.at) / (next.at - before.at || 1);
    const a = sampleColor(deck, before.color);
    const b = sampleColor(deck, next.color);
    return a.map((channel, index) => channel * (1 - fraction) + b[index]! * fraction) as Rgba;
  }
  return sampleColor(deck, stops.at(-1)!.color);
}

/** Black or white ink for the number over the slide's background. */
function numberColor(deck: Deck, slide: Slide, imageColor?: Rgba): '#000000' | '#ffffff' {
  const layout = deck.layouts.find((item) => item.id === slide.layoutId);
  const background = slide.background ?? layout?.background ?? deck.theme.background;
  const fallback = sampleColor(deck, { token: 'bg' });
  const base = imageColor ?? sampleFill(deck, background.fill) ?? fallback;
  const dim = background.dim ?? 0;
  const under: [number, number, number] = [
    (base[0] * base[3] + fallback[0] * (1 - base[3])) * (1 - dim),
    (base[1] * base[3] + fallback[1] * (1 - base[3])) * (1 - dim),
    (base[2] * base[3] + fallback[2] * (1 - base[3])) * (1 - dim),
  ];
  const over = background.overlay ? sampleFill(deck, background.overlay) : undefined;
  const [r, g, b]: [number, number, number] = over
    ? ([0, 1, 2].map((i) => under[i]! * (1 - over[3]) + over[i]! * over[3]) as [
        number,
        number,
        number,
      ])
    : under;
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance < 0.179 ? '#ffffff' : '#000000';
}

/** An image background can be dark or light independently of the deck theme. */
function SlideNumber({
  deck,
  slide,
  index,
  resolveAsset,
}: {
  deck: Deck;
  slide: Slide;
  index: number;
  resolveAsset?: AssetResolver;
}) {
  const layout = deck.layouts.find((item) => item.id === slide.layoutId);
  const background = slide.background ?? layout?.background ?? deck.theme.background;
  const fill = background.fill;
  const asset = fill.kind === 'image' ? deck.assets[fill.assetId] : undefined;
  const src = asset && resolveAsset?.(asset);
  const [sample, setSample] = useState<{ src: string; color: Rgba }>();
  useEffect(() => {
    if (!src || fill.kind !== 'image') return;
    let active = true;
    const picture = new Image();
    picture.crossOrigin = 'anonymous';
    picture.onload = () => {
      const width = picture.naturalWidth;
      const height = picture.naturalHeight;
      if (!active || !width || !height) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const slideRatio = deck.size.w / deck.size.h;
      const imageRatio = width / height;
      // A contained image leaves the corner blank unless its ratio matches the slide.
      if (fill.fit === 'contain' && Math.abs(slideRatio - imageRatio) > 0.01) return;
      const cropWidth =
        fill.fit === 'cover' && imageRatio > slideRatio ? height * slideRatio : width;
      const cropHeight =
        fill.fit === 'cover' && imageRatio < slideRatio ? width / slideRatio : height;
      const left = (width - cropWidth) / 2;
      const top = (height - cropHeight) / 2;
      const x = left + (deck.meta.dir === 'rtl' ? 0 : cropWidth - 1);
      const y = top + cropHeight - 1;
      try {
        ctx.drawImage(picture, x, y, 1, 1, 0, 0, 1, 1);
        const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
        if (active) setSample({ src, color: [r!, g!, b!, (alpha! / 255) * (fill.opacity ?? 1)] });
      } catch {
        // A remote image without canvas access keeps the theme-based fallback.
      }
    };
    picture.src = src;
    return () => {
      active = false;
      picture.onload = null;
    };
  }, [src, fill, deck.size.w, deck.size.h, deck.meta.dir]);
  return (
    <span
      data-testid="slide-number"
      aria-hidden="true"
      style={{
        position: 'absolute',
        insetInlineEnd: 7,
        bottom: 5,
        color: numberColor(deck, slide, sample && sample.src === src ? sample.color : undefined),
        font: '600 12px/14px var(--font-ui)',
        fontVariantNumeric: 'tabular-nums',
        textShadow: '0 1px 2px #00000040, 0 -1px 2px #ffffff40',
        pointerEvents: 'none',
      }}
    >
      {index + 1}
    </span>
  );
}

const Thumb = memo(function Thumb({
  deck,
  slideIndex,
  thumbWidth,
  thumbHeight,
  selected,
  current,
  walked,
  resolveAsset,
  label,
  hiddenLabel,
  transitionLabel,
  animationsLabel,
  mark,
}: {
  deck: Deck;
  slideIndex: number;
  thumbWidth: number;
  thumbHeight: number;
  selected: boolean;
  current: boolean;
  /** The selection walk stands on this slide (UI-06): the keyboard is here, selected or not. */
  walked: boolean;
  resolveAsset?: AssetResolver;
  label: string;
  hiddenLabel: string;
  transitionLabel: string;
  animationsLabel: (count: number) => string;
  mark?: (slideId: string) => ReactNode;
}) {
  const slide = deck.slides[slideIndex];
  if (!slide) return null;
  const markId = `filmstrip-mark-${slide.id}`;
  const stateId = `filmstrip-state-${slide.id}`;
  const transition = comesIn(slide);
  const animations = slide.timeline.length;
  const hasState = transition || animations > 0;
  const described = [mark ? markId : '', hasState ? stateId : ''].filter(Boolean).join(' ');
  return (
    <div
      role="option"
      id={optionId(slide.id)}
      aria-selected={selected}
      aria-label={slide.hidden ? `${label}, ${hiddenLabel}` : label}
      aria-describedby={described || undefined}
      // Only the slides in view are drawn: the list says how many there are, and which this is.
      aria-setsize={deck.slides.length}
      aria-posinset={slideIndex + 1}
      data-slide-id={slide.id}
      data-hidden={slide.hidden || undefined}
      data-walk={walked || undefined}
      style={{
        position: 'absolute',
        insetInlineStart: PAD + slideIndex * (thumbWidth + GAP),
        top: VERTICAL_PAD,
        width: thumbWidth,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: thumbWidth,
          height: thumbHeight,
          borderRadius: 'var(--radius-small)',
          overflow: 'hidden',
          opacity: slide.hidden ? 0.45 : 1,
          // Every selected slide is framed like the current one: a paler frame for the others
          // read as no selection at all.
          boxShadow:
            current || selected
              ? '0 0 0 2px var(--color-ui-accent)'
              : '0 0 0 1px var(--color-ui-line)',
          transition: 'box-shadow var(--duration-fast) var(--ease-standard)',
        }}
      >
        <ScaledSlide
          deck={deck}
          slide={slide}
          width={thumbWidth}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
        <SlideNumber deck={deck} slide={slide} index={slideIndex} resolveAsset={resolveAsset} />
      </div>
      {walked ? (
        // The walk's ring, outside the frame of the picture as on the Stage. Not on the picture
        // itself: a hidden slide is dimmed, and the ring of the keyboard must not be.
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            insetInlineStart: 0,
            width: thumbWidth,
            height: thumbHeight,
            borderRadius: 'var(--radius-small)',
            outline: '2px dotted var(--color-ui-focus)',
            outlineOffset: 4,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {slide.hidden ? (
        // The mark sits outside the dimmed picture, so it stays at full strength.
        <div
          data-testid="slide-hidden-mark"
          style={{
            position: 'absolute',
            top: 6,
            insetInlineEnd: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 'var(--radius-small)',
            background: 'var(--color-ui-raised)',
            color: 'var(--color-ui-fg)',
            boxShadow: 'var(--shadow-raised), 0 0 0 1px var(--color-ui-line)',
          }}
        >
          <Icon icon={EyeOff} />
        </div>
      ) : null}
      {mark && (
        <div
          id={markId}
          data-testid="slide-mark"
          style={{ position: 'absolute', top: 4, insetInlineStart: 4, display: 'flex', gap: 4 }}
        >
          {mark(slide.id)}
        </div>
      )}
      {hasState && (
        <span id={stateId} data-testid="slide-state" className="sr-only">
          {transition && <span>{transitionLabel}</span>}
          {animations > 0 && <span>{animationsLabel(animations)}</span>}
        </span>
      )}
    </div>
  );
});

/**
 * The transition into a slide, drawn where it plays (FLM-04): in the gap between the slide and
 * the one before it, as the picture of its kind. With an editor to open, it is a button, and a
 * gap without a transition offers to add one to a pointer that comes near.
 *
 * It is no stop of Tab and no part of the list, which holds slides only: from the keyboard the
 * transition of the current slide is reached where the host has its editor.
 */
const TransitionMark = memo(function TransitionMark({
  slide,
  slideIndex,
  thumbWidth,
  thumbHeight,
  label,
  icon = Blend,
  mirror,
  onOpen,
}: {
  slide: Slide;
  slideIndex: number;
  thumbWidth: number;
  thumbHeight: number;
  label: string;
  /** The picture of the transition's kind; of the offer of one, that of transitions as such. */
  icon?: LucideIcon;
  mirror?: boolean;
  onOpen?: (slideId: string) => void;
}) {
  const has = comesIn(slide);
  if (!has && !onOpen) return null;
  const glyph = <Icon icon={icon} mirror={mirror} />;
  const look = {
    className: cx(
      'inline-flex shrink-0 cursor-default items-center justify-center rounded-full transition-[opacity,color,background-color]',
      has
        ? 'bg-ui-accent-soft text-ui-accent-fg'
        : 'bg-ui-raised text-ui-fg-muted opacity-0 group-hover:opacity-100',
      onOpen && (has ? 'hover:bg-ui-accent-soft-hover' : 'hover:text-ui-fg'),
    ),
    style: {
      width: MARK,
      height: MARK,
      // A transition is cut out of the two pictures it lies over; an offer floats above them.
      boxShadow: has
        ? '0 0 0 2px var(--color-ui-panel)'
        : 'var(--shadow-raised), 0 0 0 1px var(--color-ui-line)',
    },
  };
  return (
    <div
      data-testid="slide-transition"
      data-into={slide.id}
      data-transition={has ? slide.transition?.type : undefined}
      className="group"
      style={{
        position: 'absolute',
        insetInlineStart: PAD + slideIndex * (thumbWidth + GAP) - GAP - REACH,
        top: VERTICAL_PAD,
        width: GAP + 2 * REACH,
        height: thumbHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Tooltip content={label} side="top">
        {onOpen ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            // The press is the mark's own, not the start of a drag of slides, and the keyboard
            // stays where the strip puts it.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpen(slide.id)}
            {...look}
          >
            {glyph}
          </button>
        ) : (
          <span role="img" aria-label={label} {...look}>
            {glyph}
          </span>
        )}
      </Tooltip>
    </div>
  );
});

/** A layout as a small picture: its background and decorations, and where its placeholders sit. */
function LayoutPreview({
  deck,
  layout,
  resolveAsset,
}: {
  deck: Deck;
  layout: Layout;
  resolveAsset?: AssetResolver;
}) {
  // The slide of the layout without its (empty) elements: the renderer draws the rest.
  const slide = useMemo(
    () => ({ ...slideFromLayout(deck, layout.id).slide, elements: [] }),
    [deck, layout.id],
  );
  const scale = LAYOUT_W / deck.size.w;
  return (
    <div style={{ position: 'relative', width: LAYOUT_W, height: deck.size.h * scale }}>
      <ScaledSlide
        deck={deck}
        slide={slide}
        width={LAYOUT_W}
        mode="thumbnail"
        resolveAsset={resolveAsset}
      />
      {layout.placeholders.map((p) => (
        <div
          key={p.id}
          aria-hidden
          style={{
            position: 'absolute',
            left: p.frame.x * scale,
            top: p.frame.y * scale,
            width: p.frame.w * scale,
            height: p.frame.h * scale,
            boxSizing: 'border-box',
            border: '1px dashed var(--color-ui-fg-subtle)',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

/** A slide with nothing on it, for the picture of the "blank" choice: the theme's background. */
const BLANK: Slide = { id: 's_blank', elements: [], timeline: [] };

/** The choices of a new slide (FLM-03): blank, or one of the deck's layouts. */
function LayoutChoices({
  deck,
  resolveAsset,
  blankLabel,
  onChoose,
}: {
  deck: Deck;
  resolveAsset?: AssetResolver;
  blankLabel: string;
  onChoose: (layoutId?: string) => void;
}) {
  const card =
    'flex cursor-default flex-col items-center gap-1.5 rounded-control p-1.5 text-xs text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed';
  const frame = {
    borderRadius: 'var(--radius-small)',
    overflow: 'hidden',
    boxShadow: '0 0 0 1px var(--color-ui-line)',
  };
  return (
    <ScrollArea className="-m-2" viewportClassName="max-h-96">
      <div className="grid grid-cols-2 gap-1 p-2">
        {/* A card is named by its layout; the picture of it, with its words, is not its name. */}
        <button type="button" data-layout="" className={card} onClick={() => onChoose()}>
          <div aria-hidden style={frame}>
            <ScaledSlide
              deck={deck}
              slide={BLANK}
              width={LAYOUT_W}
              mode="thumbnail"
              resolveAsset={resolveAsset}
            />
          </div>
          <span className="max-w-full truncate">{blankLabel}</span>
        </button>
        {deck.layouts.map((layout) => (
          <button
            key={layout.id}
            type="button"
            data-layout={layout.id}
            className={card}
            onClick={() => onChoose(layout.id)}
          >
            <div aria-hidden style={frame}>
              <LayoutPreview deck={deck} layout={layout} resolveAsset={resolveAsset} />
            </div>
            <span className="max-w-full truncate">{layout.name}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

const NO_KEYS = { ctrlKey: false, metaKey: false, shiftKey: false };

/** Scrolls the strip so that the slide at an index is in view, if it is not. */
function revealSlide(
  el: HTMLElement,
  index: number,
  behavior: ScrollBehavior,
  thumbWidth: number,
): void {
  const step = thumbWidth + GAP;
  if (index < 0) return;
  const start = PAD + index * step;
  const pos = Math.abs(el.scrollLeft);
  const rtl = getComputedStyle(el).direction === 'rtl';
  const to = (p: number) => el.scrollTo({ left: rtl ? -p : p, behavior });
  if (start < pos) to(start - PAD);
  else if (start + thumbWidth > pos + el.clientWidth) to(start + thumbWidth + PAD - el.clientWidth);
}

export function Filmstrip({
  bus,
  deck,
  selection,
  resolveAsset,
  clipboard,
  labels = DEFAULT_LABELS,
  mark,
  onTransition,
  transitionGlyph,
  className,
}: FilmstripProps) {
  /** The strip: it scrolls and takes the pointer. */
  const scroller = useRef<HTMLDivElement>(null);
  /** The list of slides in it: it takes the keyboard. */
  const list = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ pos: 0, width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  /** What the open menu is about: a slide (and the selection around it) or the empty strip. */
  const [menu, setMenu] = useState({ onSlide: false, canPaste: false });
  const [choosing, setChoosing] = useState(false);
  const currentId = useStore(selection, (s) => s.currentSlideId);
  const selectedIds = useStore(selection, (s) => s.selectedSlideIds);
  const slides = deck.slides;
  const hasLayouts = deck.layouts.length > 0;
  // Keep a separate scrollbar gutter so the bottom padding stays clear of the scroll thumb.
  const thumbHeight = Math.min(
    THUMB_H,
    Math.max(1, (view.height || 95 - SCROLLBAR_HEIGHT) - VERTICAL_PAD * 2),
  );
  const thumbWidth = thumbHeight * (deck.size.w / deck.size.h);
  const step = thumbWidth + GAP;
  const total = PAD * 2 + slides.length * step + thumbWidth;

  // The selection walk (UI-06): the slide the keyboard is on without having selected it.
  const walkId = useStore(stageKeys, (s) => s.slide);
  const walkIndex = walkId ? slides.findIndex((s) => s.id === walkId) : -1;
  const endWalk = () => {
    if (stageKeys.getState().slide !== null) stageKeys.setState({ slide: null });
  };
  // The list shows that it has the keyboard when the keyboard is what brought it there (DSN-08):
  // by Tab or F6, or handed back by a layer that the keys closed. After a press of the pointer
  // the frames of the slides say where the keyboard is, and the keys that follow add no ring:
  // around the whole strip it read as the strip being selected, and not the slides (Ctrl+A).
  const [arrived, setArrived] = useState(false);
  /** The window took the keyboard away, and the list is still the one that had it. */
  const away = useRef(false);
  const ring = useKeyboardInUse() && arrived;

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    // In RTL, Chromium reports scrollLeft as zero or negative; the distance from the start is what counts.
    setView({
      pos: Math.abs(el.scrollLeft),
      width: el.clientWidth,
      // Reserve the gutter even without overflow, avoiding thumbnail size changes as slides are added.
      height: el.offsetHeight - Math.max(SCROLLBAR_HEIGHT, el.offsetHeight - el.clientHeight),
    });
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // A mouse wheel turns up and down, and the strip runs along: turned over the strip it scrolls
  // the strip, toward the slides after when turned down, in either direction of the UI (ADR-066).
  // Shift and a touchpad already scroll it sideways; Ctrl is the browser's zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const unit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientWidth
            : 1;
      const by = e.deltaY * unit;
      // In RTL the strip's start is on the right, and `scrollLeft` runs from 0 down.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const before = el.scrollLeft;
      el.scrollLeft += rtl ? -by : by;
      // At an end the wheel is the page's, as it is for any scroller that cannot go further.
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the current slide in view when it changes (from the Stage, the agent, or the keyboard).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // At once, not gliding, for whoever asked the system for less motion (UI-06).
    const still = el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
    revealSlide(
      el,
      slides.findIndex((s) => s.id === currentId),
      still?.matches ? 'instant' : 'smooth',
      thumbWidth,
    );
  }, [currentId, slides, thumbWidth]);
  // And the slide the walk stands on: the keyboard is there, so it has to be seen.
  useEffect(() => {
    if (scroller.current) revealSlide(scroller.current, walkIndex, 'instant', thumbWidth);
  }, [walkIndex, thumbWidth]);

  const first = Math.max(0, Math.floor((view.pos - PAD) / step) - OVERSCAN);
  const last = Math.min(slides.length - 1, Math.ceil((view.pos + view.width) / step) + OVERSCAN);

  /** The thumbnail slot under a pointer, 0..n, in the strip's own direction. */
  const slotAt = (clientX: number): number => {
    const el = scroller.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline = (rtl ? rect.right - clientX : clientX - rect.left) + Math.abs(el.scrollLeft);
    return Math.max(0, Math.min(slides.length, Math.round((inline - PAD + GAP / 2) / step)));
  };

  const indexAt = (clientX: number): number => {
    const el = scroller.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline =
      (rtl ? rect.right - clientX : clientX - rect.left) + Math.abs(el.scrollLeft) - PAD;
    const i = Math.floor(inline / step);
    return inline - i * step <= thumbWidth && i >= 0 && i < slides.length ? i : -1;
  };

  const select = (index: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const slide = slides[index];
    if (!slide) return;
    const state = selection.getState();
    if (e.ctrlKey || e.metaKey) {
      const has = state.selectedSlideIds.includes(slide.id);
      const ids = has
        ? state.selectedSlideIds.filter((id) => id !== slide.id)
        : [...state.selectedSlideIds, slide.id];
      if (!ids.length) return;
      // Adding a slide makes it current; removing the current one moves "current" to another.
      const keep =
        state.currentSlideId && state.currentSlideId !== slide.id
          ? state.currentSlideId
          : ids.at(-1);
      state.selectSlides(ids, has ? keep : slide.id);
      return;
    }
    if (e.shiftKey && state.currentSlideId) {
      const from = slides.findIndex((s) => s.id === state.currentSlideId);
      const [a, b] = from < index ? [from, index] : [index, from];
      state.selectSlides(
        slides.slice(a, b + 1).map((s) => s.id),
        state.currentSlideId,
      );
      return;
    }
    state.setCurrentSlide(slide.id);
    if (state.selectedSlideIds.length > 1) state.selectSlides([slide.id], slide.id);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const index = indexAt(e.clientX);
    if (index < 0) return;
    // A press is a selection of its own: the walk is over, and the keyboard is the list's.
    endWalk();
    list.current?.focus({ preventScroll: true });
    const slide = slides[index] as Deck['slides'][number];
    const alreadySelected = selection.getState().selectedSlideIds.includes(slide.id);
    if (!alreadySelected || e.ctrlKey || e.metaKey || e.shiftKey) select(index, e);
    const ids = slides
      .filter((s) => selection.getState().selectedSlideIds.includes(s.id))
      .map((s) => s.id);
    scroller.current?.setPointerCapture(e.pointerId);
    setDrag({ pointerId: e.pointerId, startX: e.clientX, ids, active: false, slot: index });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const active = drag.active || Math.abs(e.clientX - drag.startX) > DRAG_PX;
    if (active) setDrag({ ...drag, active, slot: slotAt(e.clientX) });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    scroller.current?.releasePointerCapture(e.pointerId);
    if (drag.active) {
      // `slide.move` counts the position in the list without the slides that move (ADR-007).
      const moving = new Set(drag.ids);
      const toIndex = slides.slice(0, drag.slot).filter((s) => !moving.has(s.id)).length;
      bus.dispatch({ type: 'slide.move', slideIds: drag.ids, toIndex }, { label: labels.move });
    } else {
      // A plain click on a slide that was part of a multi-selection narrows it to that slide.
      const index = indexAt(e.clientX);
      const slide = slides[index];
      if (slide && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
        selection.getState().setCurrentSlide(slide.id);
        selection.getState().selectSlides([slide.id], slide.id);
      }
    }
    setDrag(null);
  };

  /**
   * A menu asked for from the keyboard (Shift+F10, the menu key) arrives at the middle of what
   * has the keyboard, which is no slide in particular: it used to make the slide that happened
   * to be there the current one. It is asked for again at the slide the keyboard is on, the
   * walked one or else the current one, so the menu is about that slide and opens beside it.
   */
  const onContextMenuCapture = (e: MouseEvent) => {
    // From the keyboard the event names no button; a press of the pointer names the right one.
    if (e.nativeEvent.button >= 0) return;
    const el = scroller.current;
    const index = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
    // Without a slide the menu is the strip's own, wherever it opens.
    if (!el || index < 0) return;
    // This event goes no further, so stopping the webview's own menu is done here too.
    e.preventDefault();
    e.stopPropagation();
    revealSlide(el, index, 'instant', thumbWidth);
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline = PAD + index * step + thumbWidth / 2 - Math.abs(el.scrollLeft);
    el.dispatchEvent(
      new globalThis.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: el.ownerDocument.defaultView,
        button: 2,
        clientX: rtl ? rect.right - inline : rect.left + inline,
        clientY: rect.top + 10 + thumbHeight / 2,
      }),
    );
  };

  /** A right click acts on the selection the slide is part of, or on that slide alone. */
  const onContextMenu = (e: MouseEvent) => {
    const index = indexAt(e.clientX);
    const slide = slides[index];
    if (slide && !selection.getState().selectedSlideIds.includes(slide.id)) select(index, NO_KEYS);
    setMenu({ onSlide: Boolean(slide), canPaste: clipboard?.canPaste() ?? false });
  };

  /**
   * A press on the mark before a slide. The slide is the current one, as by a plain press on it,
   * walk and keyboard included; then the host opens the transition into it.
   */
  const openTransition = useCallback(
    (slideId: string) => {
      if (stageKeys.getState().slide !== null) stageKeys.setState({ slide: null });
      list.current?.focus({ preventScroll: true });
      const state = selection.getState();
      state.setCurrentSlide(slideId);
      if (state.selectedSlideIds.length > 1) state.selectSlides([slideId], slideId);
      onTransition?.(slideId);
    },
    [selection, onTransition],
  );

  const add = (layoutId?: string) => addSlide(bus, selection, { layoutId, label: labels.addSlide });
  /** The slides the menu acts on, as they are when an item is chosen. */
  const chosen = () => selection.getState().selectedSlideIds;
  const hiddenAll = allHidden(deck, selectedIds);

  /**
   * Moves the selected slides along the strip from the keyboard (UI-06), as a drag does: one
   * place on or back, or to either end. `slide.move` counts the place without the moving slides.
   */
  const moveSelected = (to: 'on' | 'back' | 'start' | 'end') => {
    const ids = selectedIds.length ? selectedIds : currentId ? [currentId] : [];
    const moving = new Set(ids);
    const rest = slides.filter((s) => !moving.has(s.id));
    const first = slides.findIndex((s) => moving.has(s.id));
    if (first < 0) return;
    const at = slides.slice(0, first).filter((s) => !moving.has(s.id)).length;
    const toIndex = { on: at + 1, back: at - 1, start: 0, end: rest.length }[to];
    if (toIndex < 0 || toIndex > rest.length) return;
    const ordered = slides.filter((s) => moving.has(s.id));
    const after = [...rest.slice(0, toIndex), ...ordered, ...rest.slice(toIndex)];
    // A move that leaves the order as it is is no undo step.
    if (after.every((s, i) => s === slides[i])) return;
    bus.dispatch(
      { type: 'slide.move', slideIds: ordered.map((s) => s.id), toIndex },
      { label: labels.move },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target === list.current && isCtrlLetter(e, 'a') && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (slides.length) {
        selection.getState().selectSlides(
          slides.map((slide) => slide.id),
          currentId ?? slides[0]!.id,
        );
      }
      return;
    }
    // Esc ends the selection walk, and leaves the selection as the walk made it.
    if (e.key === 'Escape' && walkId) {
      e.preventDefault();
      endWalk();
      return;
    }
    // With Alt the arrows are the selection walk's, a shortcut of the registry (see below): the
    // key passes through here untouched.
    if (e.altKey) return;
    const index = slides.findIndex((s) => s.id === currentId);
    const rtl = scroller.current ? getComputedStyle(scroller.current).direction === 'rtl' : false;
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[
      e.key
    ];
    // Ctrl and an arrow carries the selected slides along; Ctrl+Home and Ctrl+End to an end.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const to =
        step === 1
          ? 'on'
          : step === -1
            ? 'back'
            : e.key === 'Home'
              ? 'start'
              : e.key === 'End'
                ? 'end'
                : undefined;
      if (to) {
        e.preventDefault();
        moveSelected(to);
        return;
      }
    }
    if (step !== undefined) {
      e.preventDefault();
      // An arrow of its own is a selection of its own: the walk is over.
      endWalk();
      const next = slides[Math.max(0, Math.min(slides.length - 1, index + step))];
      if (next) {
        if (e.shiftKey) select(slides.indexOf(next), e);
        else selection.getState().setCurrentSlide(next.id);
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      endWalk();
      const target = e.key === 'Home' ? slides[0] : slides.at(-1);
      if (target) selection.getState().setCurrentSlide(target.id);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
      e.preventDefault();
      removeSlides(bus, selectedIds, labels.delete);
    }
  };

  /**
   * The selection walk in the strip (UI-06): the keys that walk the elements of the slide on the
   * Stage walk the slides here, and the key that adds an element to the selection adds a slide.
   * So slides that are not next to each other are selected without the pointer. The keys are
   * shortcuts of the registry; the strip answers them only while its list has the keyboard.
   */
  const runCommand = (command: StageCommand): boolean => {
    if (document.activeElement !== list.current) return false;
    if (command.type === 'walk') {
      // From where the walk stands, or from the current slide; it stops at the ends of the strip.
      const from = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
      const to = slides[Math.max(0, Math.min(slides.length - 1, from + command.step))];
      if (!to) return false;
      stageKeys.setState({ slide: to.id });
      return true;
    }
    if (command.type === 'toggle') {
      if (walkIndex < 0) return false;
      // What Ctrl and a click do: a slide that joins the selection is the one on the Stage.
      select(walkIndex, { ctrlKey: true, metaKey: false, shiftKey: false });
      return true;
    }
    return false;
  };
  useEffect(() => {
    setStripCommands(runCommand);
    return () => setStripCommands(null);
  });

  const indicator = drag?.active ? PAD + drag.slot * step - GAP / 2 - 1 : undefined;
  // The slide the keyboard is on: where the walk stands, else the current one. The list names
  // it only while its thumbnail is drawn, as only the slides in view are.
  const activeIndex = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
  const activeSlide = activeIndex >= first && activeIndex <= last ? slides[activeIndex] : undefined;

  const addButton = (
    <button
      type="button"
      aria-label={labels.addSlide}
      data-testid="new-slide"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={hasLayouts ? undefined : () => add()}
      style={{ width: thumbHeight, height: thumbHeight }}
      className="inline-flex cursor-default items-center justify-center rounded-small border border-dashed border-ui-line-strong text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed"
    >
      <Icon icon={Plus} size="md" />
    </button>
  );

  /*
   * The menu and the layout popover are siblings of the strip in the React tree, not children of
   * it: React events bubble through portals, and a click in a popover must not reach the strip's
   * pointer and key handlers.
   */
  return (
    <Popover open={choosing} onOpenChange={setChoosing}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            data-filmstrip=""
            className={className}
            onScroll={measure}
            // Any press in the strip, on a slide or between two: the pointer is at work here now.
            onPointerDownCapture={() => setArrived(false)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onContextMenuCapture={onContextMenuCapture}
            onContextMenu={onContextMenu}
            style={{
              position: 'relative',
              overflowX: 'auto',
              overflowY: 'hidden',
              // The ring of the list is drawn on the strip, which is what is in view of it.
              outline: ring ? '2px solid var(--color-ui-focus)' : 'none',
              outlineOffset: -2,
              userSelect: 'none',
            }}
          >
            <div style={{ position: 'relative', width: total, height: '100%' }}>
              {/* The list holds the slides and nothing else: it is as long as the strip, so
                  getting the focus never scrolls it, and the button after it lies over its end. */}
              <div
                ref={list}
                role="listbox"
                aria-label={labels.strip}
                aria-multiselectable
                aria-orientation="horizontal"
                aria-activedescendant={activeSlide ? optionId(activeSlide.id) : undefined}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onFocus={(e) => {
                  if (e.target !== e.currentTarget) return;
                  // Coming back to the window is no arrival: the list had the keyboard all along.
                  if (!away.current) setArrived(keyboardInUse());
                  away.current = false;
                }}
                onBlur={(e) => {
                  if (e.target !== e.currentTarget) return;
                  // When it is the window that lost the keyboard, the list is still the
                  // document's active element.
                  away.current = document.activeElement === e.currentTarget;
                  if (!away.current) setArrived(false);
                  // The walk is the keyboard's place in the list, and ends when it leaves.
                  endWalk();
                }}
                style={{ position: 'absolute', inset: 0, outline: 'none' }}
              >
                {slides.slice(first, last + 1).map((slide, i) => (
                  <Thumb
                    key={slide.id}
                    deck={deck}
                    thumbWidth={thumbWidth}
                    thumbHeight={thumbHeight}
                    slideIndex={first + i}
                    selected={selectedIds.includes(slide.id)}
                    current={slide.id === currentId}
                    walked={slide.id === walkId}
                    resolveAsset={resolveAsset}
                    label={labels.slide(first + i + 1)}
                    hiddenLabel={labels.hidden}
                    transitionLabel={labels.transition}
                    animationsLabel={labels.animations}
                    mark={mark}
                  />
                ))}
              </div>
              {/* The transitions, in the gaps before the slides in view and outside the list.
                  Not while slides are dragged: the place they would land in is drawn there. */}
              {!drag?.active &&
                slides.slice(Math.max(first, 1), last + 1).map((slide, i) => {
                  const index = Math.max(first, 1) + i;
                  // The kind of the transition into the slide, when it comes in with one.
                  const type = comesIn(slide) ? slide.transition?.type : undefined;
                  const glyph = type === undefined ? undefined : transitionGlyph?.(type);
                  return (
                    <TransitionMark
                      key={slide.id}
                      slide={slide}
                      thumbWidth={thumbWidth}
                      thumbHeight={thumbHeight}
                      slideIndex={index}
                      label={
                        type === undefined
                          ? labels.addTransition(index + 1)
                          : labels.transitionInto(index + 1, type)
                      }
                      icon={glyph?.icon}
                      mirror={glyph?.mirror}
                      onOpen={onTransition && openTransition}
                    />
                  );
                })}
              <div
                style={{
                  position: 'absolute',
                  insetInlineStart: PAD + slides.length * step,
                  top: VERTICAL_PAD,
                }}
              >
                {/* With layouts in the deck the button offers them (FLM-03). */}
                <Tooltip content={labels.addSlide} shortcut="Ctrl+M">
                  {hasLayouts ? <PopoverTrigger asChild>{addButton}</PopoverTrigger> : addButton}
                </Tooltip>
              </div>
              {indicator !== undefined ? (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    insetInlineStart: indicator,
                    top: 6,
                    width: 2,
                    height: thumbHeight + 2,
                    borderRadius: 1,
                    background: 'var(--color-ui-accent)',
                  }}
                />
              ) : null}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="slide-menu">
          {hasLayouts ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger icon={Plus}>{labels.addSlide}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => add()}>{labels.blank}</ContextMenuItem>
                <ContextMenuSeparator />
                {deck.layouts.map((layout) => (
                  <ContextMenuItem key={layout.id} onSelect={() => add(layout.id)}>
                    {layout.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem icon={Plus} shortcut="Ctrl+M" onSelect={() => add()}>
              {labels.addSlide}
            </ContextMenuItem>
          )}
          {menu.onSlide ? (
            <>
              <ContextMenuItem
                icon={CopyPlus}
                shortcut="Ctrl+D"
                onSelect={() => duplicateSlides(bus, selection, chosen(), labels.duplicate)}
              >
                {labels.duplicate}
              </ContextMenuItem>
              <ContextMenuItem
                icon={hiddenAll ? Eye : EyeOff}
                onSelect={() =>
                  setSlidesHidden(bus, chosen(), !hiddenAll, hiddenAll ? labels.show : labels.hide)
                }
              >
                {hiddenAll ? labels.show : labels.hide}
              </ContextMenuItem>
            </>
          ) : null}
          {clipboard ? (
            <>
              <ContextMenuSeparator />
              {menu.onSlide ? (
                <>
                  <ContextMenuItem
                    icon={Scissors}
                    shortcut="Ctrl+X"
                    onSelect={() => clipboard.cut(chosen())}
                  >
                    {labels.cut}
                  </ContextMenuItem>
                  <ContextMenuItem
                    icon={Copy}
                    shortcut="Ctrl+C"
                    onSelect={() => clipboard.copy(chosen())}
                  >
                    {labels.copy}
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuItem
                icon={ClipboardPaste}
                shortcut="Ctrl+V"
                disabled={!menu.canPaste}
                onSelect={() => clipboard.paste()}
              >
                {labels.paste}
              </ContextMenuItem>
            </>
          ) : null}
          {menu.onSlide ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Trash2}
                shortcut="Del"
                tone="danger"
                onSelect={() => removeSlides(bus, chosen(), labels.delete)}
              >
                {labels.delete}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {hasLayouts ? (
        <PopoverContent side="top" align="end" data-testid="layout-choices">
          <LayoutChoices
            deck={deck}
            resolveAsset={resolveAsset}
            blankLabel={labels.blank}
            onChoose={(layoutId) => {
              setChoosing(false);
              add(layoutId);
            }}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
