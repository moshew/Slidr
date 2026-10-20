import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findSlide, newId } from '@slidr/model';
import { NotebookPen } from '@slidr/ui/icons';
import { useDeck, useEditor, useSelection } from './editor';
import { notesFromText, notesText } from './notes';
import { PanelEmpty } from './ToolPanel';

/** Keys this close together are one undo step, as on the Stage. */
const BURST_MS = 800;

/**
 * The Notes panel (SPEC 4.2, panel 7): the speaker notes of the current slide, as plain text.
 * Every key writes the notes to the deck, and a burst of typing is one undo step. Inside the
 * field Ctrl+Z is the field's own, as in every text field of the app.
 */
export function NotesPanel() {
  const { t } = useTranslation();
  const { bus } = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  const notes = useDeck((s) => (slideId ? findSlide(s.deck, slideId)?.notes : undefined));
  const stored = notesText(notes);
  // What is being typed, while it differs from what the deck gives back: trailing spaces and
  // empty lines of a field that is otherwise empty are not notes, but they are being typed.
  const [draft, setDraft] = useState<{ slideId: string; text: string } | null>(null);
  const burst = useRef<{ txId: string; at: number; slideId: string } | null>(null);

  const typed = draft && draft.slideId === slideId ? draft.text : null;
  const drafted = typed === null ? null : notesText(notesFromText(typed, notes) ?? undefined);
  // When the deck changed under the field (an undo, the agent), what was typed no longer says
  // what the deck holds, and what the deck says is what shows.
  const value = typed !== null && drafted === stored ? typed : stored;

  if (!slideId) {
    return <PanelEmpty icon={NotebookPen} title={t('notes.noSlide')} />;
  }

  const write = (text: string) => {
    setDraft({ slideId, text });
    const next = notesFromText(text, notes);
    if (notesText(next ?? undefined) === stored && (next === null) === (notes === undefined)) {
      return;
    }
    const now = performance.now();
    const last = burst.current;
    if (!last || last.slideId !== slideId || now - last.at > BURST_MS) {
      burst.current = { txId: newId('tx'), at: now, slideId };
    } else last.at = now;
    bus.dispatch(
      { type: 'slide.update', slideId, patch: { notes: next } },
      { txId: burst.current?.txId, label: t('notes.step') },
    );
  };

  return (
    <div className="px-4 pb-4">
      <textarea
        data-testid="notes-field"
        dir="auto"
        value={value}
        aria-label={t('panels.notes')}
        placeholder={t('notes.placeholder')}
        onChange={(event) => write(event.target.value)}
        onBlur={() => {
          setDraft(null);
          burst.current = null;
        }}
        className="field-sizing-content min-h-40 w-full resize-none rounded-control border border-ui-line-strong bg-ui-field px-3 py-2 text-md leading-6 text-ui-fg outline-none placeholder:text-ui-fg-muted hover:border-ui-fg-subtle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ui-focus"
      />
      <p className="pt-2 text-xs text-ui-fg-muted">{t('notes.hint')}</p>
    </div>
  );
}
