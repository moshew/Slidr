/**
 * Tools that need a service another work group builds (see ../services.ts). Each is registered
 * only when its service is provided; the tool itself is thin: it calls the service and writes
 * the commands, so the scope guard and the turn's transaction apply as for any other write.
 */
import {
  Archetype,
  commandDefs,
  createElement,
  PlaceholderRole,
  rotatedBounds,
  unionBounds,
  type AssetMeta,
  type Command,
  type Deck,
  type Element,
} from '@slidr/model';
import { z } from 'zod';
import { getElement, getSlide, slideNumber } from '../lookup';
import type { PngImage, StoredImage } from '../services';
import { DeckApiError, defineTool, type ToolContext } from '../tool';
import { afterSlide, indexAfter } from './shared';

const Id = z.string().min(1);
const ALL = ['deck', 'slide', 'object'] as const;

const HTML_HELP =
  'Write the slide as HTML/CSS for a 1920x1080 root, with any layout (flex, grid, absolute). Use theme variables (var(--color-primary), var(--font-heading)) so template changes follow. <img data-asset="<id>"> places an asset, <img data-image-prompt="..."> a placeholder to generate later; <i data-icon="lucide:rocket"> an icon; <div data-chart=\'{...}\'> an editable chart; data-name and data-role name elements; data-anim gives an entrance by preset name; data-keep-html keeps a subtree as HTML; data-archetype on the root states the kind of slide.';

const registerAssets = (assets: readonly AssetMeta[]): Command[] =>
  assets.map((asset) => ({ type: 'asset.add', asset }));

/** A render of the slide for the result, when the capture service runs. */
async function renderIfPossible(ctx: ToolContext, slideId: string): Promise<PngImage[]> {
  const capture = ctx.services.capture;
  if (!capture) return [];
  try {
    return [await capture.renderSlide(ctx.deck, slideId, { width: 1280 })];
  } catch {
    // The slide is made; a failed render must not turn that into an error. slide_render retries.
    return [];
  }
}

export const slideRender = defineTool({
  name: 'slide_render',
  description:
    'A PNG of a slide exactly as the user sees it on the stage. Look at every slide you create or change before you finish (the quality gate checks this). Returns the image, and the slide id and number.',
  input: z.strictObject({
    slideId: Id,
    width: z
      .number()
      .int()
      .min(320)
      .max(1920)
      .optional()
      .describe('Image width in pixels. Default 1280.'),
  }),
  scopes: ALL,
  writes: false,
  requires: 'capture',
  async run({ slideId, width }, ctx) {
    getSlide(ctx.deck, slideId);
    const image = await ctx.services.capture!.renderSlide(ctx.deck, slideId, {
      width: width ?? 1280,
    });
    return { data: { slideId, number: slideNumber(ctx.deck, slideId) }, images: [image] };
  },
});

export const deckRenderContactSheet = defineTool({
  name: 'deck_render_contact_sheet',
  description:
    'One PNG with thumbnails of the slides in a grid, each labelled with its number: for checking consistency, variety and flow across the deck. Returns the image and the slide ids shown, in order.',
  input: z.strictObject({
    slideIds: z.array(Id).optional().describe('Default: every slide.'),
    columns: z.number().int().min(1).max(8).optional().describe('Default 4.'),
  }),
  scopes: ['deck'],
  writes: false,
  requires: 'capture',
  async run({ slideIds, columns }, ctx) {
    const ids = slideIds ?? ctx.deck.slides.map((s) => s.id);
    for (const id of ids) getSlide(ctx.deck, id);
    const image = await ctx.services.capture!.renderContactSheet(ctx.deck, ids, {
      columns: columns ?? 4,
      width: 1600,
    });
    return { data: { slideIds: ids }, images: [image] };
  },
});

const RoleContent = z.union([
  z.string().describe('Markdown, as for text_set.'),
  z.strictObject({ assetId: Id }),
  z.strictObject({ imagePrompt: z.string().min(1) }),
]);

