import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from '@slidr/ui/icons';
import { cx, Icon, Tooltip, type LucideIcon } from '@slidr/ui';
import { useDeck, useEditor, useFile, type Editor } from './editor';
import { documentName, prepareToClose } from './fileActions';
import { DocumentEndTools, DocumentStartTools } from './DocumentTools';
import { useShell } from './store';
import { watchToolFocus } from './toolFocus';

/**
 * The custom title bar (DSN-03): the window has no OS frame (`decorations: false`). It drags the
 * window and double-click maximizes (Tauri's `data-tauri-drag-region`), shows the document name,
 * and keeps the window controls on the right in both interface languages.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const title = useDeck((s) => s.deck.meta.title);
  const path = useFile((s) => s.path);
  const dirty = useFile((s) => s.dirty);
  const starting = useFile((s) => s.starting);
  const welcome = useShell((s) => s.welcome);
  const header = useRef<HTMLElement>(null);
  const name = path ? documentName(path, title) : null;
  useEffect(() => (header.current ? watchToolFocus(header.current) : undefined), []);

  return (
    <header
      ref={header}
      data-testid="title-bar"
      data-pane={welcome ? undefined : 'document'}
      className="editor-header relative flex h-titlebar shrink-0 items-center gap-3"
    >
      {!welcome && (
        <div inert={starting} aria-busy={starting || undefined}>
          <DocumentStartTools />
        </div>
      )}
      <div data-tauri-drag-region className="min-w-0 flex-1 self-stretch" />
      <div
        data-tauri-drag-region
        className={cx(
          'pointer-events-none absolute inset-0 flex items-center justify-center',
          welcome ? 'px-40' : 'px-80',
        )}
      >
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="flex shrink-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8" draggable={false} />
            <span className="text-lg font-semibold">{t('app.name')}</span>
          </span>
          {name && (
            <>
              <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-ui-header-fg" />
              <span
                dir="auto"
                className="min-w-0 truncate text-sm font-medium"
                data-testid="document-name"
              >
                {name}
              </span>
            </>
          )}
          {dirty && (
            <span
              role="img"
              aria-label={t('window.unsaved')}
              className="size-1.5 shrink-0 rounded-full bg-ui-header-fg"
            />
          )}
        </div>
      </div>
      {!welcome && (
        <div inert={starting} aria-busy={starting || undefined}>
          <DocumentEndTools />
        </div>
      )}
      <div className="flex shrink-0 items-stretch self-stretch rtl:order-first">
        <WindowControls />
      </div>
    </header>
  );
}

function CaptionButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): ReactNode {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cx(
          'inline-flex w-caption cursor-default items-center justify-center text-ui-header-fg transition-colors focus-visible:-outline-offset-2',
          danger
            ? 'hover:bg-ui-danger hover:text-ui-on-danger active:bg-ui-danger-hover active:text-ui-on-danger'
            : 'hover:bg-ui-header-hover active:bg-ui-header-pressed',
        )}
      >
        <Icon icon={icon} />
      </button>
    </Tooltip>
  );
}

function WindowControls() {
  const { t } = useTranslation();
  const editor = useEditor();
  const maximized = useMaximized();
  useCloseGuard(editor);
  const appWindow = () => getCurrentWindow();
  // In a plain browser there is no window to control; the buttons are drawn but inert.
  const run = (action: () => Promise<unknown>) => () => {
    if (isTauri()) void action();
  };

  return (
    <div dir="ltr" className="flex items-stretch" data-testid="window-controls">
      <CaptionButton
        icon={Minus}
        label={t('window.minimize')}
        onClick={run(() => appWindow().minimize())}
      />
      <CaptionButton
        icon={maximized ? Copy : Square}
        label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={run(() => appWindow().toggleMaximize())}
      />
      <CaptionButton
        icon={X}
        label={t('window.close')}
        danger
        // Asks to close, like Alt+F4 and the taskbar do; `useCloseGuard` answers.
        onClick={run(() => appWindow().close())}
      />
    </div>
  );
}

/**
 * Every way of closing the window (the close button, Alt+F4, the taskbar) first settles unsaved
 * changes and lets go of the workspace. Cancelling the question keeps the window open.
 */
function useCloseGuard(editor: Editor): void {
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await prepareToClose(editor))) event.preventDefault();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [editor]);
}

/** Whether the window is maximized, for the maximize / restore button. */
function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let alive = true;
    const update = () => {
      void appWindow.isMaximized().then((value) => alive && setMaximized(value));
    };
    update();
    const unlisten = appWindow.onResized(update);
    return () => {
      alive = false;
      void unlisten.then((stop) => stop());
    };
  }, []);
  return maximized;
}
