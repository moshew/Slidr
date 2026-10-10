import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Skeleton, cx } from '@slidr/ui';
import { Ai, Check } from '@slidr/ui/icons';
import type { HarnessDescriptor } from '../agent/agent';
import { latestModels, modelEfforts, selectionIssue } from '../agent/harnessSetup';
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
  // An old/default harness id alone is not a completed user choice.
  const [confirmedHarness, setConfirmedHarness] = useState<string>();
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
  const mock =
    descriptor?.id === 'mock' ||
    (!settings.harnessId && harnesses?.length === 1 && harnesses[0]?.id === 'mock');
  const choosingHarness = !descriptor || (!settings.model && confirmedHarness !== descriptor.id);
  const state = useStore(agent.setup.store, (states) =>
    descriptor ? states[descriptor.id] : undefined,
  );
  useEffect(() => {
    if (descriptor && !mock && !choosingHarness)
      void agent.setup.connect(descriptor.id).catch(() => undefined);
  }, [agent, descriptor, mock, choosingHarness]);
  const connection = state?.connection;
  const needed =
    !mock &&
    (choosingHarness ||
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
    choosingHarness,
    confirmHarness: setConfirmedHarness,
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
  const step = setup.choosingHarness || editingHarness ? 'harness' : !model ? 'model' : 'effort';
  const efforts = harness ? modelEfforts(harness, settings.model) : [];
  const options =
    step === 'harness'
      ? (harnesses ?? [])
          .filter((h) => h.id !== 'mock')
          .map((h) => ({ id: h.id, label: harnessName(h) }))
      : step === 'model'
        ? latestModels(harness?.models ?? [])
        : efforts.map((id) => ({ id, label: t(`picker.efforts.${id}`, { defaultValue: id }) }));
  const showOptions = step === 'harness' || (status === 'ready' && !state?.busy && !state?.error);
  const showForm = showOptions && options.length > 0;
  // Back reopens the previous question with the earlier answer still marked.
  const back = descriptor && step !== 'harness' && !state?.busy && (
    <Button
      variant="ghost"
      onClick={() => {
        if (step === 'effort') {
          setChoice(settings.model ?? '');
          setup.confirmHarness(descriptor.id);
          setAgentSettings({ model: undefined, effort: undefined });
        } else {
          setChoice(descriptor.id);
          setEditingHarness(true);
        }
      }}
    >
      {t('setup.back')}
    </Button>
  );
  const retry = () =>
    descriptor
      ? void agent.setup.connect(descriptor.id, true).catch(() => undefined)
      : setup.retry();
  return (
    <section className="flex flex-col gap-5 px-4 py-5" data-testid="chat-setup">
      <div className="flex flex-col items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-control bg-ui-accent-soft text-ui-accent-fg">
          <Icon icon={Ai} />
        </span>
        <div className="text-sm leading-6">
          <p className="font-semibold text-ui-fg">{t('setup.welcome')}</p>
          <p className="mt-1 text-ui-fg-muted">{t('setup.intro')}</p>
        </div>
      </div>
      <ol aria-label={t('setup.steps')} className="flex items-center gap-2 text-xs">
        {(['harness', 'model', 'effort'] as const).map((item, index) => (
          <li
            key={item}
            aria-current={item === step ? 'step' : undefined}
            className={cx(
              'flex flex-1 items-center gap-1.5',
              item === step ? 'font-medium text-ui-accent-fg' : 'text-ui-fg-muted',
            )}
          >
            <span
              className={cx(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                item === step ? 'bg-ui-accent text-ui-on-accent' : 'bg-ui-field',
              )}
            >
              {index + 1}
            </span>
            {t(`setup.steps_${item}`)}
          </li>
        ))}
      </ol>
      {!harnesses && !failed && <Skeleton className="h-24 w-full" />}
      {(failed || harnesses?.length === 0) && <p role="alert">{t('setup.unavailable')}</p>}
      {showForm && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!options.some((option) => option.id === choice)) return;
            if (step === 'harness') {
              setup.confirmHarness(choice);
              setAgentSettings({ harnessId: choice, model: undefined, effort: undefined });
              setEditingHarness(false);
            } else if (step === 'model') setAgentSettings({ model: choice, effort: undefined });
            else setAgentSettings({ effort: choice });
            setChoice('');
          }}
        >
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-medium">{t(`setup.${step}`)}</legend>
            {/* One grouped list, not a card per option: the rows stay compact in the narrow panel. */}
            <div className="divide-y divide-ui-line overflow-hidden rounded-control border border-ui-line">
              {options.map((option) => (
                <label
                  key={option.id}
                  className="relative flex min-h-10 cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm transition-colors hover:bg-ui-hover has-[:checked]:bg-ui-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ui-focus"
                >
                  <input
                    type="radio"
                    name={`setup-${step}`}
                    value={option.id}
                    checked={choice === option.id}
                    onChange={() => setChoice(option.id)}
                    aria-label={option.label}
                    className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                  />
                  {step === 'harness' && (
                    <span
                      aria-hidden="true"
                      dir="ltr"
                      className={cx(
                        'flex size-6 shrink-0 items-center justify-center rounded-small font-mono text-[11px] font-semibold',
                        option.id === 'claude-code'
                          ? 'bg-ui-tool-orange text-ui-tool-orange-fg'
                          : option.id === 'codex-cli'
                            ? 'bg-ui-tool-green text-ui-tool-green-fg'
                            : 'bg-ui-tool-blue text-ui-tool-blue-fg',
                      )}
                    >
                      {option.id === 'claude-code' ? '✳' : option.id === 'codex-cli' ? '>_' : 'GH'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    <bdi>{option.label}</bdi>
                  </span>
                  {choice === option.id && (
                    <Icon icon={Check} className="size-4 shrink-0 text-ui-accent-fg" />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            {back}
            <Button
              variant="primary"
              type="submit"
              disabled={!options.some((option) => option.id === choice)}
            >
              {t('setup.continue')}
            </Button>
          </div>
        </form>
      )}
      {descriptor && step !== 'harness' && (
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
          {!showForm && back && <div className="flex justify-end">{back}</div>}
        </div>
      )}
      {(step !== 'harness' || failed || harnesses?.length === 0) &&
        !state?.busy &&
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