export const slideCreate = defineTool({
  name: 'slide_create',
  description:
    'A new slide from a layout of the deck (deck_get_theme lists them), with content placed by placeholder role. Returns `slideId` and the ids created.',
  input: z.strictObject({
    layoutId: Id,
    content: z
      .partialRecord(PlaceholderRole, RoleContent)
      .describe(
        'By role: Markdown text, {"assetId"} for an image, or {"imagePrompt"} for a placeholder to generate.',
      ),
    name: z.string().min(1).optional(),
    afterSlideId: afterSlide('at the end'),
  }),
  scopes: ['deck'],
  writes: true,
  requires: 'layouts',
  async run({ layoutId, content, name, afterSlideId }, ctx) {
    if (!ctx.deck.layouts.some((l) => l.id === layoutId)) {
      throw new DeckApiError(
        'not_found',
        `Layout "${layoutId}" does not exist; deck_get_theme lists the layouts.`,
      );
    }
    const slide = await ctx.services.layouts!.createSlide(ctx.deck, {
      layoutId,
      content,
      ...(name ? { name } : {}),
    });
    const index = indexAfter(ctx.deck, afterSlideId, ctx.deck.slides.length);
    ctx.write([{ type: 'slide.add', slide, index }]);
    return { data: { slideId: slide.id } };
  },
});

export const slideCreateFromHtml = defineTool({
  name: 'slide_create_from_html',
  description: `The main way to make a new slide: write it as HTML/CSS and the app converts it into editable elements, looking exactly as written. ${HTML_HELP} Returns \`slideId\`, the ids created, \`editability\` (share of the content that became regular elements), notes from the conversion, lint findings, and a render of the slide.`,
  input: z.strictObject({
    html: z.string().min(1).describe('The whole slide; <style> is allowed inside.'),
    name: z.string().min(1).optional(),
    afterSlideId: afterSlide('at the end'),
  }),
  scopes: ['deck'],
  writes: true,
  requires: 'conversion',
  async run({ html, name, afterSlideId }, ctx) {
    const index = indexAfter(ctx.deck, afterSlideId, ctx.deck.slides.length);
    const result = await ctx.services.conversion!.htmlToSlide(ctx.deck, {
      html,
      ...(name ? { name } : {}),
    });
    ctx.write([
      ...registerAssets(result.assets),
      { type: 'slide.add', slide: result.slide, index },
    ]);
    return {
      data: { slideId: result.slide.id, editability: result.editability, notes: result.notes },
      images: await renderIfPossible(ctx, result.slide.id),
    };
  },
});

export const slideReplaceFromHtml = defineTool({
  name: 'slide_replace_from_html',
  description: `Replaces everything on an existing slide (elements, background, slide CSS, animation) with a new design written as HTML/CSS; the slide keeps its id, name, notes and place. For small edits use element_update instead, which keeps ids and the user's manual changes. ${HTML_HELP} Returns the ids created and removed, \`editability\`, notes, lint findings, and a render.`,
  input: z.strictObject({ slideId: Id, html: z.string().min(1) }),
  scopes: ['deck', 'slide'],
  writes: true,
  requires: 'conversion',
  async run({ slideId, html }, ctx) {
    getSlide(ctx.deck, slideId);
    const result = await ctx.services.conversion!.htmlToSlide(ctx.deck, { html });
    // The deck may have changed while the conversion ran.
    const current = getSlide(ctx.deck, slideId);
    const { slide } = result;
    const commands: Command[] = registerAssets(result.assets);
    if (current.elements.length > 0) {
      commands.push({
        type: 'element.remove',
        slideId,
        elementIds: current.elements.map((e) => e.id),
      });
    }
    for (const element of slide.elements) commands.push({ type: 'element.add', slideId, element });
    commands.push(
      {
        type: 'slide.update',
        slideId,
        patch: { background: slide.background ?? null, css: slide.css ?? null, layoutId: null },
      },
      { type: 'slide.setTimeline', slideId, timeline: slide.timeline },
    );
    ctx.write(commands);
    return {
      data: { slideId, editability: result.editability, notes: result.notes },
      images: await renderIfPossible(ctx, slideId),
    };
  },
});

/**
 * The replacements as one element under the id of the element they replace: the element
 * itself when there is one, a group around them when there are several. An object session
 * converts this way, so that what it works on stays one element with the id it knows
 * (ADR-017); the scope guard lets an element be replaced in place under its own id.
 */
