import { Icon, Spinner } from '@slidr/ui';
import { CircleAlert } from '@slidr/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeLanguage, CodeView } from './codeView';

export interface CodeEditorProps {
  language: CodeLanguage;
  /** The text the deck holds. */
  value: string;
  /** The accessible name of the editor. */
  label: string;
  /** Whether a text is what this editor wrote itself: then the deck showing it is not news. */
  own: (text: string) => boolean;
  onChange: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * A code editor for HTML or CSS (HTM-04). The editor itself is CodeMirror, loaded when the first
 * one is shown; until then this draws a line that says so.
 *
 * The text is the deck's: what is typed is reported at once, and a text that comes from
 * elsewhere (an undo, the agent, an edit on the Stage) replaces what the editor shows.
 */
export function CodeEditor({
  language,
  value,
  label,
  own,
  onChange,
  onUndo,
  onRedo,
}: CodeEditorProps) {
  const { t } = useTranslation('objects');
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CodeView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // The view is made once; it calls what the latest render gave.
  const latest = useRef({ value, own, onChange, onUndo, onRedo });
  useEffect(() => {
    latest.current = { value, own, onChange, onUndo, onRedo };
  });

  useEffect(() => {
    let gone = false;
    import('./codeView').then(
      ({ createCodeView }) => {
        if (gone || !host.current) return;
        view.current = createCodeView(host.current, {
          language,
          label,
          text: latest.current.value,
          onChange: (text) => latest.current.onChange(text),
          onUndo: () => latest.current.onUndo(),
          onRedo: () => latest.current.onRedo(),
        });
        setState('ready');
      },
      () => {
        if (!gone) setState('failed');
      },
    );
    return () => {
      gone = true;
      view.current?.destroy();
      view.current = null;
    };
  }, [language, label]);

  // Only a change of the deck's text is looked at: between two writes the deck is behind what
  // was typed, and showing its text then would take the last keys back.
  const shown = useRef(value);
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    if (!latest.current.own(value)) view.current?.set(value);
  }, [value]);

  return (
    <div data-testid="code-editor" data-state={state} className="min-w-0">
      {state === 'loading' && (
        <div role="status" className="flex items-center gap-2 py-3 text-xs text-ui-fg-muted">
          <Spinner />
          {t('code.loading')}
        </div>
      )}
      {state === 'failed' && (
        <div role="alert" className="flex items-center gap-2 py-3 text-xs text-ui-danger-fg">
          <Icon icon={CircleAlert} />
          {t('code.failed')}
        </div>
      )}
      <div ref={host} />
    </div>
  );
}
