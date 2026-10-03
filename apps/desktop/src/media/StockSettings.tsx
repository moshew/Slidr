import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Skeleton } from '@slidr/ui';
import { KeyField, updateSection, useSection, useSettings } from '../settings';
import { useEditor } from '../shell/editor';
import { stockOf } from './appStock';
import type { StockSource } from './stock';

/** The choice "whichever has a key": no source is named in the settings. */
const AUTO = 'auto';

/**
 * The photo libraries in the settings screen (GEN-08): the key of each library that needs one,
 * and which library a search uses when both have a key. The choice is the `stock` section's
 * `source`; without it a search goes to the first library whose key is stored.
 */
export function StockSettings() {
  const { t } = useTranslation('media');
  const { client } = stockOf(useEditor());
  const revision = useSettings((state) => state.revision);
  const chosen = useSection('stock').source;
  const [sources, setSources] = useState<StockSource[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    client
      .sources()
      .then((list) => current && setSources(list))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [client, revision]);

  if (!sources) {
    return failed ? (
      <p role="alert" className="text-sm text-ui-danger-fg">
        {t('settings.listFailed')}
      </p>
    ) : (
      <Skeleton className="h-24 w-full" />
    );
  }

  const keyed = sources.filter((source) => source.key);
  const ready = sources.filter((source) => source.state === 'ready');

  return (
    <div className="flex flex-col gap-3" data-testid="stock-sources">
      <p className="text-xs text-ui-fg-muted">{t('settings.hint')}</p>
      {keyed.map((source) => source.key && <KeyField key={source.id} name={source.key} />)}
      {ready.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ui-fg-muted">{t('settings.source')}</span>
          <Select
            aria-label={t('settings.source')}
            value={
              typeof chosen === 'string' && ready.some((source) => source.id === chosen)
                ? chosen
                : AUTO
            }
            onValueChange={(next) =>
              void updateSection('stock', { source: next === AUTO ? undefined : next })
            }
            options={[
              { value: AUTO, label: t('settings.auto') },
              ...ready.map((source) => ({ value: source.id, label: source.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
