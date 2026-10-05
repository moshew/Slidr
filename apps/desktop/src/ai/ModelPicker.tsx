import { useEffect, useRef, useState, type RefObject } from 'react';
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
import { useEditor } from '../shell';
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

/**
 * The conversation of the chat the picker sits in. The chat names the thread it shows on its
 * root (`data-thread`), and shows another one without drawing its composer anew.
 */
function useConversation(anchor: RefObject<HTMLElement | null>): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const chat = anchor.current?.closest<HTMLElement>('[data-thread]');
    if (!chat) return;
    const read = () => setId(chat.dataset.thread ?? null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(chat, { attributes: true, attributeFilter: ['data-thread'] });
    return () => observer.disconnect();
  }, [anchor]);
  return id;
}

export function ModelPicker() {
  const { t } = useTranslation('ai');
  const agent = agentOf(useEditor());
  const anchor = useRef<HTMLSpanElement>(null);
  const threadId = useConversation(anchor);
  const app = useAgentSettings();
  const own = useConversationSettings(threadId);
  const settings = { ...app, ...own };
  const [harness, setHarness] = useState<HarnessDescriptor | null>(null);
  useEffect(() => {
    let current = true;
    agent.harness(app.harnessId).then(
      (found) => current && setHarness(found),
      () => current && setHarness(null),
    );
    return () => {
      current = false;
    };
  }, [agent, app.harnessId]);

  const choose = (patch: { model?: string; effort?: string }) => {
    if (threadId !== null) setConversationSettings(threadId, patch);
  };
  const modelName = (id: string | undefined) =>
    harness?.models.find((option) => option.id === id)?.label ?? id;
  const effortName = (name: string) => (isEffort(name) ? t(`picker.efforts.${name}`) : name);
  /** "The default", with what the app's setting is when it names one. */
  const defaultName = (named: string | undefined) =>
    named ? `${t('picker.default')} · ${named}` : t('picker.default');
  const shown = [
    modelName(settings.model) ?? t('picker.default'),
    ...(settings.effort ? [effortName(settings.effort)] : []),
  ].join(' · ');
  // A harness with one model and no effort levels leaves nothing to pick.
  const offered =
    harness && (harness.models.length > 0 || harness.effortLevels.length > 0) ? harness : null;

  return (
    // Not a box of its own: the button is laid out as a child of the composer's row.
    <span ref={anchor} className="contents">
      {offered && (
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
                  onValueChange={(value) => choose({ model: value || undefined })}
                >
                  <DropdownMenuRadioItem value={DEFAULT}>
                    {defaultName(modelName(app.model))}
                  </DropdownMenuRadioItem>
                  {offered.models.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id} data-model={option.id}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
            {offered.effortLevels.length > 0 && (
              <>
                {offered.models.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{t('picker.effort')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={own.effort ?? DEFAULT}
                  onValueChange={(value) => choose({ effort: value || undefined })}
                >
                  <DropdownMenuRadioItem value={DEFAULT}>
                    {defaultName(app.effort ? effortName(app.effort) : undefined)}
                  </DropdownMenuRadioItem>
                  {offered.effortLevels.map((level) => (
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
      )}
    </span>
  );
}
