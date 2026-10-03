import { DeckApiError, type TemplateService, type TemplateSummary } from '@slidr/agent-tools';
import type { Deck } from '@slidr/model';
import { applyTemplate, type Template } from '@slidr/templates';

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
}

const notBuilt = (what: string, task: string) =>
  Promise.reject(new DeckApiError('unavailable', `${what} is not built yet (${task}).`));

/**
 * The Deck API's template service over the template engine: `deck_get_theme` lists the library,
 * `template_apply` switches the deck, and `template_save` without a draft saves the deck's own
 * theme and layouts as a personal template. A template is known by the id of its theme.
 * Drafting a template (`template_create`) is WG7-T11a; until then it answers `unavailable`, and
 * so does saving a draft.
 */
export function createTemplateService(source: TemplateSource): TemplateService {
  const entries = () => [
    ...source.builtIn.map((template) => ({ template, personal: false })),
    ...(source.personal?.() ?? []).map((template) => ({ template, personal: true })),
  ];
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
      const found = entries().find(({ template }) => template.theme.id === templateId);
      if (!found) {
        throw new DeckApiError(
          'not_found',
          `Template "${templateId}" does not exist; deck_get_theme lists the templates.`,
        );
      }
      const template = source.forDeck?.(found.template, deck) ?? found.template;
      await source.supply?.(template, deck);
      return applyTemplate(deck, template);
    },
    create: () => notBuilt('Drafting a template', 'WG7-T11a'),
    save: async (deck, { templateId, name, setDefault }) => {
      if (templateId !== undefined) return notBuilt('Saving a drafted template', 'WG7-T11a');
      if (!source.saveDeck) return notBuilt('Saving a template', 'WG7-T09');
      return { templateId: await source.saveDeck(deck, { name, setDefault }) };
    },
  };
}
