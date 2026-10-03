import { DeckApiError, type TemplateService, type TemplateSummary } from '@slidr/agent-tools';
import { applyTemplate, type Template } from '@slidr/templates';

/** Where the templates come from. */
export interface TemplateLibrary {
  /** The templates the app ships with (WG7-T04). */
  builtIn: readonly Template[];
  /** The templates the user saved (WG7-T09). Read on every call, so a new one shows at once. */
  personal?: () => readonly Template[];
}

const notBuilt = (what: string, task: string) =>
  Promise.reject(new DeckApiError('unavailable', `${what} is not built yet (${task}).`));

/**
 * The Deck API's template service over the template engine: `deck_get_theme` lists the library
 * and `template_apply` switches the deck. A template is known by the id of its theme. Drafting
 * and saving templates (`template_create`, `template_save`) are WG7-T11a and T09; until then
 * they answer `unavailable`.
 */
export function createTemplateService(library: TemplateLibrary): TemplateService {
  const entries = () => [
    ...library.builtIn.map((template) => ({ template, personal: false })),
    ...(library.personal?.() ?? []).map((template) => ({ template, personal: true })),
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
    applyCommands: (deck, templateId) =>
      Promise.resolve().then(() => {
        const found = entries().find(({ template }) => template.theme.id === templateId);
        if (!found) {
          throw new DeckApiError(
            'not_found',
            `Template "${templateId}" does not exist; deck_get_theme lists the templates.`,
          );
        }
        return applyTemplate(deck, found.template);
      }),
    create: () => notBuilt('Drafting a template', 'WG7-T11a'),
    save: () => notBuilt('Saving a template', 'WG7-T09'),
  };
}
