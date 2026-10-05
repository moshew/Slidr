import { i18n, registerMessages } from '../i18n';
import { registerSettingsSection, SettingsOrder } from '../settings';
import { whenEditor } from '../shell';
import { watchUserFonts } from './embed';
import { FontsSection } from './FontsSection';
import { en, he } from './messages';
import { loadUserFonts } from './userFonts';

/*
 * The fonts area's part of the app (SPEC 4.2, 5.7): the fonts' section of the settings screen,
 * the user's own fonts, read as the app starts so a deck that names one is drawn in it, and the
 * watch that stores a font of the user's with a deck that uses it.
 */

registerMessages('fonts', { he, en });

registerSettingsSection({
  id: 'fonts',
  title: 'fonts:title',
  order: SettingsOrder.fonts,
  render: FontsSection,
});

void loadUserFonts();

whenEditor((editor) =>
  watchUserFonts({
    bus: editor.bus,
    assets: editor.assets,
    label: (family) => i18n.t('fonts:undo.embed', { family }),
  }),
);
