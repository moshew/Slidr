import { registerMessages } from '../i18n';
import { registerSettingsSection, SettingsOrder } from '../settings';
import { ImageSettings } from './ImageSettings';
import { en, he } from './messages';

/*
 * The image providers in the app's own screens (WG12): the choice of provider and its key in
 * the settings. The providers themselves are in `src-tauri/src/image_providers/`.
 * See docs/adr/ADR-025-image-providers.md and ADR-051-media-and-settings.md.
 */

registerMessages('images', { he, en });

registerSettingsSection({
  id: 'images',
  title: 'images:settings.title',
  order: SettingsOrder.images,
  render: ImageSettings,
});
