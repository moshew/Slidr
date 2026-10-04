import { registerMessages } from '../i18n';
import { AgentSection } from './AgentSection';
import { en, he } from './messages';
import { registerSettingsSection, SettingsOrder } from './sections';

/*
 * The settings area (WG3-T08): the settings file, the keys in the credential store of the
 * operating system, and the sections other areas add to the settings screen. The screen itself
 * is the shell's (`shell/SettingsPanel.tsx`). See docs/adr/ADR-051-media-and-settings.md.
 */

registerMessages('settings', { he, en });

// The agent's own section: before the image providers, as `SettingsOrder` places it.
registerSettingsSection({
  id: 'agent',
  title: 'settings:agent.title',
  order: SettingsOrder.agent,
  render: AgentSection,
});
