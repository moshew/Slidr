/**
 * The template library of this window, and the pieces of the app that are built on it: the
 * template service the agent's tools call, and the start of a new deck.
 */
import type { TemplateService } from '@slidr/agent-tools';
import { layoutAssets, layoutsFor } from '@slidr/templates';
import { isTauri } from '@tauri-apps/api/core';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { copyAssets, templateFromDeck } from './actions';
import { TemplateLibrary, type PrefsStorage } from './library';
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

/** The Deck API's template service for an editor: the library, with its files and its saving. */
export function appTemplateService(editor: Editor): TemplateService {
  return createTemplateService({
    get builtIn() {
      return library
        .entries()
        .filter((entry) => !entry.personal)
        .map((entry) => entry.template);
    },
    personal: () => library.state.getState().personal,
    forDeck: (template, deck) => library.forDeck(template.theme.id, deck.meta.lang) ?? template,
    supply: (template, deck) =>
      copyAssets(
        editor,
        library,
        template,
        layoutAssets(template, layoutsFor(template, deck.meta.dir)),
      ),
    saveDeck: async (deck, { name, setDefault }) => {
      const { template, files } = await templateFromDeck(editor, library, deck, name);
      await library.save(template, files);
      if (setDefault) library.setDefault(template.theme.id);
      return template.theme.id;
    },
  });
}
