import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from '@slidr/ui/icons';
import { Button, SegmentedControl, Skeleton } from '@slidr/ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import { loadSettings, useSettings, useSettingsSections } from '../settings';
import { setTheme, useShell, type ThemePreference } from './store';

/**
 * Settings (SPEC 4.2 ⚙, WG3-T08). The theme and the UI language are the shell's own. Everything
 * else is a section that an area registers (`registerSettingsSection`): the image providers, the
 * photo libraries, and the agent when its area adds it. Those sections read the settings file
 * and the state of the keys, which are loaded when this screen first opens.
 */
export function SettingsPanel() {
  const { t } = useTranslation();
  const theme = useShell((s) => s.theme);
  // `useTranslation` re-renders this panel when the language changes.
  const language = currentLanguage();
  const sections = useSettingsSections();
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

  return (
    <div className="flex flex-col gap-6 px-4 pt-1 pb-6" data-testid="settings">
      <Section title={t('settings.appearance')}>
        <SegmentedControl<ThemePreference>
          aria-label={t('settings.theme')}
          fill
          value={theme}
          onValueChange={setTheme}
          options={[
            { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
            { value: 'light', label: t('settings.themeLight'), icon: Sun },
            { value: 'dark', label: t('settings.themeDark'), icon: Moon },
          ]}
        />
      </Section>
      <Section title={t('settings.language')} hint={t('settings.languageHint')}>
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
      </Section>
      {sections.map(({ id, title, render: Content }) => (
        <Section key={id} title={t(title)} id={id}>
          {loaded ? (
            <Content />
          ) : failed ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-ui-danger-fg">{t('settings:loadFailed')}</p>
              <Button size="sm" onClick={retry}>
                {t('settings:retry')}
              </Button>
            </div>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </Section>
      ))}
    </div>
  );
}

function Section({
  title,
  hint,
  id,
  children,
}: {
  title: string;
  hint?: string;
  /** The id of a registered section, for tests and for a link from elsewhere in the app. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-settings-section={id}>
      <h3 className="text-xs font-medium text-ui-fg-muted">{title}</h3>
      {children}
      {hint && <p className="text-xs text-ui-fg-muted">{hint}</p>}
    </section>
  );
}
