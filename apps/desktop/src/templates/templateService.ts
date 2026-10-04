import {
  DeckApiError,
  type CaptureService,
  type ConversionService,
  type DraftFinding,
  type LintService,
  type PngImage,
  type TemplateService,
  type TemplateSummary,
} from '@slidr/agent-tools';
import {
  createBaseTheme,
  createDeck,
  ulid,
  type AssetMeta,
  type Deck,
  type PlaceholderRole,
} from '@slidr/model';
import {
  draftTemplate,
  sampleDeckOf,
  themeFrom,
  type DrawnBox,
  type DrawnLayout,
  type Template,
} from '@slidr/templates';
import { switchCommands } from './actions';
import type { TemplateDraft, TemplateDrafts } from './drafts';
import { describeRoles } from './layoutService';

/** What drafting a template needs from the app (WG7-T11a). */
export interface Drafting {
  drafts: TemplateDrafts;
  /** Turns a layout written as HTML into a slide, as it does for a slide of a deck. */
  conversion: ConversionService;
  lint?: LintService;
  capture?: CaptureService;
  /**
   * The boxes the parts with a role were drawn in, in the order of the HTML: the conversion
   * measures a text by its words, and a placeholder needs the room its designer left for them.
   * Absent where the app cannot lay the HTML out; then a placeholder is as tall as its sample.
   */
  measure?: (html: string, deck: Deck) => Promise<DrawnBox[]>;
  /** The words a text placeholder shows when its layout carries no sample: a role, in a language. */
  sampleText?: (role: PlaceholderRole, lang: string) => string | undefined;
  /** Keeps a draft as a personal template under a name; returns the id it has in the library. */
  save: (draft: TemplateDraft, request: { name: string; setDefault: boolean }) => Promise<string>;
}

/** Where the templates come from, and what the app does around them. */
export interface TemplateSource {
  /** The templates the app ships with (WG7-T04). */
  builtIn: readonly Template[];
  /** The templates the user saved (WG7-T09). Read on every call, so a new one shows at once. */
  personal?: () => readonly Template[];
  /** A template as the deck takes it, e.g. with its layouts named in the deck's language. */
  forDeck?: (template: Template, deck: Deck) => Template;
  /**
   * Stores the asset files of a template with the open deck. Called before the commands that
   * name the assets are handed out, so the deck never points at a file it does not have.
   */
  supply?: (template: Template, deck: Deck) => Promise<void>;
  /** Saves the deck's own theme and layouts as a personal template; returns its id. */
  saveDeck?: (deck: Deck, request: { name: string; setDefault: boolean }) => Promise<string>;
  /** Present where the app can draft: it needs the HTML conversion. */
  drafting?: Drafting;
}

const notBuilt = (what: string, why: string) =>
  Promise.reject(new DeckApiError('unavailable', `${what} is not available here: ${why}.`));

/** How wide the sheet of a draft's layouts is, and how many layouts sit in a row of it. */
const SHEET = { columns: 4, width: 1600 };

/** The rule about how much text a slide holds says nothing of a layout: its sample is an example. */
const OF_THE_SAMPLE = new Set(['L13']);

/**
 * The Deck API's template service over the template engine: `deck_get_theme` lists the library,
 * `template_apply` switches the deck, `template_create` drafts a template from layouts written
 * as HTML, and `template_save` keeps a draft, or the deck's own theme and layouts, as a personal
 * template. A template is known by the id of its theme.
 */
