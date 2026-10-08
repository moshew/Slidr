import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  FilePlus,
  FolderOpen,
  History,
  House,
  Keyboard,
  Play,
  Redo2,
  Save,
  Search,
  Share,
  SkipBack,
  Undo2,
} from '@slidr/ui/icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  IconButton,
} from '@slidr/ui';
import type { RecentFile } from '../document/storage';
import { useDeck, useEditor, useFile } from './editor';
import {
  newDocument,
  openDocument,
  recentFiles,
  saveDocument,
  saveDocumentAs,
} from './fileActions';
import { PanelId, useAction, usePanel, useShortcut } from './registry';
import { openPanel, setWelcome, showShortcuts } from './store';

/** Global document actions belong to the title bar, independently of the slide tools. */
export function DocumentStartTools() {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('tools.documentTools')}
      className="flex shrink-0 items-center gap-2"
    >
      <FileMenu />
      <div className="border-s border-ui-header-line ps-2">
        <UndoRedo />
      </div>
    </div>
  );
}

export function DocumentEndTools() {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('tools.presentationTools')}
      className="flex shrink-0 items-center gap-2"
    >
      <PresentButton />
    </div>
  );
}

/**
 * "Present" as a split button: the button itself does what its area registered (from the
 * current slide), and the arrow beside it opens the two ways to start, which are the
 * registered shortcuts F5 and Shift+F5: the menu does what the keys do.
 */
function PresentButton() {
  const { t } = useTranslation();
  const editor = useEditor();
  const run = useAction('present');
  const fromStart = useShortcut('present.fromStart');
  const fromCurrent = useShortcut('present.fromCurrent');
  const ways = [
    { shortcut: fromStart, label: 'keys.presentStart', icon: SkipBack },
    { shortcut: fromCurrent, label: 'keys.presentCurrent', icon: Play },
  ];
  return (
    <div className="flex items-center" data-testid="present-button">
      <Button
        variant="primary"
        icon={Play}
        disabled={!run}
        onClick={run}
        className="header-present rounded-e-none"
      >
        {t('tools.present')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            aria-label={t('tools.presentOptions')}
            disabled={!fromStart && !fromCurrent}
            className="header-present rounded-s-none border-s border-ui-header-line px-1.5"
          >
            <Icon icon={ChevronDown} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="present-menu">
          {ways.map(
            ({ shortcut, label, icon }) =>
              shortcut && (
                <DropdownMenuItem
                  key={shortcut.id}
                  icon={icon}
                  shortcut={shortcut.keys}
                  onSelect={() => shortcut.run(editor, new KeyboardEvent('keydown'))}
                >
                  {t(label)}
                </DropdownMenuItem>
              ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function UndoRedo() {
  const { t } = useTranslation();
  const { bus } = useEditor();
  const canUndo = useDeck((s) => s.canUndo);
  const canRedo = useDeck((s) => s.canRedo);
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        className="header-button"
        icon={Undo2}
        mirror
        label={t('tools.undo')}
        shortcut="Ctrl+Z"
        disabled={!canUndo}
        onClick={() => bus.undo()}
      />
      <IconButton
        className="header-button"
        icon={Redo2}
        mirror
        label={t('tools.redo')}
        shortcut="Ctrl+Y"
        disabled={!canRedo}
        onClick={() => bus.redo()}
      />
    </div>
  );
}

function FileMenu() {
  const { t } = useTranslation();
  const editor = useEditor();
  const busy = useFile((s) => s.busy);
  const [recent, setRecent] = useState<RecentFile[] | null>(null);
  const hasStorage = editor.document !== null;
  // Find and replace is another area's: the menu offers what its shortcut does, when it is there.
  const find = useShortcut('find.replace');
  const focusTaken = useRef(false);
  // So is HTML import: its panel asks for the file, and about the open document if it has work.
  const htmlImport = usePanel(PanelId.htmlImport);
  const runExport = useAction('export');

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && hasStorage) void recentFiles(editor).then(setRecent);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          iconEnd={ChevronDown}
          loading={busy !== null}
          className="header-button"
          data-testid="file-menu-trigger"
        >
          {t('file.menu')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (focusTaken.current) event.preventDefault();
          focusTaken.current = false;
        }}
      >
        <DropdownMenuItem
          icon={FilePlus}
          shortcut="Ctrl+N"
          onSelect={() => void newDocument(editor)}
        >
          {t('file.new')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={FolderOpen}
          shortcut="Ctrl+O"
          disabled={!hasStorage}
          onSelect={() => void openDocument(editor)}
        >
          {t('file.open')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={History} disabled={!hasStorage}>
            {t('file.recent')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-w-96">
            {recent?.length ? (
              recent.slice(0, 10).map((file) => (
                <DropdownMenuItem
                  key={file.path}
                  disabled={!file.exists}
                  hint={file.exists ? undefined : t('file.missing')}
                  onSelect={() => void openDocument(editor, file.path)}
                >
                  {file.title || file.path.split(/[\\/]/).at(-1)}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>{t('file.noRecent')}</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Save}
          shortcut="Ctrl+S"
          disabled={!hasStorage}
          onSelect={() => void saveDocument(editor)}
        >
          {t('file.save')}
        </DropdownMenuItem>
        <DropdownMenuItem
          shortcut="Ctrl+Shift+S"
          disabled={!hasStorage}
          onSelect={() => void saveDocumentAs(editor)}
          className="ps-8"
        >
          {t('file.saveAs')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {htmlImport && (
          <DropdownMenuItem icon={htmlImport.icon} onSelect={() => openPanel(htmlImport.id)}>
            {t('file.importHtml')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          icon={Share}
          disabled={!runExport}
          onSelect={() => {
            // The dialog takes the keyboard; closing the menu must leave it there.
            focusTaken.current = true;
            runExport?.();
          }}
        >
          {t('file.exportHtml')}
        </DropdownMenuItem>
        {find && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={Search}
              shortcut={find.keys}
              onSelect={() => {
                // The find bar takes the keyboard; the menu must not hand it back to its button.
                focusTaken.current = true;
                find.run(editor, new KeyboardEvent('keydown'));
              }}
            >
              {t('file.find')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Keyboard} shortcut="Ctrl+/" onSelect={() => showShortcuts()}>
          {t('keys.shortcuts')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={House} onSelect={() => setWelcome(true, true)}>
          {t('welcome.show')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
