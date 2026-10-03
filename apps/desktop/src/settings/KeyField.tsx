import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from '@slidr/ui/icons';
import { Button, Icon, Input } from '@slidr/ui';
import { SettingsError, type SecretName } from './settings';
import { removeSecret, saveSecret, useSettings } from './store';

/**
 * A key of the settings screen (SEC-04): a field to paste it into, and afterwards only the fact
 * that it is stored. The text lives in this component until it is saved, then it is dropped:
 * the app cannot show a stored key, so replacing one means pasting it again.
 */
export function KeyField({ name }: { name: SecretName }) {
  const { t } = useTranslation('settings');
  const stored = useSettings((state) => state.keys[name]);
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const messageId = `${id}-message`;
  const label = t(`keys.name.${name}`);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setValue('');
      setReplacing(false);
    } catch (failure) {
      const kind = failure instanceof SettingsError ? failure.kind : 'internal';
      // The reason is worded here: a message from the core is for logs, and names no key.
      setError(
        t(
          kind === 'invalid_input'
            ? 'keys.invalid'
            : kind === 'io'
              ? 'keys.unavailable'
              : 'keys.failed',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) void run(() => saveSecret(name, value));
  };

  if (stored && !replacing) {
    return (
      <div className="flex flex-col gap-1.5" data-testid={`key-${name}`} data-stored="true">
        <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
        <div className="flex items-center gap-2">
          <span className="flex h-control min-w-0 flex-1 items-center gap-2 rounded-control bg-ui-field px-2.5 text-sm text-ui-fg">
            <Icon icon={KeyRound} className="text-ui-success-fg" />
            <span className="truncate">{t('keys.stored')}</span>
          </span>
          <Button size="md" onClick={() => setReplacing(true)} disabled={busy}>
            {t('keys.replace')}
          </Button>
          <Button
            size="md"
            variant="ghost"
            loading={busy}
            onClick={() => void run(() => removeSecret(name))}
          >
            {t('keys.remove')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-ui-danger-fg">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      data-testid={`key-${name}`}
      data-stored="false"
      onSubmit={save}
    >
      <label htmlFor={id} className="text-xs font-medium text-ui-fg-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="password"
          icon={KeyRound}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('keys.placeholder')}
          // Not a password of this app's: no manager should offer to keep or to fill it.
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          invalid={Boolean(error)}
          aria-describedby={messageId}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()}>
          {t('keys.save')}
        </Button>
        {stored && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setReplacing(false);
              setValue('');
              setError(null);
            }}
          >
            {t('keys.cancel')}
          </Button>
        )}
      </div>
      <p
        id={messageId}
        role={error ? 'alert' : undefined}
        className={error ? 'text-xs text-ui-danger-fg' : 'text-xs text-ui-fg-muted'}
      >
        {error ?? t('keys.where')}
      </p>
    </form>
  );
}
