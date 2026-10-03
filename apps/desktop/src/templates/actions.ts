/**
 * What the templates area does to the open deck (WG7-T09 and the wiring of T04): starting a
 * new deck on the default template, switching the deck to a template, turning its direction,
 * setting its logo, and saving its theme and layouts as a personal template. Each change of the
 * deck is one batch of commands from the catalogue, so each is one undo step.
 */
import {
  createDeck,
  createElement,
  createSlide,
  SLIDE_WIDTH,
  slideFromLayout,
  ulid,
  type AssetMeta,
  type Command,
  type Deck,
  type Direction,
  type Element,
  type Layout,
} from '@slidr/model';
import {
  applyTemplate,
  changeDirection,
  deckFromTemplate,
  layoutAssets,
  layoutsFor,
  mirrorLayout,
  type Template,
} from '@slidr/templates';
import type { Editor } from '../shell';
import type { TemplateDrafts } from './drafts';
import type { TemplateLibrary } from './library';
import type { TemplateFile } from './store';

/** The widest a logo is drawn, as a multiple of its height: a long wordmark stays in its place. */
const LOGO_MAX_ASPECT = 8;

/** What a new deck starts as: on the default template when there is one, else plain. */
export function startDeck(library: TemplateLibrary, lang: string): Deck {
  const template = library.defaultTemplate(lang);
  if (!template) return createDeck({ lang, slides: [createSlide()] });
  const deck = deckFromTemplate(template, { lang });
  // The first layout of a template is its opening slide.
  const first = deck.layouts[0];
  deck.slides = [first ? slideFromLayout(deck, first.id).slide : createSlide()];
  return deck;
}

/**
 * Puts the asset files of the deck's template into the open document: a template names its
 * assets, and their files have to be stored with the deck (SPEC 5.7). Assets are addressed by
 * content, so storing a file again changes nothing. Returns the assets whose files were stored.
 */
export async function supplyAssets(editor: Editor, library: TemplateLibrary): Promise<AssetMeta[]> {
  const { deck } = editor.bus;
  const entry = library.find(deck.theme.id);
  if (!entry?.personal) return [];
  return copyAssets(editor, library, entry.template, Object.values(entry.template.assets ?? {}));
}

/** Stores asset files of a personal template with the open document. */
export async function copyAssets(
  editor: Editor,
  library: TemplateLibrary,
  template: Template,
  assets: readonly AssetMeta[],
): Promise<AssetMeta[]> {
  const stored: AssetMeta[] = [];
  for (const asset of assets) {
    const bytes = await library.assetBytes(template.theme.id, asset);
    if (!bytes) continue;
    const file = new File([bytes.slice()], asset.file, { type: asset.mime });
    await editor.assets.import(file, asset.origin);
    stored.push(asset);
  }
  return stored;
}

/** Switches the deck to a template of the library (THM-04). False when there is no such template. */
export async function applyLibraryTemplate(
  editor: Editor,
  library: TemplateLibrary,
  id: string,
  label?: string,
): Promise<boolean> {
  const template = library.forDeck(id, editor.bus.deck.meta.lang);
  if (!template) return false;
  // The files before the commands that name them, so the deck never points at a missing file.
  const layouts = layoutsFor(template, editor.bus.deck.meta.dir);
  await copyAssets(editor, library, template, layoutAssets(template, layouts));
  const commands = applyTemplate(editor.bus.deck, template);
  if (commands.length > 0) editor.bus.batch(commands, { label });
  return true;
}

/** Turns the deck to the other direction, layouts and slides with it (THM-02). */
export function turnDeck(
  editor: Editor,
  library: TemplateLibrary,
  dir: Direction,
  label?: string,
): void {
  const { deck } = editor.bus;
  const commands = changeDirection(deck, dir, library.forDeck(deck.theme.id, deck.meta.lang));
  if (commands.length > 0) editor.bus.batch(commands, { label });
}

/**
 * What has to follow when the deck's direction was changed by setting the field alone, which is
 * how the agent turns a deck (`deck.setMeta`): the layouts, which a deck holds for its own
 * direction only (ADR-023), and the slides that sit on them. A slide without a layout is left
 * as it is: the agent wrote it for the direction it meant. `from` is the direction the deck had;
 * the commands do not touch the field.
 */
