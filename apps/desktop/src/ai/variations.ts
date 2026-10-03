/**
 * The variations gallery (WG11-T08; AIO-02, AIO-03, AIS-03): the options an agent offers with
 * `ui_present_options`, and the images of an `image_generate` call as they arrive. A card can
 * be tried on the Stage without changing the deck (STG-10), and picking one applies it as one
 * undo step. The app applies the pick, not the agent (ADR-011).
 *
 * No React here: the store is what the panel draws, and the functions are what its cards do.
 */
import {
  createDeckApi,
  DeckApiError,
  startTurn,
  type ConversionService,
  type OptionCard,
  type OptionsService,
  type SessionScope,
} from '@slidr/agent-tools';
import {
  CommandBus,
  findElement,
  findSlide,
  newId,
  type AssetMeta,
  type Command,
  type Deck,
  type RichText,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ImageErrorKind, ImageEvent } from '../images/images';
import { showPreview } from '../stage/preview';

export type OptionKind = 'text' | 'image' | 'layout';

/** What a set of options is for: an element, or a whole slide. */
export interface OptionTarget {
  slideId: string;
  elementId?: string;
}

/** One card of the gallery. */
export interface GalleryCard {
  /** A few words from the agent; empty for an image that came straight from its job. */
  label: string;
  /** `pending`: on its way (an image being made, a design being converted). */
  state: 'pending' | 'ready' | 'failed';
  /** A text option as the agent wrote it, in Markdown. */
  text?: string;
  /** The same text as the element would hold it: in the formatting of the text it replaces. */
  content?: RichText;
  /** An image option. */
  asset?: AssetMeta;
  /** A design option: the slide it converts to, and the assets the conversion stored. */
  slide?: Slide;
  assets?: AssetMeta[];
  /** Why the card failed: English, from the service that made it. */
  problem?: string;
  /** For an image, the kind of failure, so the card can say it in the user's words. */
  problemKind?: ImageErrorKind;
  /** For an image that comes from a job: which image of which job fills the card. */
  key?: string;
}

export interface OptionSet {
  id: string;
  kind: OptionKind;
  /** The tool whose session offered the options: the panel that shows them. */
  from: 'slide' | 'object';
  target: OptionTarget;
  /** The agent's line above the cards. */
  prompt?: string;
  cards: GalleryCard[];
  /** The images are still being made: the cards fill in one by one. */
  live: boolean;
  /** The card the user picked last, and the undo step that applied it. */
  picked?: { index: number; txId: string };
}

export interface GalleryState {
  /** The newest set of each target, oldest first. */
  sets: OptionSet[];
}

export interface GalleryOptions {
  bus: CommandBus;
  selection: SelectionStore;
  /** Turns a design written as HTML into a slide. Without it, design options are refused. */
  conversion?: ConversionService;
}

export interface Gallery {
  store: StoreApi<GalleryState>;
  /** The Deck API's `options` service: what `ui_present_options` calls. */
  service: OptionsService;
  /** A tool call of a session is about to run: an image call announces the cards to expect. */
  noteToolCall: (scope: SessionScope, name: string, input: unknown) => void;
  /**
   * Why a tool call should not run, written for the agent; undefined when it may. Images that
   * are still being made for an element are not asked for a second time: a call that timed out
   * on the agent's side is still at work here, and asking again would make every image twice.
   */
  refusal: (scope: SessionScope, name: string, input: unknown) => string | undefined;
  /** Progress of an image job of the agent's image service. */
  imageEvent: (jobId: string, event: ImageEvent) => void;
  /** Shows a card on the Stage without changing the deck; `null` takes the preview down. */
  preview: (setId: string, index: number | null) => void;
  /** Applies a card as one undo step. False when the card can no longer be applied. */
  pick: (setId: string, index: number, label: string) => boolean;
  dismiss: (setId: string) => void;
}

const sameTarget = (a: OptionTarget, b: OptionTarget) =>
  a.slideId === b.slideId && a.elementId === b.elementId;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An image call waits this long for its job's first event before it is forgotten. */
const EXPECT_MS = 10_000;

/**
 * What picking a card does to the deck as it is now. A design replaces everything on its slide,
 * the way `slide_replace_from_html` does: the slide keeps its id, name, notes and place.
 */
