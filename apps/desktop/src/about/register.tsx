import { registerMessages } from '../i18n';
import { registerSettingsSection } from '../settings';
import { AboutSettings } from './AboutSettings';
import { en, he } from './messages';

/*
 * What the app says about itself, in the settings screen (WG13-T05, WG10-T11): its version, the
 * licences of what it is built from, and the agent's diagnostics log.
 * See docs/adr/ADR-066-packaging-and-hardening.md.
 */

registerMessages('about', { he, en });

registerSettingsSection({
  id: 'about',
  title: 'about:title',
  // After everything a user sets: this part is for reading.
  order: 90,
  render: AboutSettings,
});
