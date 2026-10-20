import { create } from 'zustand';
import { Button, Dialog, DialogContent, type ButtonVariant } from '@slidr/ui';
import { i18n } from '../i18n';

/*
 * Questions and messages from code that is not a component, such as the File menu flows:
 * `await ask({...})` shows a dialog and resolves with the id of the button pressed.
 */

export interface DialogAction {
  id: string;
  label: string;
  variant?: ButtonVariant;
}

export interface DialogRequest {
  title: string;
  body?: string;
  /** In display order; the main action goes last. */
  actions: DialogAction[];
  /** What Esc, the scrim and the close button answer. */
  cancelId: string;
}

interface Pending extends DialogRequest {
  resolve: (id: string) => void;
}

const useDialogs = create<{ pending: Pending | null }>(() => ({ pending: null }));

export function ask(request: DialogRequest): Promise<string> {
  // One question at a time: an unanswered one is cancelled.
  const previous = useDialogs.getState().pending;
  previous?.resolve(previous.cancelId);
  return new Promise((resolve) => useDialogs.setState({ pending: { ...request, resolve } }));
}

/** A message with one OK button, e.g. an error. */
export async function tell(title: string, body?: string): Promise<void> {
  await ask({
    title,
    body,
    actions: [{ id: 'ok', label: i18n.t('file.ok'), variant: 'primary' }],
    cancelId: 'ok',
  });
}

/** The question on screen, if any. */
export function pendingDialog(): DialogRequest | null {
  return useDialogs.getState().pending;
}

/** Answers the question on screen as if its button `id` were pressed. */
export function answer(id: string): void {
  const pending = useDialogs.getState().pending;
  if (!pending) return;
  useDialogs.setState({ pending: null });
  pending.resolve(id);
}

/** Renders the pending question. Mounted once by the shell. */
export function DialogHost() {
  const pending = useDialogs((s) => s.pending);
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => !open && pending && answer(pending.cancelId)}
    >
      {pending && (
        <DialogContent
          title={pending.title}
          description={pending.body}
          footer={pending.actions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? 'secondary'}
              onClick={() => answer(action.id)}
            >
              {action.label}
            </Button>
          ))}
        />
      )}
    </Dialog>
  );
}
