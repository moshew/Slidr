// The app's settings and keys (WG3-T08, SEC-04). An area reads and writes its own section here,
// and adds its part of the settings screen with `registerSettingsSection`.
// See docs/adr/ADR-051-media-and-settings.md.
export {
  agentSettings,
  setAgentSettings,
  setConversationSettings,
  useAgentSettings,
  useConversationSettings,
  type ConversationSettings,
  type StoredAgentSettings,
} from './agentSettings';
export { InstallDialog } from './InstallDialog';
export { KeyField } from './KeyField';
export {
  SettingsCard,
  SettingsGroup,
  SettingsItem,
  SettingsRow,
  StatusPill,
  type StatusTone,
} from './layout';
export {
  registerSettingsSection,
  SETTINGS_PAGES,
  SettingsOrder,
  settingsPages,
  useSettingsSections,
  type SettingsPageId,
  type SettingsSection,
  type SettingsTone,
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
  replaceSection,
  saveSecret,
  sectionOf,
  settingsClient,
  updateSection,
  useSection,
  useSettings,
} from './store';