function asOneElement(elements: readonly Element[], original: Element): Element {
  const [only] = elements;
  if (!only) {
    throw new DeckApiError(
      'invalid_state',
      `Element "${original.id}" has nothing visible to convert.`,
    );
  }
  if (elements.length === 1) return { ...only, id: original.id };
  const frame = unionBounds(elements.map((e) => rotatedBounds(e.frame, e.rotation)));
  return createElement.group({
    id: original.id,
    frame,
    ...(original.name ? { name: original.name } : {}),
    children: elements.map((e) => ({
      ...e,
      frame: { ...e.frame, x: e.frame.x - frame.x, y: e.frame.y - frame.y },
    })),
  });
}

export const elementConvert = defineTool({
  name: 'element_convert',
  description:
    'Converts an `html` element into regular elements (to: "elements"), or a regular element into one `html` element (to: "html"), in the same place. Animation steps of the converted element are dropped. In an object session the result stays one element with the same id: a group when the HTML became several elements. Returns `elementIds` of the replacements, `editability` and notes.',
  input: z.strictObject({
    elementId: Id,
    slideId: Id.optional(),
    to: z.enum(['elements', 'html']),
  }),
  scopes: ALL,
  writes: true,
  requires: 'conversion',
  async run({ elementId, slideId, to }, ctx) {
    const { slide } = getElement(ctx.deck, elementId, slideId);
    const result = await ctx.services.conversion!.convertElement(ctx.deck, {
      slideId: slide.id,
      elementId,
      to,
    });
    // The deck may have changed while the conversion ran.
    const { element, parent, index } = getElement(ctx.deck, elementId, slide.id);
    const elements =
      ctx.turn.scope.kind === 'object' ? [asOneElement(result.elements, element)] : result.elements;
    ctx.write([
      ...registerAssets(result.assets),
      { type: 'element.remove', slideId: slide.id, elementIds: [elementId] },
      ...elements.map((replacement, i): Command => ({
        type: 'element.add',
        slideId: slide.id,
        element: replacement,
        index: index + i,
        ...(parent ? { parentId: parent.id } : {}),
      })),
    ]);
    return {
      data: {
        elementIds: elements.map((e) => e.id),
        editability: result.editability,
        notes: result.notes,
      },
    };
  },
});

export const slideLint = defineTool({
  name: 'slide_lint',
  description:
    'Runs every design-lint rule on one slide. Returns `findings`: rule, severity (error, warning, info), element ids and a message.',
  input: z.strictObject({ slideId: Id }),
  scopes: ALL,
  writes: false,
  requires: 'lint',
  async run({ slideId }, ctx) {
    getSlide(ctx.deck, slideId);
    return { data: { findings: await ctx.services.lint!.lint(ctx.deck, [slideId], 'all') } };
  },
});

export const deckLint = defineTool({
  name: 'deck_lint',
  description:
    'Runs every design-lint rule on every slide, including rules across slides. Returns `findings`: rule, severity, slide id, element ids and a message.',
  input: z.strictObject({}),
  scopes: ALL,
  writes: false,
  requires: 'lint',
  async run(_input, ctx) {
    const ids = ctx.deck.slides.map((s) => s.id);
    return { data: { findings: await ctx.services.lint!.lint(ctx.deck, ids, 'all') } };
  },
});

export const templateApply = defineTool({
  name: 'template_apply',
  description:
    'Switches the deck to another template (deck_get_theme lists them): theme, layouts, and every slide mapped to the new layouts by archetype and role, as one step. Returns the ids changed.',
  input: z.strictObject({ templateId: Id }),
  scopes: ['deck'],
  writes: true,
  requires: 'templates',
  async run({ templateId }, ctx) {
    ctx.write(await ctx.services.templates!.applyCommands(ctx.deck, templateId));
    return {};
  },
});

const ThemeTokens = commandDefs['theme.update'].schema.shape.patch;

export const templateCreate = defineTool({
  name: 'template_create',
  description:
    'Drafts a new template: theme tokens plus layouts written as HTML, with data-role on each placeholder (title, subtitle, body, image, ...). Nothing is saved or applied; show the preview to the user, then template_save. Returns `templateId`, notes, and a preview image.',
  input: z.strictObject({
    name: z.string().min(1),
    theme: ThemeTokens.describe('Theme tokens over the base theme, as in theme_update.'),
    layouts: z
      .array(
        z.strictObject({ name: z.string().min(1), archetype: Archetype, html: z.string().min(1) }),
      )
      .min(1),
  }),
  scopes: ['deck'],
  writes: false,
  requires: 'templates',
  async run({ name, theme, layouts }, ctx) {
    const draft = await ctx.services.templates!.create(ctx.deck, { name, theme, layouts });
    return { data: { templateId: draft.templateId, notes: draft.notes }, images: [draft.preview] };
  },
});

