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
 * the AI tool already has (ADR-045): "fix the design findings" of the deck and of one slide. The
 * action is a message of the AI chat (ADR-072), so it shows there, runs under the quality gate,
 * and is one step to undo like any turn. The agent runs the check itself (`deck_lint`,
 * `slide_lint`), on the deck as it is when its turn starts.
 */

/** What to fix: the whole deck, or one slide. */
export type FixTarget = { kind: 'deck' } | { kind: 'slide'; slideId: string };

const ACTION: Record<FixTarget['kind'], ActionId> = { deck: 'deck.fix', slide: 'slide.fix' };

const DECK = { kind: 'deck' } as const;

/** The conversation the AI chat shows now. */
function chatOf(editor: Editor) {
  const ai = aiOf(editor);
  const first = threadIdOf(DECK);
  return ai.sessions.thread(DECK, ai.agent.shown.getState()[first] ?? first);
}

/** Whether the chat has the tools a fix action cannot do without. */
export function canFixWithAi(editor: Editor, kind: FixTarget['kind']): boolean {
  const tools = aiOf(editor).tools('deck');
  return ACTIONS[ACTION[kind]].needs.every((tool) => tools.has(tool));
}

/**
 * Sends the fix action of the deck, or of one slide, to the AI chat, and shows the chat. For a
 * slide the Stage goes to it first, so the user sees what is being fixed. False when the chat is
 * in a turn or lacks a tool the action needs: nothing was sent.
 */
export function fixWithAi(editor: Editor, target: FixTarget): boolean {
  if (!canFixWithAi(editor, target.kind)) return false;
  const thread = chatOf(editor);
  if (thread.store.getState().busy) return false;
  let params = {};
  if (target.kind === 'slide') {
    const number = editor.bus.deck.slides.findIndex((slide) => slide.id === target.slideId) + 1;
    if (number === 0) return false;
    editor.selection.getState().setCurrentSlide(target.slideId);
    params = { slideId: target.slideId, slideNumber: number };
  }
  const action = { id: ACTION[target.kind], params };
  void thread.send(
    actionMessage({
      action: action.id,
      params,
      replyIn: i18n.language === 'he' ? 'Hebrew' : 'English',
    }),
    { action, label: actionLabel(i18n.getFixedT(null, 'ai'), action) },
  );
  // The conversation the action went to: the deck's, also from the one of an import.
  aiOf(editor).sessions.chat.setState('deck', true);
  openPanel(PanelId.ai, 'chat');
  return true;
}

/** Whether the AI chat is in a turn: the agent takes one request at a time. */
export function useDeckChatBusy(): boolean {
  const editor = useEditor();
  const ai = aiOf(editor);
  const first = threadIdOf(DECK);
  const id = useStore(ai.agent.shown, (shown) => shown[first] ?? first);
  const thread = useMemo(() => ai.sessions.thread(DECK, id), [ai, id]);
  return useStore(thread.store, (s) => s.busy);
}
