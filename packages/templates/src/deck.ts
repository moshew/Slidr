import {
  CommandBus,
  createDeck,
  walkElements,
  type Command,
  type CreateDeckOptions,
  type Deck,
  type Direction,
  type Element,
  type Layout,
} from '@slidr/model';
import { copyJson, equalJson } from './json';
import { mirrorBackground, mirrorElement, mirrorLayout } from './mirror';
import { followPatch, matchLayout, movesOf, relayout, sitsOn, type Move } from './relayout';
import { layoutsFor, type Template } from './template';

/*
 * What a template does to a deck. Like the rest of `compose` in the model, these functions change
 * nothing: they compute commands from the catalogue (ADR-007), and a list given to
 * `CommandBus.batch` is one undo step.
 */

/**
 * The commands that switch a deck to a template (THM-04, SPEC 5.5).
 *
 * - The theme is replaced, so everything that uses tokens follows.
 * - The deck gets the template's layouts for its direction, in the template's order.
 * - Each slide moves to the layout `matchLayout` finds for it, and its elements follow their
 *   placeholders there (see `followPatch`). Nothing is deleted: an element whose role has no
 *   placeholder in the new layout stays where it is.
 * - A slide whose archetype the template does not have keeps its layout, which stays in the deck
 *   after the template's own and follows the new theme through its tokens.
 * - A slide without a layout only follows the theme.
 *
 * Switching back gives the deck back, for everything that followed the template.
 */
export function applyTemplate(deck: Deck, template: Template): Command[] {
  const next = layoutsFor(template, deck.meta.dir);
  const moving: { slideId: string; to: Layout; updates: Command[] }[] = [];
  const kept = new Set<string>();
  for (const slide of deck.slides) {
    const from = deck.layouts.find((layout) => layout.id === slide.layoutId);
    if (!from) continue;
    const to = matchLayout(slide, from, next);
    if (to) moving.push({ slideId: slide.id, to, updates: relayout(slide, from, to) });
    else kept.add(from.id);
  }

  const commands: Command[] = [];
  for (const asset of Object.values(template.assets ?? {})) {
    if (!deck.assets[asset.id]) commands.push({ type: 'asset.add', asset: copyJson(asset) });
  }
  if (!equalJson(deck.theme, template.theme)) {
    commands.push({ type: 'theme.replace', theme: copyJson(template.theme) });
  }

  // The catalogue has no command that reorders layouts, so they are taken out and put in again:
  // the deck ends with the template's layouts in the template's order, whatever it had before.
  const layouts = [...next, ...deck.layouts.filter((layout) => kept.has(layout.id))];
  const replaced = !equalJson(deck.layouts, layouts);
  if (replaced) {
    for (const layout of deck.layouts) {
      if (!kept.has(layout.id)) commands.push({ type: 'layout.remove', layoutId: layout.id });
    }
    next.forEach((layout, index) => commands.push({ type: 'layout.add', layout, index }));
  }
  for (const { slideId, to, updates } of moving) {
    // `layout.remove` took the layout off its slides, so each one is put on its new layout.
    if (replaced) commands.push({ type: 'slide.update', slideId, patch: { layoutId: to.id } });
    commands.push(...updates);
  }
  return commands;
}

/** The fields mirroring changes in one element, as an `element.update` patch. */
function mirrorPatch(before: Element, after: Element): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (after.frame.x !== before.frame.x) patch.frame = after.frame;
  if (after.rotation !== before.rotation) patch.rotation = after.rotation;
  if (Boolean(after.flipH) !== Boolean(before.flipH)) patch.flipH = after.flipH ? true : null;
  if (
    after.type === 'text' &&
    before.type === 'text' &&
    !equalJson(after.padding, before.padding)
  ) {
    patch.padding = after.padding;
  }
  return patch;
}

