import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, SegmentedControl, Skeleton } from '@slidr/ui';
import { KeyField, refreshSettings, updateSection, useSection, useSettings } from '../settings';
import { useEditor } from '../shell/editor';
import { imagesOf } from './appImages';
import {
  chooseDefaultProvider,
  type ImageProviderDescriptor,
  type ImageProviderStatus,
} from './images';

/** The values of `images.quality` in the settings; the core falls back to `medium`. */
const QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
type Quality = (typeof QUALITIES)[number];

/** What a provider's state is called: the probe's answer, read with whether its key is stored. */
export type ProviderStateLabel =
  | 'checking'
  | 'ready'
  | 'not_installed'
  | 'not_logged_in'
  | 'needs_key'
  | 'key_rejected'
  | 'unavailable';

/**
 * A provider that needs a key says `not_logged_in` both when there is none and when the service
 * turned the key down; whether a key is stored tells the two apart.
 */
export function providerStateLabel(
  provider: ImageProviderDescriptor,
  status: ImageProviderStatus | undefined,
  keyStored: boolean,
): ProviderStateLabel {
  if (provider.key && !keyStored) return 'needs_key';
  if (!status) return 'checking';
  if (status.state === 'not_logged_in' && provider.key) return 'key_rejected';
  return status.state;
}

const stateTone: Record<ProviderStateLabel, string> = {
  checking: 'text-ui-fg-muted',
  ready: 'text-ui-success-fg',
  not_installed: 'text-ui-warning-fg',
  not_logged_in: 'text-ui-warning-fg',
  needs_key: 'text-ui-warning-fg',
  key_rejected: 'text-ui-danger-fg',
  unavailable: 'text-ui-danger-fg',
};

/**
 * The image providers in the settings screen (GEN-01, GEN-03): which one makes the images, the
 * key of one that needs a key, and the quality of one that takes it. The choice is what
 * `image_generate` uses when a job names no provider, the agent's jobs included.
 */
export function ImageSettings() {
  const { t } = useTranslation('images');
  const { client } = imagesOf(useEditor());
  const keys = useSettings((state) => state.keys);
  const revision = useSettings((state) => state.revision);
  const quality = useSection('images').quality;
  const [providers, setProviders] = useState<ImageProviderDescriptor[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ImageProviderStatus>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([client.providers(), client.defaultProvider()])
      .then(([list, id]) => {
        if (!current) return;
        setProviders(list);
        setChosen(id);
      })
      .catch(() => current && setError(t('settings.listFailed')));
    return () => {
      current = false;
    };
  }, [client, t]);

  // A provider is asked again whenever a key or a setting changes: a key that was just saved
  // may work, and one that was removed no longer does.
  useEffect(() => {
    if (!providers) return;
    let current = true;
    for (const provider of providers) {
      void client
        .probe(provider.id)
        .then((status) => current && setStatuses((all) => ({ ...all, [provider.id]: status })))
        .catch(() => undefined);
    }
    return () => {
      current = false;
    };
  }, [client, providers, revision]);

  const choose = async (id: string) => {
    if (id === chosen) return;
    const before = chosen;
    setChosen(id);
    setError(null);
    if (await chooseDefaultProvider(client, id, refreshSettings)) return;
    // Only a choice the core did not take is taken back, and not over one made since.
    setChosen((now) => (now === id ? before : now));
    setError(t('settings.chooseFailed'));
  };

  if (!providers) {
    return error ? (
      <p role="alert" className="text-sm text-ui-danger-fg">
        {error}
      </p>
    ) : (
      <Skeleton className="h-24 w-full" />
    );
  }

  const selected = providers.find((provider) => provider.id === chosen);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ui-fg-muted">{t('settings.hint')}</p>
      <div
        role="radiogroup"
        aria-label={t('settings.providers')}
        className="flex flex-col gap-2"
        data-testid="image-providers"
      >
        {providers.map((provider) => {
          const active = provider.id === chosen;
          const stored = provider.key ? keys[provider.key] : false;
          const status = statuses[provider.id];
          const label = providerStateLabel(provider, status, stored);
          return (
            <button
              key={provider.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-provider={provider.id}
              data-state={label}
              onClick={() => void choose(provider.id)}
              className={cx(
                'flex cursor-default flex-col gap-1 rounded-control border px-3 py-2.5 text-start transition-colors',
                active
                  ? 'border-ui-accent bg-ui-accent-soft'
                  : 'border-ui-line-strong hover:bg-ui-hover active:bg-ui-pressed',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cx(
                    'inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
                    active
                      ? 'border-ui-accent bg-ui-accent text-ui-on-accent'
                      : 'border-ui-line-strong',
                  )}
                >
                  {active && <span className="size-1.5 rounded-full bg-ui-on-accent" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-fg">
                  {provider.name}
                </span>
                <span className={cx('shrink-0 text-xs font-medium', stateTone[label])}>
                  {t(`state.${label}`)}
                </span>
              </span>
              <span className="ps-6 text-xs text-ui-fg-muted">
                {t(provider.key ? 'cost.key' : 'cost.signIn')}
                {' · '}
                {t(`edit.${provider.capabilities.edit}`)}
              </span>
              {label === 'ready' && status?.account && !provider.key && (
                <span className="ps-6 text-xs text-ui-fg-muted">
                  {t('account', { account: status.account })}
                </span>
              )}
              {label !== 'ready' &&
                label !== 'checking' &&
                label !== 'needs_key' &&
                status?.detail && (
                  // The provider's own guidance, in English: what to install, how to sign in.
                  <span className="ps-6 text-xs text-ui-fg-muted">
                    <bdi>{status.detail}</bdi>
                  </span>
                )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-ui-danger-fg">
          {error}
        </p>
      )}
      {selected?.key && <KeyField name={selected.key} />}
      {selected?.capabilities.quality && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ui-fg-muted">{t('settings.quality')}</span>
          <SegmentedControl<Quality>
            aria-label={t('settings.quality')}
            fill
            value={QUALITIES.find((value) => value === quality) ?? 'medium'}
            onValueChange={(next) => void updateSection('images', { quality: next })}
            options={QUALITIES.map((value) => ({ value, label: t(`quality.${value}`) }))}
          />
          <p className="text-xs text-ui-fg-muted">{t('settings.qualityHint')}</p>
        </div>
      )}
    </div>
  );
}
