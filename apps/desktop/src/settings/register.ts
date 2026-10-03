import { registerMessages } from '../i18n';
import { en, he } from './messages';

/*
 * The settings area (WG3-T08): the settings file, the keys in the credential store of the
 * operating system, and the sections other areas add to the settings screen. The screen itself
 * is the shell's (`shell/SettingsPanel.tsx`). See docs/adr/ADR-051-media-and-settings.md.
 */

registerMessages('settings', { he, en });
