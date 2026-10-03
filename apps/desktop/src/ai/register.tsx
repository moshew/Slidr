import { useTranslation } from 'react-i18next';
import { Presentation, Zap } from '@slidr/ui/icons';
import { EmptyState } from '@slidr/ui';
import { registerMessages } from '../i18n';
import { PanelId, registerPanel } from '../shell';
import { Chat } from './Chat';
import { en, he } from './messages';

/*
 * The AI panels (WG11). Today: the deck tool's chat (WG11-T03), under the shell's own id for
 * it, so it takes the place of the placeholder. The slide and object tools (T06, T07) and the
 * actions (T04) keep their placeholders until they are built.
 */

registerMessages('ai', { he, en });

const DECK = { kind: 'deck' } as const;

function DeckChat() {
  return <Chat scope={DECK} />;
}

function DeckActions() {
  const { t } = useTranslation('ai');
  return (
    <EmptyState
      icon={Zap}
      title={t('actions.title')}
      description={t('actions.body')}
      className="min-h-80"
    />
  );
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