export function createTemplateService(source: TemplateSource): TemplateService {
  const entries = () => [
    ...source.builtIn.map((template) => ({ template, personal: false })),
    ...(source.personal?.() ?? []).map((template) => ({ template, personal: true })),
  ];
  const find = (id: string) => entries().find(({ template }) => template.theme.id === id)?.template;

  return {
    list: () =>
      Promise.resolve(
        entries().map(({ template, personal }): TemplateSummary => ({
          id: template.theme.id,
          name: template.theme.name,
          ...(template.description ? { description: template.description } : {}),
          personal,
        })),
      ),
    applyCommands: async (deck, templateId) => {
      const found = find(templateId);
      if (!found) {
        throw new DeckApiError(
          'not_found',
          `Template "${templateId}" does not exist; deck_get_theme lists the templates.`,
        );
      }
      const template = source.forDeck?.(found, deck) ?? found;
      await source.supply?.(template, deck);
      return switchCommands(deck, template);
    },

    create: async (deck, { name, theme: tokens, layouts, basedOn }) => {
      const { drafting } = source;
      if (!drafting) return notBuilt('Drafting a template', 'it needs the HTML conversion');
      const { drafts, conversion, lint, capture, sampleText, measure } = drafting;

      const earlier = basedOn ? drafts.get(basedOn) : undefined;
      const base = earlier?.template ?? (basedOn ? find(basedOn) : undefined);
      if (basedOn && !base) {
        throw new DeckApiError(
          'not_found',
          `"${basedOn}" is neither a draft of this conversation nor a template of the library; deck_get_theme lists the templates.`,
        );
      }
      const id = `draft_${ulid().toLowerCase()}`;
      let theme;
      try {
        theme = themeFrom(base?.theme ?? createBaseTheme(), tokens, { id, name });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        throw new DeckApiError('invalid_input', `The theme tokens are not valid: ${why}`);
      }

      // Each layout is converted as a slide of a deck that has the draft's theme, so what was
      // written with theme variables comes out linked to the draft's tokens and text styles.
      const { dir, lang } = deck.meta;
      const assets: Record<string, AssetMeta> = { ...deck.assets, ...base?.assets };
      const drawn: DrawnLayout[] = [];
      const editability = new Map<string, number>();
      const notes: string[] = [];
      for (const layout of layouts) {
        const scratch = { ...createDeck({ lang, dir, theme }), assets: { ...assets } };
        const result = await conversion.htmlToSlide(scratch, {
          html: layout.html,
          name: layout.name,
        });
        for (const asset of result.assets) assets[asset.id] = asset;
        // A measurement that fails costs the placeholders their height, not the draft.
        const boxes = await measure?.(layout.html, scratch).catch(() => undefined);
        drawn.push({
          name: layout.name,
          archetype: layout.archetype as DrawnLayout['archetype'],
          slide: result.slide,
          ...(boxes ? { boxes } : {}),
        });
        editability.set(layout.name, result.editability);
        notes.push(...result.notes.map((note) => `Layout "${layout.name}": ${note}`));
      }

      const draft = draftTemplate({
        id,
        name,
        theme,
        dir,
        layouts: drawn,
        assets,
        ...(base ? { base } : {}),
      });
      notes.push(...draft.notes);
      // A layout the draft keeps from an earlier draft keeps the sample it was drawn with.
      const fills = { ...earlier?.fills, ...draft.fills };
      const sampled = (direction: typeof dir, language: string) =>
        sampleDeckOf(draft.template, fills, {
          dir: direction,
          lang: language,
          assets,
          ...(sampleText ? { fallback: (role) => sampleText(role, language) } : {}),
        });
      const sample = sampled(dir, lang);
      const mirrored = dir === 'rtl' ? sampled('ltr', 'en') : sampled('rtl', 'he');
      // A template is accepted when no layout of it has a lint error in Hebrew or in English
      // (WG7), whatever a deck writes into it. So the layouts are tried with their own sample,
      // as drawn and mirrored, and with the app's short words for each role in both languages:
      // text of another length lands elsewhere in its box, perhaps over what the layout drew.
      const other = (direction: typeof dir, language: string) =>
        sampleDeckOf(
          draft.template,
          {},
          {
            dir: direction,
            lang: language,
            assets,
            fallback: (role) => sampleText?.(role, language),
          },
        );
      const tries: { deck: Deck; text: DraftFinding['text'] }[] = [
        { deck: sample, text: 'sample' },
        { deck: mirrored, text: 'sample' },
        ...(sampleText
          ? [
              { deck: other('rtl', 'he'), text: 'other' as const },
              { deck: other('ltr', 'en'), text: 'other' as const },
            ]
          : []),
      ];

      const findings: DraftFinding[] = [];
      for (const { deck: tried, text } of lint ? tries : []) {
        const nameOf = new Map(tried.slides.map((slide) => [slide.id, slide.name ?? slide.id]));
        try {
          // The rules a deck's own writes are held to: the rules of the user's design check
          // (near-alignment, balance) would cost the agent tokens on every draft.
          const found = await lint!.lint(tried, [...nameOf.keys()], 'agent');
          for (const { slideId, rule, severity, message } of found) {
            if (OF_THE_SAMPLE.has(rule)) continue;
            const layout = nameOf.get(slideId) ?? slideId;
            const { dir: direction } = tried.meta;
            // What the sample already showed of a layout in a direction is said once.
            const said = findings.some(
              (f) =>
                f.text !== text && f.layout === layout && f.dir === direction && f.rule === rule,
            );
            if (!said) findings.push({ layout, dir: direction, text, rule, severity, message });
          }
        } catch (error) {
          notes.push(`The design lint could not run on the draft: ${String(error)}`);
          break;
        }
      }

      let preview: PngImage | undefined;
      try {
        preview = await capture?.renderContactSheet(
          sample,
          sample.slides.map((slide) => slide.id),
          SHEET,
        );
      } catch {
        // A draft without a picture is still a draft: the user sees it drawn in the app.
        notes.push('The app could not capture a sheet of the layouts; the user sees them drawn.');
      }

      const summary = draft.template.layouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        archetype: layout.archetype,
        placeholders: describeRoles(layout),
        ...(editability.has(layout.name) ? { editability: editability.get(layout.name)! } : {}),
      }));
      drafts.put({
        id,
        template: draft.template,
        fills,
        sample,
        layouts: summary,
        findings,
        notes,
      });
      return { templateId: id, layouts: summary, findings, notes, ...(preview ? { preview } : {}) };
    },

    save: async (deck, { templateId, name, setDefault }) => {
      if (templateId === undefined) {
        if (!source.saveDeck) return notBuilt('Saving a template', 'the app has no library');
        return { templateId: await source.saveDeck(deck, { name, setDefault }) };
      }
      const draft = source.drafting?.drafts.get(templateId);
      if (!draft || !source.drafting) {
        throw new DeckApiError(
          'not_found',
          `"${templateId}" is not a draft of this conversation; template_create makes one, and a template that is already in the library needs no saving.`,
        );
      }
      if (draft.savedAs) return { templateId: draft.savedAs };
      return { templateId: await source.drafting.save(draft, { name, setDefault }) };
    },
  };
}