export const templateSave = defineTool({
  name: 'template_save',
  description:
    "Saves a drafted template (or, without templateId, the deck's own theme and layouts) as a personal template, optionally the default for new decks. Returns `templateId`.",
  input: z.strictObject({
    templateId: Id.optional(),
    name: z.string().min(1),
    setDefault: z.boolean().optional().describe('Make it the template of every new deck.'),
  }),
  scopes: ['deck'],
  writes: false,
  requires: 'templates',
  async run({ templateId, name, setDefault }, ctx) {
    const saved = await ctx.services.templates!.save(ctx.deck, {
      ...(templateId ? { templateId } : {}),
      name,
      setDefault: setDefault ?? false,
    });
    return { data: { templateId: saved.templateId } };
  },
});

/** The asset of an image element, or the given asset; one of the two is required. */
function sourceAsset(deck: Deck, input: { elementId?: string; assetId?: string }) {
  if (input.elementId) {
    const { slide, element } = getElement(deck, input.elementId);
    if (element.type !== 'image') {
      throw new DeckApiError(
        'invalid_state',
        `Element "${input.elementId}" is a ${element.type}, not an image.`,
      );
    }
    return { slideId: slide.id, elementId: element.id, assetId: element.assetId };
  }
  if (!input.assetId) throw new DeckApiError('invalid_input', 'Give elementId or assetId.');
  if (!deck.assets[input.assetId]) {
    throw new DeckApiError('not_found', `Asset "${input.assetId}" is not in the deck.`);
  }
  return { assetId: input.assetId };
}

/** Registers the images, and puts the first into the element when there is one. */
function placeImages(
  ctx: ToolContext,
  images: readonly StoredImage[],
  target: { slideId?: string; elementId?: string },
) {
  const first = images[0];
  if (!first) throw new DeckApiError('failed', 'The image service returned no image.');
  ctx.write([
    ...registerAssets(images.map((i) => i.asset)),
    ...(target.slideId && target.elementId
      ? [
          {
            type: 'element.update' as const,
            slideId: target.slideId,
            elementId: target.elementId,
            patch: { assetId: first.asset.id, prompt: null },
          },
        ]
      : []),
  ]);
  return {
    data: {
      assets: images.map(({ asset }) => ({
        assetId: asset.id,
        ...(asset.width ? { width: asset.width, height: asset.height } : {}),
        ...(asset.attribution ? { attribution: asset.attribution } : {}),
      })),
    },
    images: images.map((i) => i.preview),
  };
}

export const imageGenerate = defineTool({
  name: 'image_generate',
  description:
    "Generates images from a prompt and adds them to the deck's assets. Include the deck's image style and palette in the prompt. With elementId (an image element, e.g. a placeholder), the first image goes into it, keeping its frame and crop. Returns `assets` (ids, sizes) and previews.",
  input: z.strictObject({
    prompt: z.string().min(1),
    count: z.number().int().min(1).max(4).optional().describe('Default 1.'),
    aspect: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']).optional().describe('Default 16:9.'),
    elementId: Id.optional(),
  }),
  scopes: ALL,
  writes: true,
  requires: 'images',
  async run({ prompt, count, aspect, elementId }, ctx) {
    const target = elementId ? sourceAsset(ctx.deck, { elementId }) : {};
    const images = await ctx.services.images!.generate({
      prompt,
      count: count ?? 1,
      aspect: aspect ?? '16:9',
    });
    return placeImages(ctx, images, target);
  },
});

export const imageEdit = defineTool({
  name: 'image_edit',
  description:
    'Edits an image by instruction (optionally inside a mask), as new assets; the original stays. With elementId, the first result replaces the image in the element, keeping frame and crop. Returns `assets` and previews.',
  input: z.strictObject({
    elementId: Id.optional().describe('An image element. Give this or assetId.'),
    assetId: Id.optional(),
    instruction: z.string().min(1),
    maskAssetId: Id.optional(),
    count: z.number().int().min(1).max(4).optional().describe('Default 1.'),
  }),
  scopes: ALL,
  writes: true,
  requires: 'images',
  async run({ elementId, assetId, instruction, maskAssetId, count }, ctx) {
    const source = sourceAsset(ctx.deck, { elementId, assetId });
    if (!source.assetId)
      throw new DeckApiError('invalid_state', 'The image element has no image yet.');
    const images = await ctx.services.images!.edit({
      assetId: source.assetId,
      instruction,
      ...(maskAssetId ? { maskAssetId } : {}),
      count: count ?? 1,
    });
    return placeImages(ctx, images, source);
  },
});