export function commandsOf(set: OptionSet, card: GalleryCard, deck: Deck): Command[] {
  const { slideId, elementId } = set.target;
  if (set.kind === 'text') {
    if (!elementId || !card.content) return [];
    return [{ type: 'text.set', slideId, elementId, content: card.content }];
  }
  if (set.kind === 'image') {
    if (!elementId || !card.asset) return [];
    return [
      // An image picked before its tool call returned is not in the deck yet.
      ...(deck.assets[card.asset.id] ? [] : [{ type: 'asset.add' as const, asset: card.asset }]),
      // The frame and the crop stay (AIO-03); a placeholder's prompt has done its work.
      {
        type: 'element.update',
        slideId,
        elementId,
        patch: { assetId: card.asset.id, prompt: null },
      },
    ];
  }
  const current = findSlide(deck, slideId);
  const design = card.slide;
  if (!current || !design) return [];
  return [
    ...(card.assets ?? []).map((asset): Command => ({ type: 'asset.add', asset })),
    ...(current.elements.length > 0
      ? [
          {
            type: 'element.remove' as const,
            slideId,
            elementIds: current.elements.map((e) => e.id),
          },
        ]
      : []),
    ...design.elements.map((element): Command => ({ type: 'element.add', slideId, element })),
    {
      type: 'slide.update',
      slideId,
      patch: { background: design.background ?? null, css: design.css ?? null, layoutId: null },
    },
    { type: 'slide.setTimeline', slideId, timeline: design.timeline },
  ];
}

