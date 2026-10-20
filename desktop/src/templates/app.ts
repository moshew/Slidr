/**
 * The template library of this window, and the pieces of the app that are built on it: the
 * template service the agent's tools call, and the start of a new deck.
 */
import type {
  CaptureService,
  ConversionService,
  LintService,
  TemplateService,
} from '@slidr/agent-tools';
import { layoutAssets, layoutsFor } from '@slidr/templates';
import { isTauri } from '@tauri-apps/api/core';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { copyAssets, saveDraft, templateFromDeck } from './actions';
import { TemplateDrafts } from './drafts';
import { TemplateLibrary, type PrefsStorage } from './library';
import { measureRoles } from './measureRoles';
import { memoryTemplateStore, tauriTemplateStore } from './store';
import { createTemplateService } from './templateService';

function preferences(): PrefsStorage | undefined {
  try {
    return localStorage;
  } catch {
    // Without storage the default template lasts until the app closes.
    return undefined;
  }
}

/** The library of this window. Personal templates are read once, when the app starts. */
export const library = new TemplateLibrary(isTauri() ? tauriTemplateStore : memoryTemplateStore(), {
  storage: preferences(),
  layoutName: (archetype, lang) => i18n.t(`templates:archetype.${archetype}`, { lng: lang }),
});

/** The templates the agent drafted in this window and nobody saved yet (THM-06). */
export const drafts = new TemplateDrafts();

/** What the app has for drafting a template: the services the agent's other tools use too. */
export interface DraftingTools {
  conversion: ConversionService;
  lint?: LintService;
  capture?: CaptureService;
}

/**
 * The Deck API's template service for an editor: the library, with its files and its saving,
 * and, when the app can convert HTML, the drafting of new templates.
 */
export function appTemplateService(editor: Editor, tools?: DraftingTools): TemplateService {
  return createTemplateService({
    get builtIn() {
      return library
        .entries()
        .filter((entry) => !entry.personal)
        .map((entry) => entry.template);
    },
    personal: () => library.state.getState().personal,
    forDeck: (template, deck) => library.forDeck(template.theme.id, deck.meta.lang) ?? template,
    supply: async (template, deck) => {
      const assets = layoutAssets(template, layoutsFor(template, deck.meta.dir));
      await copyAssets(editor, library, template, assets);
    },
    saveDeck: async (deck, { name, setDefault }) => {
      const { template, files } = await templateFromDeck(editor, library, deck, name);
      await library.save(template, files);
      if (setDefault) library.setDefault(template.theme.id);
      return template.theme.id;
    },
    ...(tools
      ? {
          drafting: {
            ...tools,
            drafts,
            measure: (html, deck) => measureRoles(html, deck, (asset) => editor.assets.url(asset)),
            sampleText: (role, lang) => {
              const key = `templates:sample.${role}`;
              return i18n.exists(key) ? i18n.t(key, { lng: lang }) : undefined;
            },
            save: (draft, request) => saveDraft(editor, library, drafts, draft.id, request),
          },
        }
      : {}),
  });
}
