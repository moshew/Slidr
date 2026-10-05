import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { SessionScope } from '@slidr/agent-tools';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '@slidr/ui';
import { History, SquarePen } from '@slidr/ui/icons';
import type { ChatThread, Conversation } from '../agent/agentService';
import { useEditor } from '../shell';
import { actionLabel } from './actionLabels';
import { agentOf } from './runtime';
import { conversationUsage, formatCost, formatTokens, tokensOf } from './usage';

/*
 * The bar over a chat (CHT-U06, CHT-U07): the conversations its tool keeps, a new one, and
 * what the conversation on screen has cost so far, as the harness reported it turn by turn.
 */

/** The title of a conversation: the start of its first message, or the name of the action it began with. */
function useTitle() {
  const { t } = useTranslation('ai');
  return ({ title }: Conversation) => {
    if (!title) return t('conversations.untitled');
    return title.startsWith('action:') ? actionLabel(t, { id: title.slice(7) }) : title;
  };
}

export function ConversationBar({ scope, thread }: { scope: SessionScope; thread: ChatThread }) {
  const { t, i18n } = useTranslation('ai');
  const agent = agentOf(useEditor());
  const entries = useStore(thread.store, (s) => s.entries);
  const [list, setList] = useState<Conversation[]>([]);
  const titleOf = useTitle();
  const used = conversationUsage(entries);
  const when = (iso: string | undefined) =>
    iso
      ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
      : '';

  return (
    <div className="flex h-control shrink-0 items-center gap-1 px-2">
      <DropdownMenu
        onOpenChange={(open) => {
          // Read when asked for: another window, or a turn that just ended, may have added one.
          if (open) void agent.conversations(scope).then(setList);
        }}
      >
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={History}
            size="sm"
            label={t('conversations.list')}
            data-testid="conversations"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-80">
          <DropdownMenuLabel>{t('conversations.heading')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={thread.id}
            onValueChange={(id) => agent.showConversation(scope, id)}
          >
            {list.map((conversation) => (
              <DropdownMenuRadioItem
                key={conversation.id}
                value={conversation.id}
                data-conversation={conversation.id}
                // Room for the two lines: an item of a menu is as high as one.
                className="min-h-10"
              >
                {/* Two lines: a long first message is cut, and when it was said stays whole. */}
                <span className="flex min-w-0 flex-col items-start">
                  {/* The words read in their own direction, and start where the list starts. */}
                  <span dir="auto" className="max-w-full truncate">
                    {titleOf(conversation)}
                  </span>
                  {conversation.updatedAt && (
                    <span className="text-xs text-ui-fg-muted">{when(conversation.updatedAt)}</span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="min-w-0 flex-1" />
      {used.turns > 0 && (
        <Tooltip
          content={t('usage.detail', {
            input: formatTokens(used.usage.inputTokens),
            output: formatTokens(used.usage.outputTokens),
            cacheRead: formatTokens(used.usage.cacheReadTokens),
            cacheWrite: formatTokens(used.usage.cacheWriteTokens),
          })}
        >
          <span
            data-testid="chat-cost"
            data-cost={used.costUsd}
            data-turns={used.turns}
            className="truncate text-xs text-ui-fg-muted"
          >
            {/* A harness that reported no cost for any turn has only tokens to show. */}
            {used.uncosted < used.turns
              ? t('usage.total', { cost: formatCost(used.costUsd) })
              : t('usage.totalTokens', { tokens: formatTokens(tokensOf(used.usage)) })}
          </span>
        </Tooltip>
      )}
      <IconButton
        icon={SquarePen}
        size="sm"
        label={t('conversations.new')}
        disabled={entries.length === 0}
        data-testid="conversation-new"
        onClick={() => agent.newConversation(scope)}
      />
    </div>
  );
}
