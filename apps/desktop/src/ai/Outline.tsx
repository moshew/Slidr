import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archetype } from '@slidr/model';
import { actionMessage } from '@slidr/prompts';
import { Button, Icon } from '@slidr/ui';
import { ListOrdered } from '@slidr/ui/icons';
import type { ChatThread } from '../agent/agentService';
import type { ToolPart } from '../agent/transcript';
import { actionLabel } from './actionLabels';

/*
 * The outline of a deck before it is built (AID-03, WG11-T05). The agent shows it with
 * `outline_propose` and ends its turn; the chat draws the call as a card, and under the latest
 * one puts the two answers that need no typing. Approving sends a message that says so, and the
 * deck is built in the turn that answers it. Turning it down sends nothing: the deck and the
 * conversation stay as they are, and the user may still type what they want instead.
 */

interface OutlineSlide {
  title: string;
  archetype?: string;
  note?: string;
}

/** The outline a call carried, as far as its arguments can be read: the transcript keeps them clipped. */
function outlineOf(input: unknown): { title?: string; slides: OutlineSlide[] } {
  const args =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const slides = Array.isArray(args.slides) ? args.slides : [];
  return {
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    slides: slides.flatMap((slide: unknown) => {
      if (typeof slide !== 'object' || slide === null) return [];
      const { title, archetype, note } = slide as Record<string, unknown>;
      if (typeof title !== 'string') return [];
      return [
        {
          title,
          ...(typeof archetype === 'string' ? { archetype } : {}),
          ...(typeof note === 'string' ? { note } : {}),
        },
      ];
    }),
  };
}

/** Outlines the user turned down in this window: their card keeps saying so. */
const turnedDown = new Set<string>();

export function OutlineCard({
  part,
  entryId,
  thread,
  open,
}: {
  part: ToolPart;
  /** The entry the call belongs to: what a turned-down outline is remembered by. */
  entryId: string;
  thread: ChatThread;
  /** The outline waits for an answer: it is the last thing in the chat, and no turn runs. */
  open: boolean;
}) {
  const { t, i18n } = useTranslation(['ai', 'templates']);
  const key = `${entryId}:${part.id}`;
  const [rejected, setRejected] = useState(turnedDown.has(key));
  const { title, slides } = outlineOf(part.input);
  const kind = (archetype: string | undefined) =>
    archetype && Archetype.safeParse(archetype).success
      ? t(`templates:archetype.${archetype as Archetype}`)
      : (archetype ?? '');

  const approve = () => {
    const action = { id: 'outline.approve' };
    void thread.send(
      actionMessage({
        action: 'outline.approve',
        replyIn: i18n.language === 'he' ? 'Hebrew' : 'English',
      }),
      { action, label: actionLabel(t, action) },
    );
  };
  const reject = () => {
    turnedDown.add(key);
    setRejected(true);
  };

  return (
    <section
      aria-label={t('ai:outline.title')}
      data-testid="outline"
      data-state={rejected ? 'rejected' : open ? 'open' : 'answered'}
      className="flex flex-col gap-2 rounded-panel border border-ui-line p-3"
    >
      <div className="flex items-start gap-2">
        <Icon icon={ListOrdered} className="mt-0.5 text-ui-fg-muted" />
        <div className="flex min-w-0 flex-col">
          <p dir="auto" className="text-start text-sm font-medium text-ui-fg">
            {title ?? t('ai:outline.title')}
          </p>
          <p className="text-xs text-ui-fg-muted">
            {t('ai:outline.count', { count: slides.length })}
          </p>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {slides.map((slide, index) => (
          <li key={index} data-testid="outline-slide" className="flex items-baseline gap-2">
            <span className="w-5 shrink-0 text-end text-xs text-ui-fg-muted">{index + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span dir="auto" className="text-start text-sm text-ui-fg">
                {slide.title}
              </span>
              <span dir="auto" className="text-start text-xs text-ui-fg-muted">
                {[kind(slide.archetype), slide.note].filter(Boolean).join(' · ')}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {rejected ? (
        <p role="status" className="text-xs text-ui-fg-muted">
          {t('ai:outline.rejected')}
        </p>
      ) : (
        open && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" data-testid="outline-approve" onClick={approve}>
                {t('ai:outline.approve')}
              </Button>
              <Button variant="ghost" size="sm" data-testid="outline-reject" onClick={reject}>
                {t('ai:outline.reject')}
              </Button>
            </div>
            <p className="text-xs text-ui-fg-muted">{t('ai:outline.hint')}</p>
          </div>
        )
      )}
    </section>
  );
}
