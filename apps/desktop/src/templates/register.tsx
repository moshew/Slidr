import { Palette } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import {
  registerContextTool,
  registerPanel,
  registerStageLayer,
  setNewDeck,
  whenEditor,
} from '../shell';
import { startDeck, supplyAssets } from './actions';
import { drafts, library } from './app';
import { LayoutTool } from './LayoutTool';
import { en, he } from './messages';
import { preloadTemplateFonts } from './preload';
import { readSamplesAhead } from './previews';
import { TemplatesPanel } from './TemplatesPanel';
import { TemplateSlidesLayer } from './TemplateSlides';

/*
 * Templates in the app (WG7-T04, T09): the Templates panel of the Activity Bar, the default
 * template a new deck opens with, and the files of a template's assets. See
 * docs/adr/ADR-039-reference-decks-and-templates.md.
 */

registerMessages('templates', { he, en });

registerPanel({
  id: 'templates',
  slot: 'tools',
  // Above Elements and media: the look of the deck comes first.
  order: -2,
  title: 'templates:panel.title',
  icon: Palette,
  content: TemplatesPanel,
});

// The slides that show a template of the library, spread over the Stage.
registerStageLayer({ id: 'templates.slides', render: TemplateSlidesLayer });

// Row B with nothing selected: the layout of the slide on the Stage (SLD-02), in the place the
// shell kept for it beside the background.
registerContextTool({
  id: 'slide.layout',
  kinds: ['none'],
  group: 'slide',
  order: 1,
  render: LayoutTool,
});

// A new deck opens on the default template (THM-08).
setNewDeck((lang) => startDeck(library, lang));

/**
 * A new deck is drawn the moment it exists, and the files of its template's assets arrive a
 * moment later: a picture that was asked for before its file was there has failed, and a
 * browser does not ask again by itself.
 */
function reloadPictures(urls: readonly (string | undefined)[]): void {
  for (const img of Array.from(document.images)) {
    if (img.naturalWidth === 0 && urls.includes(img.src)) img.src = String(img.src);
  }
}

whenEditor((editor) => {
  const supply = () =>
    void supplyAssets(editor, library)
      .then((stored) => reloadPictures(stored.map((asset) => editor.assets.url(asset))))
      .catch((error: unknown) => {
        console.error("The files of the template's assets could not be stored", error);
      });
  // Whenever a document starts on a personal template, its asset files go into the document.
  editor.bus.subscribe((event) => {
    if (event.kind !== 'reset') return;
    supply();
    // A draft was drawn with the files of the document that was open.
    drafts.clear();
  });
  void library
    .load()
    .then(supply)
    .catch((error: unknown) => {
      console.error('The personal templates could not be read', error);
    })
    // The fonts of the covers, once the app is idle, before a panel that shows them is opened;
    // then the samples the slides of a built-in template are made from, before one is pressed.
    .then(() =>
      whenIdle(async () => {
        await preloadTemplateFonts(library.entries().map((e) => e.template));
        await readSamplesAhead();
      }),
    );
});

function whenIdle(run: () => Promise<void>): void {
  const go = () =>
    void run().catch((error: unknown) => {
      console.error('The templates could not be prepared ahead', error);
    });
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 });
  else window.setTimeout(go, 1000);
}