export function followDirection(deck: Deck, from: Direction, library: TemplateLibrary): Command[] {
  if (deck.meta.dir === from) return [];
  const asItWas: Deck = { ...deck, meta: { ...deck.meta, dir: from } };
  const template = library.forDeck(deck.theme.id, deck.meta.lang);
  const onLayout = new Set(deck.slides.filter((slide) => slide.layoutId).map((slide) => slide.id));
  return changeDirection(asItWas, deck.meta.dir, template).filter(
    (command) =>
      command.type === 'layout.update' ||
      ((command.type === 'slide.update' || command.type === 'element.update') &&
        onLayout.has(command.slideId)),
  );
}

// ---------------------------------------------------------------------------------------------
// The logo

const isLogo = (element: Element) => element.role === 'logo';

/** The layouts of the deck that draw a logo: where a logo of the user can go. */
export function logoLayouts(deck: Deck): Layout[] {
  return deck.layouts.filter((layout) => layout.decorations.some(isLogo));
}

/** The asset of the deck's logo, when the layouts draw a picture and not the template's mark. */
export function logoAsset(deck: Deck): AssetMeta | undefined {
  for (const layout of deck.layouts) {
    for (const decoration of layout.decorations) {
      if (isLogo(decoration) && decoration.type === 'image' && decoration.assetId) {
        return deck.assets[decoration.assetId];
      }
    }
  }
  return undefined;
}

/** True when every logo of the deck's layouts is hidden. */
export function logoHidden(deck: Deck): boolean {
  const logos = deck.layouts.flatMap((layout) => layout.decorations.filter(isLogo));
  return logos.length > 0 && logos.every((logo) => logo.hidden);
}

/**
 * A picture in the place of a layout's logo: as tall as what was there and as wide as the
 * picture asks for. It keeps the edge that is nearer to the side of the slide, so a wide logo
 * grows towards the middle and never out of the slide.
 */
function logoPicture(old: Element, asset: AssetMeta): Element {
  const { x, y, w, h } = old.frame;
  const aspect = asset.width && asset.height ? asset.width / asset.height : w / h;
  const width = Math.round(h * Math.min(aspect, LOGO_MAX_ASPECT));
  return createElement.image({
    id: old.id,
    role: 'logo',
    name: old.name ?? 'logo',
    frame: { x: x + w / 2 < SLIDE_WIDTH / 2 ? x : x + w - width, y, w: width, h },
    assetId: asset.id,
    fit: 'contain',
  });
}

function onLogos(deck: Deck, change: (logo: Element) => Element): Command[] {
  return logoLayouts(deck).map((layout) => ({
    type: 'layout.update',
    layoutId: layout.id,
    patch: {
      decorations: layout.decorations.map((decoration) =>
        isLogo(decoration) ? change(decoration) : decoration,
      ),
    },
  }));
}

/** Puts a picture in the place of the logo on every layout of the deck that has one. */
export async function setLogo(editor: Editor, file: File, label?: string): Promise<void> {
  const asset = await editor.assets.import(file);
  const { deck } = editor.bus;
  const commands: Command[] = [
    ...(deck.assets[asset.id] ? [] : [{ type: 'asset.add', asset } as const]),
    ...onLogos(deck, (logo) => logoPicture(logo, asset)),
  ];
  editor.bus.batch(commands, { label });
}

/** Hides the logo on every layout, or shows it again. The place is kept, so a logo can return. */
export function showLogo(editor: Editor, shown: boolean, label?: string): void {
  const commands = onLogos(editor.bus.deck, (logo) => {
    const { hidden: _hidden, ...rest } = logo;
    return shown ? rest : { ...rest, hidden: true };
  });
  if (commands.length > 0) editor.bus.batch(commands, { label });
}

// ---------------------------------------------------------------------------------------------
// Saving the deck's look as a personal template

/**
 * The hand-drawn layouts of the other direction for a template made from a deck. What was
 * corrected by hand for a direction (a glow in a corner) is not something the deck itself
 * holds, so it comes from the template the deck is on; everything else is the deck's own
 * layout, mirrored, because the user may have changed it (a logo).
 */
