import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Terminal } from '@slidr/ui/icons';
import { Button, cx, Field, Icon, Select, Skeleton, Switch } from '@slidr/ui';
import { useStore } from 'zustand';
import { latestModels, modelEfforts } from '../agent/harnessSetup';
import { harnessLook, installsWithNpm } from '../agent/harnessLook';
import type { HarnessDescriptor, HarnessState } from '../agent/agent';
import { DEFAULT_OUTLINE } from '../agent/agentService';
import { agentOf } from '../ai/runtime';
import { useEditor } from '../shell';
import { setAgentSettings, useAgentSettings } from './agentSettings';
import { InstallDialog } from './InstallDialog';
import { SettingsGroup, SettingsItem, StatusPill, type StatusTone } from './layout';

/*
 * The agent's part of the settings screen (WG3-T08, WG11-T11): the harness that runs the
 * sessions, its model and effort, web access, the design check at the end of a turn, and whether
 * a deck asked for by its subject starts from an outline. The values are the app's own, the
 * section `agent` of the settings file (`agentSettings.ts`): what every conversation runs with
 * until the picker of its chat chooses a model or an effort for that conversation alone
 * (AGT-04). A session reads them when it starts and at the start of every turn.
 */

const stateTone: Record<HarnessState, StatusTone> = {
  ready: 'success',
  not_installed: 'warning',
  not_logged_in: 'warning',
  unavailable: 'danger',
};

/** The mark of a harness the app knows, as the chat's setup shows it; a terminal for others. */
function HarnessMark({ id }: { id: string }) {
  const mark = harnessLook(id);
  return (
    <span
      aria-hidden
      dir="ltr"
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-control font-mono text-xs font-semibold',
        mark?.tone ?? 'bg-ui-tool-violet text-ui-tool-violet-fg',
      )}
    >
      {mark ? mark.glyph : <Icon icon={Terminal} />}
    </span>
  );
}

