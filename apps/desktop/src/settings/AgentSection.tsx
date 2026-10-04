import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Select, Skeleton, Switch } from '@slidr/ui';
import type { HarnessDescriptor } from '../agent/agent';
import { DEFAULT_OUTLINE } from '../agent/agentService';
import { agentOf, setAgentSettings, useAgentSettings } from '../ai/runtime';
import { useEditor } from '../shell';

/*
 * The agent's part of the settings screen (WG3-T08, WG11-T11): the harness that runs the
 * sessions, its model and effort, web access, the design check at the end of a turn, and whether
 * a deck asked for by its subject starts from an outline. The values are the agent's own
 * settings (`ai/runtime.ts`): the picker in the chat changes the same model and effort, and a
 * session reads all of them when it starts and at the start of every turn.
 */

/** A choice that leaves the setting to the harness. */
const DEFAULT = 'default';

export function AgentSection() {
  const { t } = useTranslation('settings');
  const agent = agentOf(useEditor());
  const settings = useAgentSettings();
  const [harnesses, setHarnesses] = useState<HarnessDescriptor[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  const harness = harnesses.find((h) => h.id === settings.harnessId) ?? harnesses[0];
  const effortName = (level: string) => {
    const key = `ai:picker.efforts.${level}`;
    return t(key, { defaultValue: level });
  };
  const pick = (value: string) => (value === DEFAULT ? undefined : value);

  return (
    <div className="flex flex-col gap-4" data-testid="settings-agent">
      {harnesses.length > 1 && harness && (
        <Field label={t('agent.harness')}>
          <Select
            aria-label={t('agent.harness')}
            value={harness.id}
            options={harnesses.map((h) => ({ value: h.id, label: h.name }))}
            // Another harness has other models and other effort levels.
            onValueChange={(harnessId) =>
              setAgentSettings({ harnessId, model: undefined, effort: undefined })
            }
          />
        </Field>
      )}
      {harness && harness.models.length > 0 && (
        <Field label={t('agent.model')} hint={t('agent.nextMessage')}>
          <Select
            aria-label={t('agent.model')}
            value={settings.model ?? DEFAULT}
            options={[
              { value: DEFAULT, label: t('agent.default') },
              ...harness.models.map((model) => ({ value: model.id, label: model.label })),
            ]}
            onValueChange={(model) => setAgentSettings({ model: pick(model) })}
          />
        </Field>
      )}
      {harness && harness.effortLevels.length > 0 && (
        <Field label={t('agent.effort')}>
          <Select
            aria-label={t('agent.effort')}
            value={settings.effort ?? DEFAULT}
            options={[
              { value: DEFAULT, label: t('agent.default') },
              ...harness.effortLevels.map((level) => ({ value: level, label: effortName(level) })),
            ]}
            onValueChange={(effort) => setAgentSettings({ effort: pick(effort) })}
          />
        </Field>
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
