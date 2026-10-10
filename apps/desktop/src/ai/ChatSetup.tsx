import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Button, Skeleton } from '@slidr/ui';
import type { HarnessDescriptor } from '../agent/agent';
import { modelEfforts, selectionIssue } from '../agent/harnessSetup';
import { setAgentSettings, useAgentSettings } from '../settings';
import { useEditor } from '../shell';
import { agentOf } from './runtime';

export const harnessName = (harness: HarnessDescriptor) =>
  ({ 'claude-code': 'Claude', 'codex-cli': 'Codex', 'copilot-cli': 'GitHub Copilot' })[
    harness.id
  ] ?? harness.name.replace(/\s+CLI\b/gi, '');

export function useChatSetup() {
  const agent = agentOf(useEditor());
  const settings = useAgentSettings();
  const [harnesses, setHarnesses] = useState<HarnessDescriptor[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    agent.harnesses().then(
      (found) => {
        if (current) {
          setHarnesses(found);
          setFailed(false);
        }
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [agent, attempt]);
  const descriptor = harnesses?.find((h) => h.id === settings.harnessId);
  const mock = descriptor?.id === 'mock' || (!settings.harnessId && harnesses?.[0]?.id === 'mock');
  const state = useStore(agent.setup.store, (states) =>
    descriptor ? states[descriptor.id] : undefined,
  );
  useEffect(() => {
    if (descriptor && !mock) void agent.setup.connect(descriptor.id).catch(() => undefined);
  }, [agent, descriptor, mock]);
  const connection = state?.connection;
  const needed =
    !mock &&
    (!descriptor ||
      !connection ||
      connection.status.state !== 'ready' ||
      !!selectionIssue(connection.harness, settings.model, settings.effort));
  return {
    agent,
    settings,
    harnesses,
    descriptor,
    state,
    needed,
    failed,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** Setup is local conversation UI; it never sends a prompt or starts an agent session. */
export function ChatSetup({ setup }: { setup: ReturnType<typeof useChatSetup> }) {
  const { t } = useTranslation('ai');
  const { agent, settings, harnesses, descriptor, state, failed } = setup;
  const [choice, setChoice] = useState('');
  const [editingHarness, setEditingHarness] = useState(false);
  const connection = state?.connection;
  const harness = connection?.harness;
  const status = connection?.status.state;
  const model = harness?.models.find((item) => item.id === settings.model);
  const step = !descriptor || editingHarness ? 'harness' : !model ? 'model' : 'effort';
  const efforts = harness ? modelEfforts(harness, settings.model) : [];
  const options =
    step === 'harness'
      ? (harnesses ?? []).map((h) => ({ id: h.id, label: harnessName(h) }))
      : step === 'model'
        ? (harness?.models ?? [])
        : efforts.map((id) => ({ id, label: t(`picker.efforts.${id}`, { defaultValue: id }) }));
  const showOptions = step === 'harness' || (status === 'ready' && !state?.busy && !state?.error);
  const retry = () =>
    descriptor
      ? void agent.setup.connect(descriptor.id, true).catch(() => undefined)
      : setup.retry();
  return (
    <section className="flex flex-col gap-4 px-4 py-5" data-testid="chat-setup">
      <div className="text-sm leading-6">
        <p className="font-semibold">{t('setup.welcome')}</p>
        <p className="text-ui-fg-muted">{t('setup.intro')}</p>
      </div>
      {descriptor && !editingHarness && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span dir="auto">
            {harnessName(descriptor)}
            {model ? ` · ${model.label}` : ''}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!state?.busy}
            onClick={() => {
              setChoice('');
              setEditingHarness(true);
            }}
          >
            {t('setup.change')}
          </Button>
        </div>
      )}
      {!harnesses && !failed && <Skeleton className="h-24 w-full" />}
      {(failed || harnesses?.length === 0) && <p role="alert">{t('setup.unavailable')}</p>}
      {showOptions && options.length > 0 && (
        <form
          className="flex flex-col gap-3 rounded-panel border border-ui-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!options.some((option) => option.id === choice)) return;
            if (step === 'harness') {
              setAgentSettings({ harnessId: choice, model: undefined, effort: undefined });
              setEditingHarness(false);
            } else if (step === 'model') setAgentSettings({ model: choice, effort: undefined });
            else setAgentSettings({ effort: choice });
            setChoice('');
          }}
        >
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-3 text-sm font-medium">{t(`setup.${step}`)}</legend>
            {options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-3 rounded-control border border-ui-line px-3 py-3 text-sm hover:bg-ui-hover has-[:checked]:border-ui-accent has-[:checked]:bg-ui-accent-soft"
              >
                <input
                  type="radio"
                  name={`setup-${step}`}
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => setChoice(option.id)}
                  className="shrink-0 accent-ui-accent"
                />
                <span dir="auto" className="min-w-0 break-words">
                  {option.label}
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={!options.some((option) => option.id === choice)}>
            {t('setup.continue')}
          </Button>
        </form>
      )}
      {descriptor && !editingHarness && (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          {state?.busy && <p>{t(`setup.${state.busy}`)}</p>}
          {!state?.busy && status === 'not_installed' && (
            <>
              <p>{t('setup.installDescription', { name: harnessName(descriptor) })}</p>
              <Button onClick={() => void agent.setup.run(descriptor.id, 'install')}>
                {t('setup.install')}
              </Button>
            </>
          )}
          {!state?.busy && status === 'not_logged_in' && (
            <>
              <p>{t('setup.signInDescription')}</p>
              <Button onClick={() => void agent.setup.run(descriptor.id, 'login')}>
                {t('setup.signIn')}
              </Button>
            </>
          )}
          {(state?.error ||
            status === 'unavailable' ||
            (status === 'ready' && !harness?.models.length)) && (
            <p role="alert">{t('setup.unavailable')}</p>
          )}
        </div>
      )}
      {!state?.busy &&
        (failed ||
          harnesses?.length === 0 ||
          state?.error ||
          status === 'unavailable' ||
          status === 'not_logged_in' ||
          (status === 'ready' && !harness?.models.length)) && (
          <Button variant="ghost" onClick={retry}>
            {t('setup.retry')}
          </Button>
        )}
    </section>
  );
}
