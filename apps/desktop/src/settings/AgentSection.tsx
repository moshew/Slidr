import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent, Field, Select, Skeleton, Switch } from '@slidr/ui';
import { useStore } from 'zustand';
import { modelEfforts } from '../agent/harnessSetup';
import type { HarnessDescriptor } from '../agent/agent';
import { DEFAULT_OUTLINE } from '../agent/agentService';
import { agentOf } from '../ai/runtime';
import { useEditor } from '../shell';
import { setAgentSettings, useAgentSettings } from './agentSettings';

/*
 * The agent's part of the settings screen (WG3-T08, WG11-T11): the harness that runs the
 * sessions, its model and effort, web access, the design check at the end of a turn, and whether
 * a deck asked for by its subject starts from an outline. The values are the app's own, the
 * section `agent` of the settings file (`agentSettings.ts`): what every conversation runs with
 * until the picker of its chat chooses a model or an effort for that conversation alone
 * (AGT-04). A session reads them when it starts and at the start of every turn.
 */

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
  if (!harnesses) return <Skeleton className="h-20 w-full" />;

  const descriptor = harnesses.find((h) => h.id === selectedId);
  const harness = state?.connection?.harness;
  const status = state?.connection?.status;
  const ready = status?.state === 'ready' && !state?.busy;
  const selectedModel = harness?.models.find((model) => model.id === settings.model);
  const efforts = harness ? modelEfforts(harness, settings.model) : [];
  const retry = () =>
    selectedId && void agent.setup.connect(selectedId, true).catch(() => undefined);
  const effortName = (level: string) => {
    const key = `ai:picker.efforts.${level}`;
    return t(key, { defaultValue: level });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="settings-agent">
      {harnesses.length > 1 && descriptor && (
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
      )}
      <div
        className="flex flex-col gap-2 rounded-panel border border-ui-line p-3"
        aria-live="polite"
        data-testid="harness-connection"
      >
        {state?.busy ? (
          <p className="text-sm">{t(`agent.${state.busy}`)}</p>
        ) : (
          <>
            <p className="text-sm">{t(`agent.${status?.state ?? 'unavailable'}`)}</p>
            {status?.version && (
              <p className="text-xs text-ui-fg-muted" dir="ltr">
                {descriptor?.name} · {status.version}
              </p>
            )}
            {status?.state === 'not_installed' && (
              <Button size="sm" onClick={() => setConfirmInstall(selectedId)}>
                {t('agent.install')}
              </Button>
            )}
            {status?.state === 'not_logged_in' && (
              <Button
                size="sm"
                onClick={() => selectedId && void agent.setup.run(selectedId, 'login')}
              >
                {t('agent.signIn')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={retry}>
              {t(status?.state === 'ready' ? 'agent.refresh' : 'retry')}
            </Button>
          </>
        )}
        {(state?.error || status?.detail) && (
          <p role="alert" className="break-words text-xs text-ui-danger-fg" dir="auto">
            {state?.error ?? status?.detail}
          </p>
        )}
      </div>
      <Dialog
        open={!!confirmInstall && confirmInstall === selectedId}
        onOpenChange={(open) => !open && setConfirmInstall(undefined)}
      >
        <DialogContent
          title={t('agent.installTitle', { name: descriptor?.name })}
          description={t('agent.installDescription', { name: descriptor?.name })}
          closeLabel={t('keys.cancel')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmInstall(undefined)}>
                {t('keys.cancel')}
              </Button>
              <Button
                onClick={() => {
                  setConfirmInstall(undefined);
                  if (selectedId) void agent.setup.run(selectedId, 'install');
                }}
              >
                {t('agent.approveInstall')}
              </Button>
            </>
          }
        />
      </Dialog>
      {ready && harness && (
        <>
          <Field label={t('agent.model')} hint={t('agent.nextMessage')}>
            <Select
              aria-label={t('agent.model')}
              placeholder={t('agent.chooseModel')}
              value={selectedModel?.id ?? null}
              options={harness.models.map((model) => ({ value: model.id, label: model.label }))}
              onValueChange={(model) => setAgentSettings({ model, effort: undefined })}
            />
          </Field>
          {selectedModel && efforts.length > 0 && (
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
          )}
          {selectedModel && efforts.length === 0 && (
            <p className="text-xs text-ui-fg-muted">{t('agent.noEffort')}</p>
          )}
        </>
      )}
      <div className="flex flex-col gap-3">
        <Switch
          side="end"
          label={t('agent.web')}
          hint={t('agent.webHint')}
          checked={settings.webAccess !== false}
          // On is the default: it is not written, so the default can change under it.
          onCheckedChange={(on) => setAgentSettings({ webAccess: on ? undefined : false })}
        />
        <Switch
          side="end"
          label={t('agent.gate')}
          hint={t('agent.gateHint')}
          checked={settings.qualityGate !== false}
          onCheckedChange={(on) => setAgentSettings({ qualityGate: on ? undefined : false })}
        />
        <Switch
          side="end"
          label={t('agent.outline')}
          hint={t('agent.outlineHint')}
          checked={(settings.outline ?? DEFAULT_OUTLINE) === 'first'}
          onCheckedChange={(on) => setAgentSettings({ outline: on ? 'first' : 'build' })}
        />
      </div>
    </div>
  );
}
