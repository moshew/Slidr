/**
 * The import tools (SPEC 13.2, WG9-T15, T16), in import sessions only. The agent explores the
 * live page of the imported file and decides what a slide is; the app copies what it points at,
 * converts it, and measures the result against the source. None of this knows a presentation
 * format (IMP-04): the tools take a selector or JavaScript, and say what the browser reports.
 */
import type { Command, Deck, Slide } from '@slidr/model';
import { z } from 'zod';
import { markdownToRichText } from '../markdown';
import type { ImportedSlide } from '../services';
import { defineTool } from '../tool';

const IMPORT = ['import'] as const;

const target = {
  selector: z
    .string()
    .optional()
    .describe('CSS selector of the element. Open shadow roots are searched too.'),
  js: z
    .string()
    .optional()
    .describe(
      'Instead of a selector: a JavaScript expression that evaluates to the Element, e.g. document.querySelectorAll("section")[3].',
    ),
};

export const importInspect = defineTool({
  name: 'import_inspect',
  description:
    'Describes the live page of the imported file. Without a target: page facts (title, language, viewport and page size, stylesheets, fonts, CSS variables, running animations, files beside the source that did not load, requests the page was refused) and an outline of the DOM from <body>. With `selector` or `js`: the outline of that subtree only. An outline line reads: tag#id.classes [width x height @x,y] children:n (flags) "own text".',
  input: z.strictObject({
    ...target,
    depth: z.number().int().min(1).max(12).optional().describe('Levels to show. Default 4.'),
    maxNodes: z
      .number()
      .int()
      .min(10)
      .max(600)
      .optional()
      .describe('Upper bound on outline lines. Default 160.'),
  }),
  scopes: IMPORT,
  writes: false,
  requires: 'importer',
  async run(input, ctx) {
    return { data: { page: await ctx.services.importer!.inspect(input) } };
  },
});

export const importEval = defineTool({
  name: 'import_eval',
  description:
    'Runs JavaScript inside the isolated page and returns the result. `code` is the body of an async function: `return` a JSON-serialisable value (elements come back as short descriptions; long results are cut). Use it to query the DOM and read styles, and to drive the page: move between slides, reveal build steps, hide player chrome, wait for something to load. The page has no network.',
  input: z.strictObject({ code: z.string().min(1) }),
  scopes: IMPORT,
  writes: false,
  requires: 'importer',
  async run({ code }, ctx) {
    return { data: { result: await ctx.services.importer!.evaluate(code) } };
  },
});

export const importScreenshot = defineTool({
  name: 'import_screenshot',
  description:
    'A picture of the page as it is now: its viewport, or one element when `selector` or `js` is given (the part of it inside the viewport). A picture costs context: take one when you need to see, not to confirm.',
  input: z.strictObject({
    ...target,
    maxWidth: z
      .number()
      .int()
      .min(160)
      .max(1920)
      .optional()
      .describe('Width of the picture in pixels. Default 1024.'),
  }),
  scopes: IMPORT,
  writes: false,
  requires: 'importer',
  async run(input, ctx) {
    const image = await ctx.services.importer!.screenshot(input);
    return { data: { width: image.width, height: image.height }, images: [image] };
  },
});

export const importSetViewport = defineTool({
  name: 'import_set_viewport',
  description:
    "Resizes the isolated page. A deck that fits its stage to the window is shown at 100% when the page has the deck's design size, and a capture is compared with the source exactly only at 100%. An element is captured only when all of it is inside the viewport. Returns the new viewport and the size of the page's content.",
  input: z.strictObject({
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(240).max(2160),
  }),
  scopes: IMPORT,
  writes: false,
  requires: 'importer',
  async run(size, ctx) {
    return { data: { viewport: await ctx.services.importer!.setViewport(size) } };
  },
});

/** A call starts no new slide after this long, so its answer arrives before the call times out. */
const CAPTURE_BUDGET_MS = 40_000;

/**
 * The slide a new deck starts with, while nobody has put anything on it. It makes way for the
 * first imported slide: an import fills a deck, it does not add to an empty page.
 */
function untouchedOnlySlide(deck: Deck): Slide | undefined {
  const [only, ...rest] = deck.slides;
  const untouched =
    only &&
    rest.length === 0 &&
    only.elements.length === 0 &&
    !only.name &&
    !only.notes &&
    !only.background &&
    !only.css;
  return untouched ? only : undefined;
}

function countByType(slide: Slide): string {
  const counts = new Map<string, number>();
  for (const element of slide.elements) {
    counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  }
  return Array.from(counts, ([type, n]) => `${n} ${type}`).join(', ') || 'no elements';
}

const percent = (share: number) => Math.round(share * 100);