function flipsFrom(source: Template | undefined, deck: Deck): Layout[] {
  if (!source?.flipped?.length) return [];
  const drawn = new Set(source.flipped.map((layout) => layout.id));
  const other: Direction = deck.meta.dir === 'rtl' ? 'ltr' : 'rtl';
  return layoutsFor(source, other).flatMap((theirs) => {
    const mine = deck.layouts.find((layout) => layout.id === theirs.id);
    if (!drawn.has(theirs.id) || !mine) return [];
    const { background: _mirrored, ...rest } = mirrorLayout(mine);
    return [theirs.background ? { ...rest, background: theirs.background } : rest];
  });
}

async function fileOf(editor: Editor, asset: AssetMeta): Promise<TemplateFile | undefined> {
  const url = editor.assets.url(asset);
  if (!url) return undefined;
  try {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return { name: asset.file, bytes };
  } catch (error) {
    console.error(`The file of the asset "${asset.id}" could not be read`, error);
    return undefined;
  }
}

/**
 * A deck's theme and layouts as a new personal template (THM-05), with the files of the assets
 * its layouts draw. Nothing is saved and the deck is not changed.
 */
export async function templateFromDeck(
  editor: Editor,
  library: TemplateLibrary,
  deck: Deck,
  name: string,
): Promise<{ template: Template; files: TemplateFile[] }> {
  const source = library.forDeck(deck.theme.id, deck.meta.lang);
  const flipped = flipsFrom(source, deck);
  const template: Template = {
    theme: { ...deck.theme, id: `personal_${ulid().toLowerCase()}`, name },
    dir: deck.meta.dir,
    layouts: deck.layouts,
    ...(flipped.length > 0 ? { flipped } : {}),
  };
  const drawn = JSON.stringify([template.layouts, flipped]);
  const assets = Object.values(deck.assets).filter((asset) => drawn.includes(asset.id));
  if (assets.length > 0) {
    template.assets = Object.fromEntries(assets.map((asset) => [asset.id, asset]));
  }
  const files = (await Promise.all(assets.map((asset) => fileOf(editor, asset)))).filter(
    (file): file is TemplateFile => file !== undefined,
  );
  return { template, files };
}

/**
 * Keeps a drafted template as a personal template of the library, under a name (THM-06). The
 * files of the assets its layouts draw are read from the open document, where the conversion of
 * its layouts stored them. The deck is not changed. Returns the id the template has in the
 * library; saving a draft that is already saved returns the id it got then.
 */
export async function saveDraft(
  editor: Editor,
  library: TemplateLibrary,
  drafts: TemplateDrafts,
  draftId: string,
  request: { name: string; setDefault?: boolean },
): Promise<string> {
  const draft = drafts.get(draftId);
  if (!draft) throw new Error(`"${draftId}" is not a draft.`);
  if (draft.savedAs) return draft.savedAs;
  const id = `personal_${ulid().toLowerCase()}`;
  const template: Template = {
    ...draft.template,
    theme: { ...draft.template.theme, id, name: request.name },
  };
  const assets = Object.values(template.assets ?? {});
  const files = (await Promise.all(assets.map((asset) => fileOf(editor, asset)))).filter(
    (file): file is TemplateFile => file !== undefined,
  );
  await library.save(template, files);
  if (request.setDefault) library.setDefault(id);
  drafts.markSaved(draftId, id);
  return id;
}

/**
 * Saves the open deck's theme and layouts as a personal template and puts the deck on it, so
 * the deck remembers which template it is on. Returns the template.
 */
export async function saveAsTemplate(
  editor: Editor,
  library: TemplateLibrary,
  name: string,
  options: { setDefault?: boolean; label?: string } = {},
): Promise<Template> {
  const { template, files } = await templateFromDeck(editor, library, editor.bus.deck, name);
  await library.save(template, files);
  if (options.setDefault) library.setDefault(template.theme.id);
  editor.bus.dispatch({ type: 'theme.replace', theme: template.theme }, { label: options.label });
  return template;
}
