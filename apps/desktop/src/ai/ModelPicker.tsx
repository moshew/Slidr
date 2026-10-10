import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { modelEfforts } from '../agent/harnessSetup';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@slidr/ui';
import { ChevronDown } from '@slidr/ui/icons';
import type { HarnessDescriptor } from '../agent/agent';
import { setConversationSettings, useAgentSettings, useConversationSettings } from '../settings';
import { openPanel, PanelId, useEditor } from '../shell';
import { he } from './messages';
import { agentOf } from './runtime';

/*
 * The model and the effort of this conversation's next turn (CHT-U06, AGT-04). The app's own
 * choice, made in the settings screen, is the default; what is picked here is the conversation's
 * own, over it, and does not change the default. A session started with other settings is
 * started again before the user's next message, so the conversation goes on with the new ones.
 */

/** A choice that leaves the setting to the app's own. */
const DEFAULT = '';

function isEffort(name: string): name is keyof typeof he.picker.efforts {
  return Object.hasOwn(he.picker.efforts, name);
}

/** `threadId`: the conversation the chat shows, whose choice this is. */
export function ModelPicker({ threadId }: { threadId: string }) {
  const { t } = useTranslation('ai');
  const agent = agentOf(useEditor());
  const app = useAgentSettings();
  const own = useConversationSettings(threadId);
  const settings = {
    ...app,
    ...own,
    effort: own.model && own.model !== app.model ? own.effort : (own.effort ?? app.effort),
  };
  const [descriptor, setDescriptor] = useState<HarnessDescriptor | null>(null);
  const connection = useStore(agent.setup.store, (states) =>
    descriptor ? states[descriptor.id] : undefined,
  );
  const harness =
    connection?.connection?.status.state === 'ready' ? connection.connection.harness : null;
  useEffect(() => {
    let current = true;
    agent.harness(app.harnessId).then(
      (found) => {
        if (current) {
          setDescriptor(found);
          void agent.setup.connect(found.id).catch(() => undefined);
        }
      },
      () => current && setDescriptor(null),
    );
    return () => {
      current = false;
    };
  }, [agent, app.harnessId]);

  const choose = (patch: { model?: string; effort?: string }) =>
    setConversationSettings(threadId, patch);
  const modelName = (id: string | undefined) =>
    harness?.models.find((option) => option.id === id)?.label ?? id;
  const effortName = (name: string) => (isEffort(name) ? t(`picker.efforts.${name}`) : name);
  /** "The default", with what the app's setting is when it names one. */
  const defaultName = (named: string | undefined) =>
    named ? `${t('picker.default')} · ${named}` : t('picker.default');
  const efforts = harness ? modelEfforts(harness, settings.model) : [];
  const shown = [
    modelName(settings.model) ?? t('settings:agent.chooseModel'),
    ...(efforts.length
      ? [
          settings.effort && efforts.includes(settings.effort)
            ? effortName(settings.effort)
            : t('settings:agent.chooseEffort'),
        ]
      : []),
  ].join(' · ');
  const offered = harness;
  if (!offered || !settings.model || !offered.models.some((model) => model.id === settings.model)) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openPanel(PanelId.settings)}
        data-testid="model-picker-setup"
      >
        {t('settings:agent.configure')}
      </Button>
    );
  }

  return (
    offered && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${t('composer.model')}: ${shown}`}
            data-testid="model-picker"
            data-model={settings.model ?? DEFAULT}
            data-effort={settings.effort ?? DEFAULT}
            // The conversation has a choice of its own, over the app's.
            data-own={own.model !== undefined || own.effort !== undefined}
            iconEnd={ChevronDown}
            className="min-w-0 shrink text-ui-fg-muted"
          >
            <span className="truncate">{shown}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          {offered.models.length > 0 && (
            <>
              <DropdownMenuLabel>{t('picker.models')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={own.model ?? DEFAULT}
                onValueChange={(value) => choose({ model: value || undefined, effort: undefined })}
              >
                {app.model && (
                  <DropdownMenuRadioItem value={DEFAULT}>
                    {defaultName(modelName(app.model))}
                  </DropdownMenuRadioItem>
                )}
                {offered.models.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id} data-model={option.id}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          )}
          {efforts.length > 0 && (
            <>
              {offered.models.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{t('picker.effort')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={own.effort ?? DEFAULT}
                onValueChange={(value) => choose({ effort: value || undefined })}
              >
                {(!own.model || own.model === app.model) &&
                  app.effort &&
                  efforts.includes(app.effort) && (
                    <DropdownMenuRadioItem value={DEFAULT}>
                      {defaultName(effortName(app.effort))}
                    </DropdownMenuRadioItem>
                  )}
                {efforts.map((level) => (
                  <DropdownMenuRadioItem key={level} value={level} data-effort={level}>
                    {effortName(level)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <p className="px-2 pt-1 text-xs text-ui-fg-muted">{t('picker.hint')}</p>
          <p className="px-2 pb-1 text-xs text-ui-fg-muted">{t('settings:agent.pickerHint')}</p>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );
}
