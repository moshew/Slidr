import { Images } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { registerSettingsSection, SettingsOrder } from '../settings';
import { registerAction, registerContextTool, registerPanel } from '../shell';
import { IconColorTool } from './IconColorTool';
import { MediaPanel } from './MediaPanel';
import { en, he } from './messages';
import { StockSettings } from './StockSettings';
import { MEDIA_PANEL, openMedia } from './store';

/*
 * The media area (WG5-T11, T13, WG12-T04 to T07): the media panel (the deck's pictures, stock
 * photos, icons, AI images), the stock photos' part of the settings, and the icon library.
 * See docs/adr/ADR-051-media-and-settings.md.
 */

registerMessages('media', { he, en });

// Replaces the shell's placeholder of the same id.
registerPanel({
  id: MEDIA_PANEL,
  kind: 'tool',
  slot: 'tools',
  order: 0,
  title: 'panels.media',
  icon: Images,
  content: MediaPanel,
});

registerSettingsSection({
  id: 'stock',
  title: 'media:settings.title',
  order: SettingsOrder.stock,
  render: StockSettings,
});

/* Row A: the icon button opens the library. */
registerAction('insert.icon', () => openMedia('icons'));

/* Row B: the colour of a selected icon, before the effects every SVG has. */
registerContextTool({
  id: 'media.iconColor',
  kinds: ['shape'],
  group: 'objects',
  order: 5,
  render: IconColorTool,
});
