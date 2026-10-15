import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  cx,
  Icon,
  SegmentedControl,
  Skeleton,
  Tabs,
  TabsContent,
  TabsTile,
  TabsTileList,
} from '@slidr/ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import {
  loadSettings,
  SETTINGS_PAGES,
  settingsPages,
  useSettings,
  useSettingsSections,
  type SettingsPageId,
  type SettingsSection,
  type SettingsTone,
} from '../settings';
import { setSettingsPage, useShell } from './store';
import { ThemeChoice } from './ThemeChoice';

/**
 * Settings (SPEC 4.2 ⚙, WG3-T08), a tab for each topic rather than one long column. General,
 * the theme and the UI language, is the shell's own. Everything else is a section that an area
 * registers on a topic (`registerSettingsSection`): the agent, the image providers and the photo
 * libraries, the fonts, the version and the diagnostics. Those sections read the settings file
 * and the state of the keys, which are loaded when this screen first opens.
 */
export function SettingsPanel() {
  const { t } = useTranslation();
  const sections = useSettingsSections();
  const chosen = useShell((s) => s.settingsPage);
  const loaded = useSettings((s) => s.loaded);
  const [failed, setFailed] = useState(false);

  const load = () => {
    loadSettings().catch(() => setFailed(true));
  };
  useEffect(load, []);
  const retry = () => {
    setFailed(false);
    load();
  };

  // A topic nothing is registered on has no tab.
  const pages = SETTINGS_PAGES.filter(
    (id) => id === 'general' || sections.some((section) => section.page === id),
  );
  const page = pages.includes(chosen) ? chosen : 'general';

  return (
    <Tabs
      value={page}
      onValueChange={(value) => setSettingsPage(value as SettingsPageId)}
      className="flex flex-col"
      data-testid="settings"
    >
      {/* The tabs stay in view while a tab's content scrolls under them. */}
      <TabsTileList
        aria-label={t('settings:topics')}
        className="sticky top-0 z-10 border-b border-ui-line bg-ui-panel px-2 pb-2"
      >
        {pages.map((id) => (
          <TabsTile
            key={id}
            value={id}
            icon={settingsPages[id].icon}
            label={t(`settings:pages.${id}.tab`)}
            data-settings-tab={id}
          />
        ))}
      </TabsTileList>
      {pages.map((id) => (
        <TabsContent
          key={id}
          value={id}
          className="flex flex-col gap-6 px-4 pt-4 pb-8"
          data-settings-page={id}
        >
          <PageHeader id={id} />
          {id === 'general' && <General />}
          {sections
            .filter((section) => section.page === id)
            .map((section) => (
              <Section key={section.id} section={section}>
                {loaded ? (
                  <section.render />
                ) : failed ? (
                  <div role="alert" className="flex flex-col items-start gap-2">
                    <p className="text-sm text-ui-danger-fg">{t('settings:loadFailed')}</p>
                    <Button size="sm" onClick={retry}>
                      {t('settings:retry')}
                    </Button>
                  </div>
                ) : (
                  <Skeleton className="h-24 w-full rounded-panel" />
                )}
              </Section>
            ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

const tones: Record<SettingsTone, string> = {
  blue: 'bg-ui-tool-blue text-ui-tool-blue-fg',
  violet: 'bg-ui-tool-violet text-ui-tool-violet-fg',
  pink: 'bg-ui-tool-pink text-ui-tool-pink-fg',
  orange: 'bg-ui-tool-orange text-ui-tool-orange-fg',
  teal: 'bg-ui-tool-teal text-ui-tool-teal-fg',
};

/** The top of a tab: its topic's mark, its name and what is set on it. */
function PageHeader({ id }: { id: SettingsPageId }) {
  const { t } = useTranslation();
  const { icon, tone } = settingsPages[id];
  return (
    <div className="flex items-start gap-3">
      <span
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-panel',
          tones[tone],
        )}
      >
        <Icon icon={icon} size="md" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-md font-semibold text-ui-fg">{t(`settings:pages.${id}.title`)}</h3>
        <p className="text-xs text-ui-fg-muted">{t(`settings:pages.${id}.description`)}</p>
      </div>
    </div>
  );
}

/** A registered section: under its heading when it has one, which a tab of its own does not. */
function Section({ section, children }: { section: SettingsSection; children: ReactNode }) {
  const { t } = useTranslation();
  const title = section.title ? t(section.title) : undefined;
  return (
    <section className="flex flex-col gap-3" data-settings-section={section.id} aria-label={title}>
      {title && <h3 className="text-sm font-semibold text-ui-fg">{title}</h3>}
      {children}
    </section>
  );
}

/** The shell's own tab: the theme and the language of the UI. */
function General() {
  const { t } = useTranslation();
  // `useTranslation` re-renders this tab when the language changes.
  const language = currentLanguage();
  return (
    <>
      <section className="flex flex-col gap-2" data-settings-section="appearance">
        <h4 className="px-1 text-xs font-semibold text-ui-fg-muted">{t('settings.theme')}</h4>
        <ThemeChoice />
      </section>
      {/* Choices that show themselves, as the theme's tiles do, need no card around them. */}
      <section className="flex flex-col gap-2" data-settings-section="language">
        <h4 className="px-1 text-xs font-semibold text-ui-fg-muted">{t('settings.language')}</h4>
        <SegmentedControl<Language>
          aria-label={t('settings.language')}
          fill
          value={language}
          onValueChange={(next) => void setLanguage(next)}
          // Each language is named in itself, so it can be found from either UI.
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'English' },
          ]}
        />
        <p className="px-1 text-xs text-ui-fg-muted">{t('settings.languageHint')}</p>
      </section>
    </>
  );
}
