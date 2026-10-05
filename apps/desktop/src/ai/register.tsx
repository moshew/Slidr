import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { Ai } from '@slidr/ui/icons';
import type { ChatThread } from '../agent/agentService';
import { registerMessages } from '../i18n';
import {
  openAiChat,
  PanelId,
  registerPanel,
  registerShortcut,
  registerStatusItem,
  StatusItem,
  useDeck,
  useEditor,
} from '../shell';
import { AiActions } from './Actions';
import { Chat } from './Chat';
import { en, he } from './messages';
import { aiOf } from './runtime';
import { activityLabel, targetSlideNumber } from './toolLabels';

/*
 * The AI panel (WG11, ADR-072): one chat and its actions, under the shell's own id for it, so it
 * takes the place of the placeholder. The chat is a deck session; what the user has selected (a
 * slide, elements, words in a text) goes to the agent with each message.
 */

registerMessages('ai', { he, en });

registerPanel({
  id: PanelId.ai,
  kind: 'ai',
  slot: 'ai',
  order: 0,
  shortcut: 'Ctrl+1',
  title: 'panels.ai',
  icon: Ai,
  chat: Chat,
  actions: AiActions,
});

/* ---------------------------------------------------------------- the status bar (UI-07) */

/** The agent's state: idle, or what the chat that is working is doing. */
function AgentStatus() {
  const { t } = useTranslation('ai');
  const { sessions } = aiOf(useEditor());
  const thread = useStore(sessions.working, (s) => s.threads[0]);
  return thread ? (
    <Working thread={thread} />
  ) : (
    <span data-testid="status-agent" data-state="idle">
      <StatusItem dot="bg-ui-fg-subtle">{t('status.idle')}</StatusItem>
    </span>
  );
}

function Working({ thread }: { thread: ChatThread }) {
  const { t } = useTranslation('ai');
  const activity = useStore(thread.store, (s) => s.activity);
  const slideNumber = useDeck((s) =>
    activity?.kind === 'tool' ? targetSlideNumber(s.deck, activity.target) : 0,
  );
  return (
    <span data-testid="status-agent" data-state="working">
      <StatusItem busy>
        {t('status.working', { activity: activityLabel(t, activity, slideNumber) })}
      </StatusItem>
    </span>
  );
}

registerStatusItem({ id: 'agent', render: AgentStatus });

/* ---------------------------------------------------------------- Ctrl+L (SPEC Appendix A) */

/** Puts the caret in the AI chat, and opens it when it is not shown. */
registerShortcut({
  id: 'ai.focusChat',
  keys: 'Ctrl+L',
  label: 'keys.focusChat',
  section: 'ai',
  inText: true,
  run: () => openAiChat(),
});
