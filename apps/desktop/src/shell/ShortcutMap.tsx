import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Dialog, DialogContent, Input, Kbd, ScrollArea } from '@slidr/ui';
import { Search } from '@slidr/ui/icons';
import { shortcutSections, useShortcuts } from './registry';
import { mapRows, type MapRow } from './shortcutList';
import { useShell } from './store';

/*
 * The shortcut map (UI-06, SPEC Appendix A): every key the app answers to, by subject, with a
 * search. It reads the registered shortcuts, so a key that an area adds or changes shows here
 * without an edit; what a component handles itself is listed in `shortcutList.ts`.
 */

/** Words that stand where a key would: `{wheel}` is the mouse wheel, not a key called "wheel". */
const WORD = /\{(\w+)\}/g;

/** A combination as it is drawn: the words in the language of the UI, the keys as they are. */
function drawn(keys: string, t: TFunction): string {
  return keys.replace(WORD, (_, word: string) => t(`keys.words.${word}`));
}

function matches(row: MapRow, label: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return (
    label.toLocaleLowerCase().includes(q) ||
    row.keys.some((keys) => keys.toLocaleLowerCase().replaceAll('+', ' ').includes(q)) ||
    row.keys.some((keys) => keys.toLocaleLowerCase().includes(q))
  );
}

export function ShortcutMap() {
  const { t } = useTranslation();
  const open = useShell((s) => s.shortcutsOpen);
  const registered = useShortcuts();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => mapRows(registered), [registered]);
  const found = rows.filter((row) => matches(row, t(row.label), query));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        useShell.setState({ shortcutsOpen: next });
        if (!next) setQuery('');
      }}
    >
      {open && (
        <DialogContent
          title={t('keys.title')}
          closeLabel={t('keys.close')}
          data-testid="shortcut-map"
        >
          <Input
            icon={Search}
            type="search"
            autoFocus
            value={query}
            placeholder={t('keys.search')}
            aria-label={t('keys.search')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ScrollArea className="-mx-2 h-96" viewportClassName="px-2">
            {found.length === 0 ? (
              <p role="status" className="py-8 text-center text-ui-fg-muted">
                {t('keys.none')}
              </p>
            ) : (
              <dl className="flex flex-col">
                {shortcutSections.map((section) => {
                  const inSection = found.filter((row) => row.section === section);
                  if (inSection.length === 0) return null;
                  return (
                    <Fragment key={section}>
                      <h3
                        data-shortcut-section={section}
                        className="pt-4 pb-1 text-xs font-medium text-ui-fg-muted first:pt-0"
                      >
                        {t(`keys.sections.${section}`)}
                      </h3>
                      {inSection.map((row) => (
                        <div
                          key={row.id}
                          data-shortcut={row.id}
                          className="flex min-h-control items-center justify-between gap-4 py-1"
                        >
                          <dt className="min-w-0">{t(row.label)}</dt>
                          <dd className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                            {row.keys.map((keys) => (
                              <Kbd key={keys} keys={drawn(keys, t)} />
                            ))}
                          </dd>
                        </div>
                      ))}
                    </Fragment>
                  );
                })}
              </dl>
            )}
          </ScrollArea>
        </DialogContent>
      )}
    </Dialog>
  );
}