/**
 * The commands that turn a deck to the other direction, as one step (THM-02): the direction
 * itself, every layout, and what is on the slides.
 *
 * - A layout is mirrored. When the deck's template is given and the layout is still as the
 *   template drew it, the template's layout for the new direction is taken instead, so a layout
 *   corrected by hand for a direction (`Template.flipped`) comes with its corrections.
 * - An element that sits on its placeholder goes where the placeholder went. Every other element
 *   is mirrored where it stands; nested elements are mirrored inside their group.
 * - The text itself is not touched: the direction of a paragraph belongs to its language.
 *
 * Turning the deck back gives the deck back.
 */
export function changeDirection(deck: Deck, dir: Direction, template?: Template): Command[] {
  if (dir === deck.meta.dir) return [];
  const commands: Command[] = [{ type: 'deck.setMeta', patch: { dir } }];

  const byId = (layouts: Layout[]) => new Map(layouts.map((layout) => [layout.id, layout]));
  const drawn = byId(template ? layoutsFor(template, deck.meta.dir) : []);
  const drawnTurned = byId(template ? layoutsFor(template, dir) : []);
  const turned = new Map<string, Layout>();
  for (const layout of deck.layouts) {
    const asDrawn = equalJson(layout, drawn.get(layout.id));
    const to = (asDrawn ? drawnTurned.get(layout.id) : undefined) ?? mirrorLayout(layout);
    turned.set(layout.id, to);
    commands.push({
      type: 'layout.update',
      layoutId: layout.id,
      patch: {
        background: to.background ?? null,
        placeholders: to.placeholders,
        decorations: to.decorations,
      },
    });
  }

  for (const slide of deck.slides) {
    if (slide.background) {
      const background = mirrorBackground(slide.background);
      if (!equalJson(background, slide.background)) {
        commands.push({ type: 'slide.update', slideId: slide.id, patch: { background } });
      }
    }
    const from = deck.layouts.find((layout) => layout.id === slide.layoutId);
    const to = from && turned.get(from.id);
    const moves = from && to ? movesOf(slide, from, to) : new Map<string, Move>();
    for (const element of slide.elements) {
      const before = [...walkElements([element])];
      const after = [...walkElements([mirrorElement(element)])];
      const move = moves.get(element.id);
      before.forEach((inside, i) => {
        const patch = mirrorPatch(inside, after[i]!);
        if (move && inside === element) {
          // The placeholder decides where an element that sits on it goes, not the mirror.
          if (sitsOn(element, move.from)) delete patch.frame;
          Object.assign(patch, followPatch(element, move));
        }
        if (Object.keys(patch).length > 0) {
          commands.push({
            type: 'element.update',
            slideId: slide.id,
            elementId: inside.id,
            patch,
          });
        }
      });
    }
  }
  return commands;
}

export interface DeckFromTemplateOptions extends Omit<
  CreateDeckOptions,
  'theme' | 'layouts' | 'slides'
> {
  /** Start with the template's sample slides instead of an empty deck. */
  sample?: boolean;
}

/**
 * A new deck on a template, in the deck's direction: the theme, the layouts of that direction,
 * the template's assets and, when asked for, its sample slides.
 */
export function deckFromTemplate(template: Template, options: DeckFromTemplateOptions = {}): Deck {
  const { sample = false, ...rest } = options;
  const deck = createDeck({ ...rest, theme: copyJson(template.theme) });
  deck.assets = copyJson(template.assets ?? {});
  if (!sample || !template.sample?.length) {
    deck.layouts = layoutsFor(template, deck.meta.dir);
    return deck;
  }
  const { dir } = deck.meta;
  deck.meta.dir = template.dir;
  deck.layouts = copyJson(template.layouts);
  deck.slides = copyJson(template.sample);
  if (dir === template.dir) return deck;
  // The sample is drawn for the template's direction: turn it round, as a deck would be.
  const bus = new CommandBus(deck);
  bus.batch(changeDirection(deck, dir, template));
  return copyJson(bus.deck);
}
