import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  Kbd,
  ScrollArea,
  Tooltip,
} from '@slidr/ui';
import { RotateCcw, Search } from '@slidr/ui/icons';
import { shortcutSections, useShortcuts, type ShortcutDefinition } from './registry';
import { mapRows, verdict, type Binding, type MapRow, type Verdict } from './shortcutList';
import { eventKeys } from './shortcuts';
import { useShell } from './store';
import { changeKeys, drawnKeys, resetKeys, useUserKeys } from './userKeys';

/*
 * The shortcut map (UI-06, SPEC Appendix A): every key the app answers to, by subject, with a
 * search. It reads the registered shortcuts, so a key that an area adds or changes shows here
 * without an edit; what a component handles itself is listed in `shortcutList.ts`.
 *
 * It is also where the user gives a shortcut another key (WG3-T07): a key that can change is a
 * button; pressed, it waits for the new combination. A combination another shortcut has is
 * shown with that shortcut's name before anything moves, and one that cannot be given says why.
 * The keys themselves are kept by `userKeys.ts`, in the settings file.
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

/** A key of a line that is being changed: the line, and the shortcut behind the key. */
interface Target {
  row: string;
  shortcut: string;
}

/** What the map is in the middle of. */
type Step =
  /** Waiting for the new combination; `refused` is the last one pressed, which cannot be given. */
  | (Target & { kind: 'listening'; refused?: { keys: string; verdict: Verdict } })
  /** The combination is another shortcut's: move it here, or leave things as they are. */
  | (Target & { kind: 'asking'; keys: string; by: readonly ShortcutDefinition[] })
  /** Every shortcut back on its own key: asked once more before it is done. */
  | { kind: 'resetting' }
  | null;

/** Keys that are held with another key, and are no combination alone. */
const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'OS']);

