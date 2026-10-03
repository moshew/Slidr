import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from '@slidr/ui/icons';
import { cx, Icon, Tooltip, type LucideIcon } from '@slidr/ui';
import { useDeck, useEditor, useFile } from './editor';
import { documentName, prepareToClose } from './fileActions';

/**
 * The custom title bar (DSN-03): the window has no OS frame (`decorations: false`). It drags the
 * window and double-click maximizes (Tauri's `data-tauri-drag-region`), shows the document name,
 * and has the window controls at the end, which mirrors them in Hebrew as Windows does.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const title = useDeck((s) => s.deck.meta.title);
  const path = useFile((s) => s.path);
  const dirty = useFile((s) => s.dirty);
  const name = documentName(path, title);

  return (
    <header
      data-tauri-drag-region
      data-testid="title-bar"
      className="flex h-titlebar shrink-0 items-center border-b border-ui-line bg-ui-chrome"
    >
      <div data-tauri-drag-region className="flex flex-1 items-center">
        <span className="pointer-events-none flex w-activitybar items-center justify-center">
          <img src="/favicon.svg" alt="" className="size-4.5" draggable={false} />
        </span>
        <span className="pointer-events-none text-xs font-medium text-ui-fg-muted">
          {t('app.name')}
        </span>
      </div>
      <div className="pointer-events-none flex min-w-0 items-center gap-2 px-4">
        <span className="truncate text-xs font-medium text-ui-fg" data-testid="document-name">
          {name}
        </span>
        {dirty && (
          <span
            role="img"
            aria-label={t('window.unsaved')}
            className="size-1.5 shrink-0 rounded-full bg-ui-fg-muted"
          />
        )}
      </div>
      <div data-tauri-drag-region className="flex flex-1 items-stretch justify-end self-stretch">
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
          'inline-flex w-caption cursor-default items-center justify-center text-ui-fg-muted transition-colors focus-visible:-outline-offset-2',
          danger
            ? 'hover:bg-ui-danger hover:text-ui-on-danger active:bg-ui-danger-hover active:text-ui-on-danger'
            : 'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed',
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
  const appWindow = () => getCurrentWindow();
  // In a plain browser there is no window to control; the buttons are drawn but inert.
  const run = (action: () => Promise<unknown>) => () => {
    if (isTauri()) void action();
  };

  return (
    <div className="flex items-stretch" data-testid="window-controls">
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
        onClick={run(async () => {
          if (await prepareToClose(editor)) await appWindow().close();
        })}
      />
    </div>
  );
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