/** What the agent reads about one captured slide: the measurements, and what to look into. */
function slideReport(deck: Deck, imported: ImportedSlide): Record<string, unknown> {
  const { slide, source } = imported;
  const remarks: string[] = [];
  const aspect = source.width / source.height;
  if (Math.abs(aspect - 16 / 9) > 0.12) {
    remarks.push(
      `The captured element is ${Math.round(source.width)}x${Math.round(source.height)} (${aspect.toFixed(2)}:1, not 16:9): check that it is the whole slide.`,
    );
  }
  if (!imported.exact) {
    const scale = source.scale ?? 1;
    remarks.push(
      Math.abs(scale - 1) > 0.001
        ? `The page shows this slide at ${Math.round(scale * 1000) / 10}% of its own size, so it was compared approximately. At 100% the comparison is exact and more of the slide becomes editable: use the deck's own setting, or import_set_viewport with the viewport divided by ${scale}.`
        : 'The source draws this content through a scale or on a layer of its own, so it was compared approximately.',
    );
  }
  if (imported.wholeSlideHtml) {
    remarks.push(
      imported.exact
        ? 'Nothing became an editable element: the slide is html only.'
        : 'Nothing became an editable element: the slide is html only. A slide shown through a scale often ends this way: bring the deck to 100%, then capture it again with `replaces`.',
    );
  }
  if (!imported.faithful) {
    remarks.push('Does not look exactly like the source: look at it with slide_render.');
  }
  const kept = imported.notes.filter((note) => note.startsWith('Kept as HTML'));
  const others = imported.notes.filter((note) => !note.startsWith('Kept as HTML'));
  const shown = imported.wholeSlideHtml ? 1 : 6;
  remarks.push(...kept.slice(0, shown));
  if (kept.length > shown) remarks.push(`… and ${kept.length - shown} more regions kept as html.`);
  remarks.push(...others.slice(0, 6));
  return {
    number: deck.slides.findIndex((s) => s.id === slide.id) + 1,
    slideId: slide.id,
    ...(slide.name ? { name: slide.name } : {}),
    faithful: imported.faithful,
    editablePercent: percent(imported.editability),
    textEditablePercent: percent(imported.textEditability),
    elements: countByType(slide),
    ...(remarks.length > 0 ? { remarks } : {}),
  };
}

export const importCapture = defineTool({
  name: 'import_capture',
  description:
    'Captures elements of the page as slides, in the order given, and appends them to the deck. For each: runs `before` (optional JavaScript, as in import_eval) to bring the slide into its final state, waits, then copies the element with the styles, images and fonts it uses, converts what it can into editable elements, compares the result with the source, and keeps as html whatever did not convert faithfully. Returns `captured`, with for each slide its id and number, `faithful`, the share that became editable, element counts and remarks; a slide that could not be captured is reported with the reason (among them: the page draws something over the element that is not part of it). A long call stops early and says which slides are left: call again for those.',
  input: z.strictObject({
    slides: z
      .array(
        z.strictObject({
          ...target,
          before: z
            .string()
            .optional()
            .describe('JavaScript to run first: bring this slide into view in its final state.'),
          name: z.string().optional().describe('A short name for the slide.'),
          replaces: z
            .string()
            .optional()
            .describe(
              'The id of a slide of the deck that this capture takes the place of. For capturing a slide again once the page was put right: the new slide stands where the old one stood, and the old one is removed.',
            ),
          notes: z
            .string()
            .optional()
            .describe('Speaker notes of this slide, when the file has them. Markdown.'),
          waitMs: z
            .number()
            .int()
            .min(0)
            .max(5000)
            .optional()
            .describe('Wait after `before`, for transitions. Default 250.'),
        }),
      )
      .min(1)
      .max(24),
  }),
  scopes: IMPORT,
  writes: true,
  lint: false,
  requires: 'importer',
  async run({ slides }, ctx) {
    const importer = ctx.services.importer!;
    const started = Date.now();
    const reports: Record<string, unknown>[] = [];
    let left = 0;
    for (const [index, request] of slides.entries()) {
      if (Date.now() - started > CAPTURE_BUDGET_MS) {
        left = slides.length - index;
        break;
      }
      const { name, notes, replaces, ...where } = request;
      try {
        const replaced = replaces ? ctx.deck.slides.findIndex((s) => s.id === replaces) : -1;
        if (replaces && replaced < 0) {
          throw new Error(`No slide ${replaces} in the deck to replace. Nothing was captured.`);
        }
        const captured = await importer.capture(ctx.deck, where);
        // A slide captured again keeps the name and the notes the first capture was given.
        const old = replaced >= 0 ? ctx.deck.slides[replaced] : undefined;
        const slide: Slide = {
          ...captured.slide,
          ...(name ? { name } : old?.name ? { name: old.name } : {}),
          ...(notes
            ? { notes: markdownToRichText(notes, { deckDir: ctx.deck.meta.dir }) }
            : old?.notes
              ? { notes: old.notes }
              : {}),
        };
        const imported = { ...captured, slide };
        const placeholder = untouchedOnlySlide(ctx.deck);
        const commands: Command[] = [
          ...imported.assets
            .filter((asset) => !ctx.deck.assets[asset.id])
            .map((asset): Command => ({ type: 'asset.add', asset })),
          old ? { type: 'slide.add', slide, index: replaced } : { type: 'slide.add', slide },
        ];
        if (old) commands.push({ type: 'slide.remove', slideIds: [old.id] });
        else if (placeholder) commands.push({ type: 'slide.remove', slideIds: [placeholder.id] });
        ctx.write(commands);
        importer.captured?.(imported);
        reports.push(slideReport(ctx.deck, imported));
      } catch (error) {
        reports.push({
          failed: where.selector ?? where.js ?? `slide ${index + 1} of the call`,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 600),
        });
      }
    }
    return {
      data: {
        // Not "slides": the registry adds the ids of the slides a write touched under that name.
        captured: reports,
        ...(left > 0
          ? {
              notCaptured: `The last ${left} of this call were not started (time): call again for them.`,
            }
          : {}),
        slidesInDeck: ctx.deck.slides.length,
      },
    };
  },
});