export function ShortcutMap() {
  const { t } = useTranslation();
  const open = useShell((s) => s.shortcutsOpen);
  const registered = useShortcuts();
  const user = useUserKeys();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<Step>(null);
  const [notSaved, setNotSaved] = useState(false);
  const rows = useMemo(() => mapRows(registered, user), [registered, user]);
  const found = rows.filter((row) => matches(row, t(row.label), query));
  const changed = new Set(
    rows.flatMap((row) =>
      row.bindings.flatMap((b) => (b.original && b.shortcut ? [b.shortcut] : [])),
    ),
  ).size;

  const save = (run: Promise<void>) => {
    setNotSaved(false);
    run.catch(() => setNotSaved(true));
  };

  /** Gives the shortcut the keys, taking them from whoever has them now. */
  const give = (target: Target, keys: string, from: readonly ShortcutDefinition[] = []) => {
    save(
      changeKeys({
        ...Object.fromEntries(from.map(({ id }) => [id, ''])),
        [target.shortcut]: keys,
      }),
    );
    setStep(null);
  };

  /** A combination the user pressed for the shortcut that is listening. */
  const propose = (target: Target, keys: string, restore = false) => {
    const shortcut = registered.find(({ id }) => id === target.shortcut);
    if (!shortcut) return setStep(null);
    const found = verdict(shortcut, keys, registered, user, { restore });
    if (found.kind === 'same') setStep(null);
    else if (found.kind === 'free') give(target, keys);
    else if (found.kind === 'taken') setStep({ ...target, kind: 'asking', keys, by: found.by });
    else setStep({ ...target, kind: 'listening', refused: { keys, verdict: found } });
  };

  // While a shortcut waits for its new key, every key press is the answer: nothing else in the
  // window may hear it, the dialog's own Esc and the shell's shortcuts included.
  const listening = step?.kind === 'listening' ? step : null;
  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') return setStep(null);
      // A modifier alone is the start of a combination; a key typed with AltGr is text.
      if (MODIFIERS.has(event.key) || event.metaKey || event.isComposing) return;
      if (event.getModifierState('AltGraph')) return;
      propose({ row: listening.row, shortcut: listening.shortcut }, eventKeys(event));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // `propose` reads the shortcuts and the user's keys of this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening?.row, listening?.shortcut, registered, user]);

  const actionOf = (label: string | undefined) => (label ? t(label) : '');
  const refusal = (keys: string, found: Verdict): string => {
    const shown = drawnKeys(keys);
    if (found.kind === 'fixed' && found.label) {
      return t('keys.fixedKey', { keys: shown, action: actionOf(found.label) });
    }
    if (found.kind === 'unusable' && found.why === 'typing') return t('keys.typingKey');
    return t('keys.unusableKey', { keys: shown });
  };

  const chip = (row: MapRow, binding: Binding) => {
    const label = t(row.label);
    if (!binding.shortcut || binding.fixed) {
      return (
        <Tooltip key={binding.keys} content={t(`keys.fixed.${binding.fixed ?? 'control'}`)}>
          {/* As far from the edge as the keys that are buttons, so the keys make one column. */}
          <span className="inline-flex px-2.5">
            <Kbd exact keys={drawn(binding.keys, t)} />
          </span>
        </Tooltip>
      );
    }
    const target: Target = { row: row.id, shortcut: binding.shortcut };
    const waiting =
      step?.kind === 'listening' && step.row === row.id && step.shortcut === binding.shortcut;
    return (
      <span key={binding.shortcut} className="inline-flex items-center gap-0.5">
        {/* Before the key, towards the name: the keys stay in their column. */}
        {binding.original && !waiting && (
          <IconButton
            icon={RotateCcw}
            size="sm"
            mirror
            label={t('keys.reset', { keys: binding.original })}
            data-reset={binding.shortcut}
            onClick={() => propose(target, binding.original ?? '', true)}
          />
        )}
        <Button
          variant={waiting ? 'soft' : 'ghost'}
          size="sm"
          data-binding={binding.shortcut}
          data-state={waiting ? 'listening' : binding.original ? 'changed' : 'default'}
          aria-label={
            binding.keys
              ? t('keys.change', { action: label, keys: binding.keys })
              : t('keys.assign', { action: label })
          }
          onClick={() => setStep(waiting ? null : { ...target, kind: 'listening' })}
          // A click elsewhere is not an answer: the shortcut stops waiting.
          onBlur={() => setStep((now) => (now?.kind === 'listening' && waiting ? null : now))}
        >
          {waiting ? (
            t('keys.press')
          ) : binding.keys ? (
            <Kbd exact keys={binding.keys} />
          ) : (
            <span className="font-normal text-ui-fg-muted">{t('keys.unbound')}</span>
          )}
        </Button>
      </span>
    );
  };

  /** What a line says under its keys while one of them is being changed. */
  const under = (row: MapRow) => {
    if (!step || step.kind === 'resetting' || step.row !== row.id) return null;
    if (step.kind === 'listening') {
      return step.refused ? (
        <p role="alert" data-testid="shortcut-refused" className="text-xs text-ui-danger-fg">
          {refusal(step.refused.keys, step.refused.verdict)}
        </p>
      ) : (
        <p className="text-xs text-ui-fg-muted">{t('keys.pressHint')}</p>
      );
    }
    return (
      <div
        role="group"
        data-testid="shortcut-conflict"
        className="flex flex-col gap-2 rounded-control bg-ui-field p-2"
      >
        <p role="alert">
          {t('keys.taken', {
            keys: drawnKeys(step.keys),
            action: step.by.map(({ label }) => actionOf(label)).join(', '),
          })}
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setStep(null)}>
            {t('keys.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            autoFocus
            onClick={() => give(step, step.keys, step.by)}
          >
            {t('keys.moveHere')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        useShell.setState({ shortcutsOpen: next });
        if (!next) {
          setQuery('');
          setStep(null);
          setNotSaved(false);
        }
      }}
    >
      {open && (
        <DialogContent
          title={t('keys.title')}
          description={t('keys.editHint')}
          closeLabel={t('keys.close')}
          data-testid="shortcut-map"
          // Esc leaves a question of the map before it closes the map.
          onEscapeKeyDown={(event) => {
            if (!step) return;
            event.preventDefault();
            setStep(null);
          }}
          footer={
            step?.kind === 'resetting' ? (
              <>
                <span role="alert" className="me-auto min-w-0 self-center">
                  {t('keys.resetAllConfirm')}
                </span>
                <Button variant="ghost" onClick={() => setStep(null)}>
                  {t('keys.cancel')}
                </Button>
                <Button
                  variant="danger"
                  autoFocus
                  data-testid="shortcut-reset-all-yes"
                  onClick={() => {
                    save(resetKeys());
                    setStep(null);
                  }}
                >
                  {t('keys.resetAllYes')}
                </Button>
              </>
            ) : (
              <>
                <span
                  aria-live="polite"
                  data-testid="shortcut-changed"
                  className="me-auto min-w-0 self-center text-xs text-ui-fg-muted"
                >
                  {notSaved
                    ? t('keys.notSaved')
                    : changed > 0
                      ? t('keys.changed', { n: changed })
                      : ''}
                </span>
                <Button
                  variant="ghost"
                  disabled={changed === 0}
                  data-testid="shortcut-reset-all"
                  onClick={() => setStep({ kind: 'resetting' })}
                >
                  {t('keys.resetAll')}
                </Button>
              </>
            )
          }
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
                      {inSection.map((row) => {
                        const below = under(row);
                        return (
                          <div
                            key={row.id}
                            data-shortcut={row.id}
                            className="flex min-h-control flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1"
                          >
                            <dt className="min-w-0 flex-1">{t(row.label)}</dt>
                            <dd className="flex shrink-0 flex-wrap items-center justify-end gap-y-1">
                              {row.bindings.map((binding) => chip(row, binding))}
                            </dd>
                            {below && <dd className="basis-full">{below}</dd>}
                          </div>
                        );
                      })}
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