export function createGallery({ bus, selection, conversion }: GalleryOptions): Gallery {
  const store = createStore<GalleryState>(() => ({ sets: [] }));
  /** Image calls whose jobs have not reported yet, in the order they were made. */
  let expected: { target: OptionTarget; count: number; prompt: string; at: number }[] = [];
  /** The set each image job fills, and the prompt it generates from (for its assets' lineage). */
  const jobs = new Map<string, { setId: string; prompt: string }>();
  /**
   * The session whose `ui_present_options` call is on its way in. The tool reaches `present`
   * before it first waits, so the call noted last is the one that is presenting.
   */
  let presenting: OptionSet['from'] = 'object';

  const find = (setId: string) => store.getState().sets.find((set) => set.id === setId);

  /** Shows a set in place of the one its target had. */
  function show(set: OptionSet): void {
    store.setState(({ sets }) => ({
      sets: [...sets.filter((other) => !sameTarget(other.target, set.target)), set],
    }));
  }

  function patchCard(setId: string, index: number, card: Partial<GalleryCard>): void {
    store.setState(({ sets }) => ({
      sets: sets.map((set) => {
        if (set.id !== setId) return set;
        const cards = set.cards.map((c, i) => (i === index ? { ...c, ...card } : c));
        return { ...set, cards, live: set.live && cards.some((c) => c.state === 'pending') };
      }),
    }));
  }

  /** Fills the card of one image of a job. A set that was dismissed has no card to fill. */
  function patchKey(setId: string, key: string, card: Partial<GalleryCard>): void {
    store.setState(({ sets }) => ({
      sets: sets.map((set) => {
        if (set.id !== setId) return set;
        const cards = set.cards.map((c) => (c.key === key ? { ...c, ...card } : c));
        return { ...set, cards, live: cards.some((c) => c.state === 'pending') };
      }),
    }));
  }

  /** The images an object session's element has been offered so far. */
  const imagesOf = (target: OptionTarget) =>
    store.getState().sets.find((set) => set.kind === 'image' && sameTarget(set.target, target));

  /** The image element an object session works on, as a target: where its images go. */
  function imageTarget(scope: SessionScope): OptionTarget | undefined {
    if (scope.kind !== 'object') return undefined;
    const elementId = scope.elementIds[0];
    const slide = findSlide(bus.deck, scope.slideId);
    const element = slide && elementId ? findElement(slide, elementId) : undefined;
    return element?.type === 'image'
      ? { slideId: scope.slideId, elementId: element.id }
      : undefined;
  }

  /**
   * A text option as the element would hold it. The Deck API's own `text_set` decides that (new
   * paragraphs take the formatting of the text they replace), so it is run here on a copy of
   * the deck, and the content it wrote is what a pick applies.
   */
  async function textContent(deck: Deck, target: OptionTarget, markdown: string) {
    const scratch = new CommandBus(deck);
    const result = await createDeckApi(scratch).call(
      startTurn('gallery', { kind: 'deck' }),
      'text_set',
      { slideId: target.slideId, elementId: target.elementId, markdown },
    );
    if (!result.ok) throw new DeckApiError(result.error.code, result.error.message);
    const slide = findSlide(scratch.deck, target.slideId);
    const element = slide && target.elementId ? findElement(slide, target.elementId) : undefined;
    if (element?.type !== 'text' && element?.type !== 'shape') return undefined;
    return element.content;
  }

  function elementOf(deck: Deck, target: OptionTarget) {
    const slide = findSlide(deck, target.slideId);
    if (!slide) {
      throw new DeckApiError('not_found', `Slide "${target.slideId}" is not in the deck.`);
    }
    const element = target.elementId ? findElement(slide, target.elementId) : undefined;
    return { slide, element };
  }

  const service: OptionsService = {
    async present({ kind, target, prompt, options }) {
      const deck = bus.deck;
      const { element } = elementOf(deck, target);
      const set: OptionSet = {
        id: newId('tx'),
        kind,
        from: presenting,
        target,
        ...(prompt ? { prompt } : {}),
        cards: options.map((option) => ({ label: option.label, state: 'pending' })),
        live: false,
      };
      const failures: string[] = [];
      const fail = (index: number, problem: string): GalleryCard => {
        failures.push(`option ${index + 1}: ${problem}`);
        return { label: options[index]?.label ?? '', state: 'failed', problem };
      };

      if (kind === 'text') {
        if (!element) {
          throw new DeckApiError(
            'invalid_input',
            'Text options are for one element: give elementId.',
          );
        }
        set.cards = await Promise.all(
          options.map(async (option: OptionCard, i): Promise<GalleryCard> => {
            if (!option.text?.trim()) return fail(i, 'it has no `text`.');
            try {
              const content = await textContent(deck, target, option.text);
              return content
                ? { label: option.label, state: 'ready', text: option.text, content }
                : fail(i, `element "${element.id}" holds no text.`);
            } catch (error) {
              return fail(i, error instanceof Error ? error.message : String(error));
            }
          }),
        );
      } else if (kind === 'image') {
        if (element?.type !== 'image') {
          throw new DeckApiError(
            'invalid_state',
            'Image options are for an image element: give the elementId of one.',
          );
        }
        set.cards = options.map((option, i): GalleryCard => {
          const asset = option.assetId ? deck.assets[option.assetId] : undefined;
          if (!asset) {
            return fail(
              i,
              option.assetId
                ? `asset "${option.assetId}" is not in the deck.`
                : 'it has no `assetId`.',
            );
          }
          return { label: option.label, state: 'ready', asset };
        });
        // Images that arrived before, or are still on their way, stay beside the ones presented:
        // a call that timed out for the agent may have made images it does not know about.
        const before = imagesOf(target);
        if (before) {
          const presented = new Set(set.cards.map((card) => card.asset?.id));
          set.id = before.id;
          set.cards.push(
            ...before.cards.filter(
              (card) =>
                card.state === 'pending' ||
                (card.state === 'ready' && !presented.has(card.asset?.id)),
            ),
          );
          set.live = set.cards.some((card) => card.state === 'pending');
        }
      } else {
        if (!conversion) {
          throw new DeckApiError('unavailable', 'Design options need the HTML conversion engine.');
        }
        // The cards are up while the designs convert, one after another, and fill in as they do.
        show(set);
        for (const [i, option] of options.entries()) {
          let card: GalleryCard;
          if (!option.html?.trim()) card = fail(i, 'it has no `html`.');
          else {
            try {
              const design = await conversion.htmlToSlide(bus.deck, { html: option.html });
              card = {
                label: option.label,
                state: 'ready',
                slide: design.slide,
                assets: design.assets,
              };
            } catch (error) {
              card = fail(i, error instanceof Error ? error.message : String(error));
            }
          }
          // A set that was replaced or dismissed meanwhile has no card to fill.
          patchCard(set.id, i, card);
        }
      }

      if (failures.length === options.length) {
        store.setState(({ sets }) => ({ sets: sets.filter((other) => other.id !== set.id) }));
        throw new DeckApiError('invalid_input', `No option could be shown. ${failures.join(' ')}`);
      }
      if (kind !== 'layout') show(set);
    },
  };

  return {
    store,
    service,

    noteToolCall(scope, name, input) {
      if (name === 'ui_present_options') presenting = scope.kind === 'slide' ? 'slide' : 'object';
      if (name !== 'image_generate') return;
      const args = isRecord(input) ? input : {};
      // With an element id the first image goes straight into the element: nothing to pick.
      if (typeof args.elementId === 'string') return;
      const target = imageTarget(scope);
      if (!target) return;
      expected.push({
        target,
        count: typeof args.count === 'number' && args.count >= 1 ? Math.floor(args.count) : 1,
        prompt: typeof args.prompt === 'string' ? args.prompt : '',
        at: Date.now(),
      });
    },

    refusal(scope, name, input) {
      if (name !== 'image_generate') return undefined;
      if (isRecord(input) && typeof input.elementId === 'string') return undefined;
      const target = imageTarget(scope);
      if (!target || !imagesOf(target)?.live) return undefined;
      return 'The images of your earlier image_generate call for this element are still being made. The app shows each one to the user as it arrives, and they can pick one, so do not generate again: tell the user the images are on their way.';
    },

    imageEvent(jobId, event) {
      let job = jobs.get(jobId);
      if (!job) {
        // A job nobody has seen: it is the oldest image call still waiting for its job. A call
        // that was refused before it started has no job, and is forgotten.
        expected = expected.filter((call) => Date.now() - call.at < EXPECT_MS);
        const call = expected.shift();
        if (!call) return;
        const cards = Array.from({ length: call.count }, (_, index): GalleryCard => ({
          label: '',
          state: 'pending',
          key: `${jobId}:${index}`,
        }));
        // More images for an element that has some: they join them. What was made is kept,
        // what failed makes room.
        const before = imagesOf(call.target);
        const set: OptionSet = {
          id: before?.id ?? newId('tx'),
          kind: 'image',
          from: 'object',
          target: call.target,
          ...(before?.prompt ? { prompt: before.prompt } : {}),
          // The mark of a pick is by place, and the places have just moved: it goes.
          cards: [...(before?.cards.filter((card) => card.state !== 'failed') ?? []), ...cards],
          live: true,
        };
        job = { setId: set.id, prompt: call.prompt };
        jobs.set(jobId, job);
        show(set);
      }
      if (event.type !== 'finished') return;
      const { outcome } = event;
      const key = `${jobId}:${event.index}`;
      if (outcome.status === 'stored') {
        patchKey(job.setId, key, {
          state: 'ready',
          asset: {
            ...outcome.asset,
            origin: 'ai',
            ...(job.prompt ? { lineage: { prompt: job.prompt } } : {}),
          },
        });
      } else {
        patchKey(job.setId, key, {
          state: 'failed',
          problem: outcome.error.message,
          problemKind: outcome.error.kind,
        });
      }
    },

    preview(setId, index) {
      const set = find(setId);
      const card = set && index !== null ? set.cards[index] : undefined;
      // Only on the slide the option is for: the Stage shows one slide.
      if (
        !set ||
        card?.state !== 'ready' ||
        selection.getState().currentSlideId !== set.target.slideId
      ) {
        showPreview(null);
        return;
      }
      try {
        const scratch = new CommandBus(bus.deck);
        scratch.batch(commandsOf(set, card, bus.deck));
        showPreview(scratch.deck);
      } catch {
        // The element or the slide is gone: there is nothing to show the option on.
        showPreview(null);
      }
    },

    pick(setId, index, label) {
      const set = find(setId);
      const card = set?.cards[index];
      showPreview(null);
      if (!set || card?.state !== 'ready') return false;
      const txId = newId('tx');
      try {
        const commands = commandsOf(set, card, bus.deck);
        if (commands.length === 0) return false;
        bus.batch(commands, { txId, label });
      } catch {
        // What the options were for has been deleted since: the set has nothing left to offer.
        store.setState(({ sets }) => ({ sets: sets.filter((other) => other.id !== setId) }));
        return false;
      }
      store.setState(({ sets }) => ({
        sets: sets.map((other) =>
          other.id === setId ? { ...other, picked: { index, txId } } : other,
        ),
      }));
      return true;
    },

    dismiss(setId) {
      showPreview(null);
      store.setState(({ sets }) => ({ sets: sets.filter((set) => set.id !== setId) }));
    },
  };
}
