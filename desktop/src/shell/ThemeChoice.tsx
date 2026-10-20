import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun, type LucideIcon } from '@slidr/ui/icons';
import { cx, Icon } from '@slidr/ui';
import { setTheme, useShell, type ThemePreference } from './store';

/*
 * The theme in the settings (DSN-02): three tiles, each with a small picture of the app in its
 * colours. The pictures are drawn with the app's own tokens under `data-theme`, so they are the
 * real colours of each theme, whichever the app is in now.
 */

const options: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'settings.themeSystem', icon: Monitor },
  { value: 'light', label: 'settings.themeLight', icon: Sun },
  { value: 'dark', label: 'settings.themeDark', icon: Moon },
];

/** The app in miniature: the title bar, the Activity Bar, a panel, and a slide on the Stage. */
function Window({ scheme, className }: { scheme: 'light' | 'dark'; className?: string }) {
  return (
    <span
      data-theme={scheme}
      className={cx(
        'flex flex-col overflow-hidden rounded-small border border-ui-line-strong bg-ui-canvas shadow-raised',
        className,
      )}
    >
      <span className="editor-header h-2 shrink-0" />
      <span className="flex min-h-0 flex-1">
        <span className="w-1.5 shrink-0 border-e border-ui-line bg-ui-chrome" />
        <span className="flex w-1/4 shrink-0 flex-col gap-0.5 border-e border-ui-line bg-ui-panel p-1">
          <span className="h-0.5 w-full rounded-full bg-ui-accent" />
          <span className="h-0.5 w-3/4 rounded-full bg-ui-line-strong" />
          <span className="h-0.5 w-full rounded-full bg-ui-line-strong" />
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-center p-1.5">
          <span className="flex aspect-video w-full flex-col justify-center gap-0.5 rounded-inset bg-ui-panel px-1.5 shadow-raised">
            <span className="h-0.5 w-1/2 rounded-full bg-ui-accent" />
            <span className="h-0.5 w-3/4 rounded-full bg-ui-line-strong" />
          </span>
        </span>
      </span>
    </span>
  );
}

const whole = 'absolute inset-0 rounded-none border-0 shadow-none';

function Picture({ value }: { value: ThemePreference }) {
  if (value !== 'system') return <Window scheme={value} className={whole} />;
  // As the system says: one window, light at the start and dark at the end, cut on the diagonal.
  return (
    <>
      <Window scheme="light" className={whole} />
      <Window scheme="dark" className={cx(whole, 'theme-split')} />
    </>
  );
}

export function ThemeChoice() {
  const { t, i18n } = useTranslation();
  const theme = useShell((s) => s.theme);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);

  // One stop of Tab for the group; the arrows move the choice, in the direction of the UI.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = i18n.dir() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const previous = i18n.dir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const step =
      event.key === next || event.key === 'ArrowDown'
        ? 1
        : event.key === previous || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const to = (index + step + options.length) % options.length;
    setTheme(options[to]!.value);
    tiles.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('settings.theme')}
      className="grid grid-cols-3 gap-2"
      data-testid="theme-choice"
    >
      {options.map((option, index) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            ref={(node) => {
              tiles.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-theme-choice={option.value}
            onClick={() => setTheme(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              'group flex min-w-0 cursor-default flex-col gap-1.5 rounded-panel p-1 text-start transition-colors',
              active ? 'text-ui-accent-fg' : 'text-ui-fg-muted hover:text-ui-fg',
            )}
          >
            <span
              className={cx(
                'relative block h-16 overflow-hidden rounded-control bg-ui-field outline-offset-1 transition-[outline-color,border-color]',
                active
                  ? 'border border-ui-accent outline-2 outline-ui-accent'
                  : 'border border-ui-line-strong group-hover:border-ui-fg-subtle',
              )}
            >
              <Picture value={option.value} />
            </span>
            <span className="flex min-w-0 items-center justify-center gap-1 text-xs font-medium">
              <Icon icon={option.icon} />
              <span className="truncate">{t(option.label)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
