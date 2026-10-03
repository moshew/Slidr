import { Palette } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { registerPanel, setNewDeck, whenEditor } from '../shell';
import { startDeck, supplyAssets } from './actions';
import { library } from './app';
import { en, he } from './messages';
import { TemplatesPanel } from './TemplatesPanel';

/*
 * Templates in the app (WG7-T04, T09): the Templates panel of the Activity Bar, the default
 * template a new deck opens with, and the files of a template's assets. See
 * docs/adr/ADR-039-reference-decks-and-templates.md.
 */

registerMessages('templates', { he, en });

registerPanel({
  id: 'templates',
  kind: 'tool',
  slot: 'tools',
  // Before the media panel: the look of the deck comes first.
  order: -1,
  title: 'templates:panel.title',
  icon: Palette,
  content: TemplatesPanel,
});

// A new deck opens on the default template (THM-08).
setNewDeck((lang) => startDeck(library, lang));

whenEditor((editor) => {
  const supply = () =>
    void supplyAssets(editor, library).catch((error: unknown) => {
      console.error("The files of the template's assets could not be stored", error);
    });
  // Whenever a document starts on a personal template, its asset files go into the document.
  editor.bus.subscribe((event) => {
    if (event.kind === 'reset') supply();
  });
  void library
    .load()
    .then(supply)
    .catch((error: unknown) => {
      console.error('The personal templates could not be read', error);
    });
});
