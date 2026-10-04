import type { SessionScope } from '@slidr/agent-tools';
import { ACTIONS, actionMessage, type ActionId } from '@slidr/prompts';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { threadIdOf } from '../agent/agentService';
import { actionLabel } from '../ai/actionLabels';
import { aiOf } from '../ai/runtime';
import { i18n } from '../i18n';
import { openPanel, PanelId, useEditor, type Editor } from '../shell';

/*
 * "Fix with AI" (LNT-03): the design check hands its findings to the agent through the actions
 * the AI tools already have (ADR-045): "fix the design findings" of the deck tool and of the
 * slide tool. The action is a message of that tool's chat, so it shows there, runs under the
 * quality gate, and is one step to undo like any turn. The agent runs the check itself
 * (`deck_lint`, `slide_lint`), on the deck as it is when its turn starts.
 */

type FixScope = Extract<SessionScope, { kind: 'deck' | 'slide' }>;

const ACTION: Record<FixScope['kind'], ActionId> = { deck: 'deck.fix', slide: 'slide.fix' };
const PANEL = { deck: PanelId.aiDeck, slide: PanelId.aiSlide } as const;

/** The chat a scope's tool shows now. */
function threadOf(editor: Editor, scope: FixScope) {
  const ai = aiOf(editor);
  const first = threadIdOf(scope);
  return ai.sessions.thread(scope, ai.agent.shown.getState()[first] ?? first);
}

/** Whether the session of a scope has the tools its fix action cannot do without. */
export function canFixWithAi(editor: Editor, kind: FixScope['kind']): boolean {
  const tools = aiOf(editor).tools(kind);
  return ACTIONS[ACTION[kind]].needs.every((tool) => tools.has(tool));
}

/**
 * Sends the fix action to the chat of the deck, or of one slide, and shows that chat. A slide's
 * chat belongs to the slide on the Stage, so the Stage goes to the slide first. False when the
 * chat is in a turn or lacks a tool the action needs: nothing was sent.
 */
export function fixWithAi(editor: Editor, scope: FixScope): boolean {
  if (!canFixWithAi(editor, scope.kind)) return false;
  if (scope.kind === 'slide') editor.selection.getState().setCurrentSlide(scope.slideId);
  const thread = threadOf(editor, scope);
  if (thread.store.getState().busy) return false;
  const action = { id: ACTION[scope.kind], params: {} };
  void thread.send(
    actionMessage({
      action: action.id,
      replyIn: i18n.language === 'he' ? 'Hebrew' : 'English',
    }),
    { action, label: actionLabel(i18n.getFixedT(null, 'ai'), action) },
  );
  openPanel(PANEL[scope.kind], 'chat');
  return true;
}

/** Whether the deck's chat is in a turn: the agent takes one request at a time. */
export function useDeckChatBusy(): boolean {
  const editor = useEditor();
  const ai = aiOf(editor);
  const first = threadIdOf({ kind: 'deck' });
  const id = useStore(ai.agent.shown, (shown) => shown[first] ?? first);
  const thread = useMemo(() => ai.sessions.thread({ kind: 'deck' }, id), [ai, id]);
  return useStore(thread.store, (s) => s.busy);
}