export function AgentSection() {
  const { t } = useTranslation('settings');
  const agent = agentOf(useEditor());
  const settings = useAgentSettings();
  const [harnesses, setHarnesses] = useState<HarnessDescriptor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmInstall, setConfirmInstall] = useState<string>();
  const selectedId = settings.harnessId ?? harnesses?.[0]?.id;
  const state = useStore(agent.setup.store, (states) =>
    selectedId ? states[selectedId] : undefined,
  );

  useEffect(() => {
    if (selectedId) void agent.setup.connect(selectedId, true).catch(() => undefined);
  }, [agent, selectedId]);

  useEffect(() => {
    const connection = state?.connection;
    if (
      connection?.status.state === 'ready' &&
      settings.effort &&
      !modelEfforts(connection.harness, settings.model).includes(settings.effort)
    ) {
      setAgentSettings({ effort: undefined });
    }
  }, [state?.connection, settings.model, settings.effort]);

  useEffect(() => {
    let current = true;
    agent.harnesses().then(
      (found) => current && setHarnesses(found),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [agent]);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-ui-danger-fg">
        {t('agent.unavailable')}
      </p>
    );
  }
  if (!harnesses) return <Skeleton className="h-24 w-full rounded-panel" />;

  const descriptor = harnesses.find((h) => h.id === selectedId);
  const harness = state?.connection?.harness;
  const status = state?.connection?.status;
  const ready = status?.state === 'ready' && !state?.busy;
  const selectedModel = harness?.models.find((model) => model.id === settings.model);
  const latest = latestModels(harness?.models ?? []);
  const efforts = harness ? modelEfforts(harness, settings.model) : [];
  const retry = () =>
    selectedId && void agent.setup.connect(selectedId, true).catch(() => undefined);
  const effortName = (level: string) => {
    const key = `ai:picker.efforts.${level}`;
    return t(key, { defaultValue: level });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="settings-agent">
      <SettingsGroup title={t('agent.connection')}>
        {harnesses.length > 1 && descriptor && (
          <SettingsItem>
            <Field label={t('agent.harness')}>
              <Select
                aria-label={t('agent.harness')}
                value={descriptor.id}
                disabled={state?.busy === 'installing' || state?.busy === 'signingIn'}
                options={harnesses.map((h) => ({ value: h.id, label: h.name }))}
                // Another harness has other models and other effort levels.
                onValueChange={(harnessId) =>
                  setAgentSettings({ harnessId, model: undefined, effort: undefined })
                }
              />
            </Field>
          </SettingsItem>
        )}
        <SettingsItem className="gap-3">
          <div aria-live="polite" className="flex flex-col gap-3" data-testid="harness-connection">
            <div className="flex min-w-0 items-center gap-3">
              {selectedId && <HarnessMark id={selectedId} />}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ui-fg">
                  <bdi>{descriptor?.name}</bdi>
                </span>
                {status?.version && (
                  // At the start of the line, under the name, in either direction of the UI.
                  <span className="truncate text-xs text-ui-fg-muted">
                    <bdi dir="ltr">{status.version}</bdi>
                  </span>
                )}
              </div>
              {state?.busy ? (
                <StatusPill tone="neutral">{t('agent.state.busy')}</StatusPill>
              ) : (
                <StatusPill tone={stateTone[status?.state ?? 'unavailable']}>
                  {t(`agent.state.${status?.state ?? 'unavailable'}`)}
                </StatusPill>
              )}
            </div>
            <p className="text-xs text-ui-fg-muted">
              {t(state?.busy ? `agent.${state.busy}` : `agent.${status?.state ?? 'unavailable'}`)}
            </p>
            {(state?.error || status?.detail) && (
              <p role="alert" className="break-words text-xs text-ui-danger-fg" dir="auto">
                {state?.error ?? status?.detail}
              </p>
            )}
          </div>
          {!state?.busy && (
            <div className="flex flex-wrap items-center gap-2">
              {status?.state === 'not_installed' && (
                <Button size="sm" variant="primary" onClick={() => setConfirmInstall(selectedId)}>
                  {t('agent.install')}
                </Button>
              )}
              {status?.state === 'not_logged_in' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => selectedId && void agent.setup.run(selectedId, 'login')}
                >
                  {t('agent.signIn')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                // Alone in its row, its icon lines up with the words above it.
                className={
                  status?.state === 'not_installed' || status?.state === 'not_logged_in'
                    ? undefined
                    : '-ms-2.5'
                }
                onClick={retry}
              >
                {t(status?.state === 'ready' ? 'agent.refresh' : 'retry')}
              </Button>
            </div>
          )}
        </SettingsItem>
      </SettingsGroup>
      <InstallDialog
        name={descriptor?.name}
        npm={installsWithNpm(selectedId)}
        open={!!confirmInstall && confirmInstall === selectedId}
        onClose={() => setConfirmInstall(undefined)}
        onApprove={() => selectedId && void agent.setup.run(selectedId, 'install')}
      />
      {ready && harness && (
        <SettingsGroup title={t('agent.defaults')} note={t('agent.nextMessage')}>
          <SettingsItem>
            <Field label={t('agent.model')}>
              <Select
                aria-label={t('agent.model')}
                placeholder={t('agent.chooseModel')}
                value={selectedModel?.id ?? null}
                // The newest of each family, as in the chat's setup. An older model chosen before
                // stays listed, greyed, only so the field still shows what runs.
                options={harness.models
                  .filter((model) => model === selectedModel || latest.includes(model))
                  .map((model) => ({
                    value: model.id,
                    label: model.label,
                    disabled: !latest.includes(model),
                  }))}
                onValueChange={(model) => setAgentSettings({ model, effort: undefined })}
              />
            </Field>
          </SettingsItem>
          {selectedModel && efforts.length > 0 && (
            <SettingsItem>
              <Field label={t('agent.effort')}>
                <Select
                  aria-label={t('agent.effort')}
                  placeholder={t('agent.chooseEffort')}
                  value={
                    settings.effort && efforts.includes(settings.effort) ? settings.effort : null
                  }
                  options={efforts.map((level) => ({ value: level, label: effortName(level) }))}
                  onValueChange={(effort) => setAgentSettings({ effort })}
                />
              </Field>
            </SettingsItem>
          )}
          {selectedModel && efforts.length === 0 && (
            <SettingsItem>
              <p className="text-xs text-ui-fg-muted">{t('agent.noEffort')}</p>
            </SettingsItem>
          )}
        </SettingsGroup>
      )}
      <SettingsGroup title={t('agent.behaviour')}>
        <SettingsItem>
          <Switch
            side="end"
            label={t('agent.web')}
            hint={t('agent.webHint')}
            checked={settings.webAccess !== false}
            // On is the default: it is not written, so the default can change under it.
            onCheckedChange={(on) => setAgentSettings({ webAccess: on ? undefined : false })}
          />
        </SettingsItem>
        <SettingsItem>
          <Switch
            side="end"
            label={t('agent.gate')}
            hint={t('agent.gateHint')}
            checked={settings.qualityGate !== false}
            onCheckedChange={(on) => setAgentSettings({ qualityGate: on ? undefined : false })}
          />
        </SettingsItem>
        <SettingsItem>
          <Switch
            side="end"
            label={t('agent.outline')}
            hint={t('agent.outlineHint')}
            checked={(settings.outline ?? DEFAULT_OUTLINE) === 'first'}
            onCheckedChange={(on) => setAgentSettings({ outline: on ? 'first' : 'build' })}
          />
        </SettingsItem>
      </SettingsGroup>
    </div>
  );
}
