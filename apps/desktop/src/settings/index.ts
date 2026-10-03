// The app's settings and keys (WG3-T08, SEC-04). An area reads and writes its own section here,
// and adds its part of the settings screen with `registerSettingsSection`.
// See docs/adr/ADR-051-media-and-settings.md.
export { KeyField } from './KeyField';
export {
  registerSettingsSection,
  SettingsOrder,
  useSettingsSections,
  type SettingsSection,
} from './sections';
export {
  SECRET_NAMES,
  SettingsError,
  type SecretName,
  type SecretStatus,
  type SettingsClient,
} from './settings';
export {
  loadSettings,
  pageSettings,
  refreshSettings,
  removeSecret,
  saveSecret,
  sectionOf,
  settingsClient,
  updateSection,
  useSection,
  useSettings,
} from './store';
