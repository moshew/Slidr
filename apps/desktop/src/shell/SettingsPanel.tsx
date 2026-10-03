import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from '@slidr/ui/icons';
import { SegmentedControl } from '@slidr/ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import { setTheme, useShell, type ThemePreference } from './store';

/** Settings (SPEC 4.2 ⚙): for now the theme and the UI language. WG3-T08 adds the rest. */
export function SettingsPanel() {
  const { t } = useTranslation();
  const theme = useShell((s) => s.theme);
  // `useTranslation` re-renders this panel when the language changes.
  const language = currentLanguage();

  return (
    <div className="flex flex-col gap-6 px-4 pt-1 pb-6">
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
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-ui-fg-muted">{title}</h3>
      {children}
      {hint && <p className="text-xs text-ui-fg-muted">{hint}</p>}
    </section>
  );
}
