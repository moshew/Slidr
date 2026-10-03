import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { Presentation, RectangleHorizontal, SquareDashedMousePointer } from '@slidr/ui/icons';
import { EmptyState } from '@slidr/ui';
import type { ChatThread } from '../agent/agentService';
import { registerMessages } from '../i18n';
import {
  openPanel,
  PanelId,
  registerPanel,
  registerShortcut,
  registerStatusItem,
  StatusItem,
  useDeck,
  useEditor,
  useShell,
} from '../shell';
import { DeckActions, ObjectActions, SlideActions } from './Actions';
import { Chat } from './Chat';
import { en, he } from './messages';
import { aiOf } from './runtime';
import { useObjectScope, useSlideScope } from './scopes';
import { activityLabel, targetSlideNumber } from './toolLabels';

/*
 * The AI panels (WG11): the three tools, each a chat and its actions, under the shell's own ids
 * for them, so they take the place of the placeholders. The deck has one chat; the slide tool
 * shows the chat of the slide on the Stage, and the object tool the chat of the selection.
 */

registerMessages('ai', { he, en });

const DECK = { kind: 'deck' } as const;

function DeckChat() {
  return <Chat scope={DECK} />;
}

/** The chat of the slide on the Stage: another slide is another chat (AIS-01). */
function SlideChat() {
  const { t } = useTranslation('ai');
  const scope = useSlideScope();
  if (!scope) {
    return (
      <EmptyState
        icon={RectangleHorizontal}
        title={t('noSlide.title')}
        description={t('noSlide.body')}
        className="min-h-64"
      />
    );
  }
  return <Chat key={scope.slideId} scope={scope} />;
}

/** The chat of the selection: it changes with it, and says so when there is none (SPEC 4.2). */
function ObjectChat() {
  const { t } = useTranslation('ai');
  const scope = useObjectScope();
  if (!scope) {
    return (
      <EmptyState
        icon={SquareDashedMousePointer}
        title={t('noSelection.title')}
        description={t('noSelection.body')}
        className="min-h-64"
      />
    );
  }
  return <Chat key={scope.elementIds.join(' ')} scope={scope} />;
}

registerPanel({
  id: PanelId.aiDeck,
  kind: 'ai',
  slot: 'ai',
  order: 0,
  shortcut: 'Ctrl+1',
  title: 'panels.aiDeck',
  icon: Presentation,
  scope: 'deck',
  chat: DeckChat,
  actions: DeckActions,
});

registerPanel({
  id: PanelId.aiSlide,
  kind: 'ai',
  slot: 'ai',
  order: 1,
  shortcut: 'Ctrl+2',
  title: 'panels.aiSlide',
  icon: RectangleHorizontal,
  scope: 'slide',
  chat: SlideChat,
  actions: SlideActions,
});

registerPanel({
  id: PanelId.aiObject,
  kind: 'ai',
  slot: 'ai',
  order: 2,
  shortcut: 'Ctrl+3',
  title: 'panels.aiObject',
  icon: SquareDashedMousePointer,
  scope: 'object',
  chat: ObjectChat,
  actions: ObjectActions,
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

const AI_PANELS: readonly string[] = [PanelId.aiDeck, PanelId.aiSlide, PanelId.aiObject];

/** Puts the caret in the chat of the AI tool that is open, or of the deck tool when none is. */
registerShortcut({
  id: 'ai.focusChat',
  keys: 'Ctrl+L',
  inText: true,
  run: () => {
    const { activePanel, panelOpen } = useShell.getState();
    openPanel(panelOpen && AI_PANELS.includes(activePanel) ? activePanel : PanelId.aiDeck, 'chat');
    // The panel may only be opening: the field is there after the next frame.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-testid="chat-input"]')?.focus(),
    );
  },
});
