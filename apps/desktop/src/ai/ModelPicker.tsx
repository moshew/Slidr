import { useEffect, useState } from 'react';
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
import { useEditor } from '../shell';
import { he } from './messages';
import { agentOf, setAgentSettings, useAgentSettings } from './runtime';

/*
 * The model and the effort of the next turn (CHT-U06). The choice is one of the agent's
 * settings, kept where the rest of them are, and a session started with other settings is
 * started again before the user's next message, so the conversation goes on with the new ones.
 */

/** A choice that leaves the setting to the harness. */
const DEFAULT = '';

function isEffort(name: string): name is keyof typeof he.picker.efforts {
  return Object.hasOwn(he.picker.efforts, name);
}

export function ModelPicker() {
  const { t } = useTranslation('ai');
  const agent = agentOf(useEditor());
  const settings = useAgentSettings();
  const [harness, setHarness] = useState<HarnessDescriptor | null>(null);
  useEffect(() => {
    let current = true;
    agent.harness(settings.harnessId).then(
      (found) => current && setHarness(found),
      () => current && setHarness(null),
    );
    return () => {
      current = false;
    };
  }, [agent, settings.harnessId]);

  // A harness with one model and no effort levels leaves nothing to pick.
  if (!harness || (harness.models.length === 0 && harness.effortLevels.length === 0)) return null;
  const model = harness.models.find((option) => option.id === settings.model);
  const effortName = (name: string) => (isEffort(name) ? t(`picker.efforts.${name}`) : name);
  const shown = [
    model?.label ?? (settings.model || t('picker.default')),
    ...(settings.effort ? [effortName(settings.effort)] : []),
  ].join(' · ');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t('composer.model')}: ${shown}`}
          data-testid="model-picker"
          data-model={settings.model ?? DEFAULT}
          iconEnd={ChevronDown}
          className="min-w-0 shrink text-ui-fg-muted"
        >
          <span className="truncate">{shown}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {harness.models.length > 0 && (
          <>
            <DropdownMenuLabel>{t('picker.models')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={settings.model ?? DEFAULT}
              onValueChange={(value) => setAgentSettings({ model: value || undefined })}
            >
              <DropdownMenuRadioItem value={DEFAULT}>{t('picker.default')}</DropdownMenuRadioItem>
              {harness.models.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id} data-model={option.id}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {harness.effortLevels.length > 0 && (
          <>
            {harness.models.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t('picker.effort')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={settings.effort ?? DEFAULT}
              onValueChange={(value) => setAgentSettings({ effort: value || undefined })}
            >
              <DropdownMenuRadioItem value={DEFAULT}>{t('picker.default')}</DropdownMenuRadioItem>
              {harness.effortLevels.map((level) => (
                <DropdownMenuRadioItem key={level} value={level} data-effort={level}>
                  {effortName(level)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-ui-fg-muted">{t('picker.hint')}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
