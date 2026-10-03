import {
  createSlide,
  duplicateSlide,
  pasteSlides,
  slideFromLayout,
  type CommandBus,
  type Deck,
  type SelectionStore,
} from '@slidr/model';

/*
 * Managing slides (WG5-T08, SLD-01, FLM-02): the operations behind the Filmstrip's menu and the
 * slide shortcuts. They know the bus and the selection only, not the shell, so the Filmstrip
 * stays a standalone component. Each one is one undo step.
 */

/** The given slides that are in the deck, in deck order. */
function inDeckOrder(deck: Deck, slideIds: readonly string[]): string[] {
  const wanted = new Set(slideIds);
  return deck.slides.filter((s) => wanted.has(s.id)).map((s) => s.id);
}

/**
 * Adds a slide after the current one and shows it: built from a layout when one is given
 * (FLM-03), blank otherwise.
 */
export function addSlide(
  bus: CommandBus,
  selection: SelectionStore,
  options: { layoutId?: string; label?: string } = {},
): void {
  const { deck } = bus;
  const index = deck.slides.findIndex((s) => s.id === selection.getState().currentSlideId) + 1;
  const command =
    options.layoutId !== undefined
      ? slideFromLayout(deck, options.layoutId, { index })
      : ({ type: 'slide.add', slide: createSlide(), index } as const);
  bus.dispatch(command, { label: options.label });
  selection.getState().setCurrentSlide(command.slide.id);
}

/** The layout a new slide takes when none was picked (Ctrl+M): the current slide's. */
export function layoutOfCurrentSlide(deck: Deck, selection: SelectionStore): string | undefined {
  const slide = deck.slides.find((s) => s.id === selection.getState().currentSlideId);
  return deck.layouts.some((l) => l.id === slide?.layoutId) ? slide?.layoutId : undefined;
}

/** Copies slides, as a block after the last of them, and selects the copies. */
export function duplicateSlides(
  bus: CommandBus,
  selection: SelectionStore,
  slideIds: readonly string[],
  label?: string,
): void {
  const { deck } = bus;
  const ids = inDeckOrder(deck, slideIds);
  const last = ids.at(-1);
  if (last === undefined) return;
  const [only] = ids;
  const commands =
    ids.length === 1 && only !== undefined
      ? [duplicateSlide(deck, only)]
      : pasteSlides(
          deck,
          deck.slides.filter((s) => ids.includes(s.id)),
          { index: deck.slides.findIndex((s) => s.id === last) + 1 },
        );
  bus.batch(commands, { label });
  selection
    .getState()
    .selectSlides(commands.flatMap((c) => (c.type === 'slide.add' ? [c.slide.id] : [])));
}

export function removeSlides(bus: CommandBus, slideIds: readonly string[], label?: string): void {
  const ids = inDeckOrder(bus.deck, slideIds);
  if (ids.length > 0) bus.dispatch({ type: 'slide.remove', slideIds: ids }, { label });
}

/** True when every one of the slides is hidden: the menu then offers to show them. */
export function allHidden(deck: Deck, slideIds: readonly string[]): boolean {
  const wanted = new Set(slideIds);
  const slides = deck.slides.filter((s) => wanted.has(s.id));
  return slides.length > 0 && slides.every((s) => s.hidden);
}

/** Hides slides from the presentation, or shows them again. They stay in the Filmstrip. */
export function setSlidesHidden(
  bus: CommandBus,
  slideIds: readonly string[],
  hidden: boolean,
  label?: string,
): void {
  const ids = inDeckOrder(bus.deck, slideIds);
  if (ids.length === 0) return;
  bus.batch(
    ids.map((slideId) => ({
      type: 'slide.update',
      slideId,
      patch: { hidden: hidden ? true : null },
    })),
    { label },
  );
}