export const imageProcess = defineTool({
  name: 'image_process',
  description:
    'Processes an image locally, as a new asset: removeBackground. With elementId, the result replaces the image in the element. (Crop and colour adjustments are element fields: use element_update.) Returns `assets` and a preview.',
  input: z.strictObject({
    elementId: Id.optional().describe('An image element. Give this or assetId.'),
    assetId: Id.optional(),
    operation: z.enum(['removeBackground']),
  }),
  scopes: ALL,
  writes: true,
  requires: 'images',
  async run({ elementId, assetId, operation }, ctx) {
    const source = sourceAsset(ctx.deck, { elementId, assetId });
    if (!source.assetId)
      throw new DeckApiError('invalid_state', 'The image element has no image yet.');
    const image = await ctx.services.images!.process({ assetId: source.assetId, operation });
    return placeImages(ctx, [image], source);
  },
});

export const stockSearch = defineTool({
  name: 'stock_search',
  description:
    "Searches stock photos and adds the best matches to the deck's assets (not to a slide), with attribution. Place one with element_add or element_update (assetId); unused ones are dropped on save. Returns `assets` and previews.",
  input: z.strictObject({
    query: z.string().min(1),
    count: z.number().int().min(1).max(8).optional().describe('Default 4.'),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  }),
  scopes: ALL,
  writes: true,
  requires: 'stock',
  async run({ query, count, orientation }, ctx) {
    const images = await ctx.services.stock!.search({
      query,
      count: count ?? 4,
      ...(orientation ? { orientation } : {}),
    });
    if (images.length === 0) return { data: { assets: [] } };
    return placeImages(ctx, images, {});
  },
});

export const iconSearch = defineTool({
  name: 'icon_search',
  description:
    'Searches the icon library (Hebrew or English). Returns `icons`: id (as in data-icon="lucide:rocket"), name and SVG markup, ready for an svg element or for HTML.',
  input: z.strictObject({
    query: z.string().min(1),
    count: z.number().int().min(1).max(24).optional().describe('Default 8.'),
  }),
  scopes: ALL,
  writes: false,
  requires: 'icons',
  async run({ query, count }, ctx) {
    return { data: { icons: await ctx.services.icons!.search({ query, count: count ?? 8 }) } };
  },
});

export const uiPresentOptions = defineTool({
  name: 'ui_present_options',
  description:
    "Shows the user 2 to 8 variations as cards (text in Markdown, an image asset, or a slide layout in HTML). Hovering previews a card and clicking applies it: the app applies the user's pick, so do not apply it yourself. Returns how many cards were shown.",
  input: z.strictObject({
    kind: z.enum(['text', 'image', 'layout']),
    prompt: z.string().optional().describe('A line above the cards.'),
    elementId: Id.optional().describe(
      "The element the options are for. Default: the session's element.",
    ),
    options: z
      .array(
        z.strictObject({
          label: z.string().min(1),
          text: z.string().optional(),
          assetId: Id.optional(),
          html: z.string().optional(),
        }),
      )
      .min(2)
      .max(8),
  }),
  scopes: ['slide', 'object'],
  writes: false,
  requires: 'options',
  async run({ kind, prompt, elementId, options }, ctx) {
    const { scope } = ctx.turn;
    if (scope.kind !== 'slide' && scope.kind !== 'object') {
      throw new DeckApiError(
        'out_of_scope',
        'ui_present_options works in slide and object sessions.',
      );
    }
    const target = elementId ?? (scope.kind === 'object' ? scope.elementIds[0] : undefined);
    if (target) getElement(ctx.deck, target, scope.slideId);
    await ctx.services.options!.present({
      kind,
      target: { slideId: scope.slideId, ...(target ? { elementId: target } : {}) },
      ...(prompt ? { prompt } : {}),
      options,
    });
    return { data: { shown: options.length } };
  },
});
