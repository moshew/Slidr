import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@slidr/ui';
import {
  ClipboardList,
  ClipboardPaste,
  ClipboardType,
  Copy,
  Link,
  RemoveFormatting,
  Scissors,
  TextSelect,
} from '@slidr/ui/icons';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../shell';
// By file: the shell's index does not hand out the registry's hooks.
import { useShortcut } from '../shell/registry';
import { clearFormatting, linkTarget, toggleBold, toggleMark } from './actions';
import { pasteAs, pasteTextBox } from './pasteActions';
import { requestLink } from './toolbar/LinkTool';
import { CLEAR_KEYS, LINK_KEYS, useText, type Text } from './toolbar/shared';

/*
 * The right-click menu of text that is being edited in place (STG-06; ADR-060 left the browser's
 * own menu there): cut, copy and the kinds of paste, then the link and the character tools that
 * make sense at a caret. The parts are registered with the Stage's menu (`ofEditedText`), and each
 * item calls what its key or its button of row B calls.
 */

/** The text that is being edited, with its editor. */
function useEdited(): (Text & { view: EditorView }) | null {
  const text = useText();
  return text?.target.kind === 'editor' ? { ...text, view: text.target.view } : null;
}

/**
 * Runs once the menu that was clicked has closed: until then the menu holds the keyboard, and a
 * copy would be the menu's and not the text's.
 */
function afterMenu(run: () => void, tries = 30): void {
  if (tries === 0 || !document.querySelector('[role="menu"]')) return run();
  setTimeout(() => afterMenu(run, tries - 1), 10);
}

/**
 * Asks the browser for a `copy` or `cut` event in the text, which the editor answers exactly as
 * it answers Ctrl+C and Ctrl+X: there is no second way to the clipboard.
 */
function clipboardCommand(view: EditorView, command: 'copy' | 'cut'): void {
  afterMenu(() => {
    if (view.isDestroyed) return;
    view.focus();
    try {
      document.execCommand(command);
    } catch {
      // Refused by the browser: nothing was copied, and nothing was removed.
    }
  });
}

/** Cut, copy, paste, and the three kinds of paste people know from other editors. */
export function TextClipboardItems() {
  const { t } = useTranslation('text');
  const editor = useEditor();
  const edited = useEdited();
  const sourceKeys = useShortcut('text.pasteSource')?.keys;
  if (!edited) return null;
  const { view } = edited;
  const nothing = view.state.selection.empty;
  return (
    <>
      <ContextMenuItem
        icon={Scissors}
        shortcut="Ctrl+X"
        disabled={nothing}
        onSelect={() => clipboardCommand(view, 'cut')}
      >
        {t('menu.cut')}
      </ContextMenuItem>
      <ContextMenuItem
        icon={Copy}
        shortcut="Ctrl+C"
        disabled={nothing}
        onSelect={() => clipboardCommand(view, 'copy')}
      >
        {t('menu.copy')}
      </ContextMenuItem>
      <ContextMenuItem
        icon={ClipboardPaste}
        shortcut="Ctrl+V"
        onSelect={() => void pasteAs(editor, 'auto')}
      >
        {t('menu.paste')}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger icon={ClipboardList}>{t('menu.pasteAs')}</ContextMenuSubTrigger>
        <ContextMenuSubContent data-testid="text-menu-paste">
          <ContextMenuItem shortcut={sourceKeys} onSelect={() => void pasteAs(editor, 'source')}>
            {t('paste.source')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void pasteAs(editor, 'match')}>
            {t('paste.match')}
          </ContextMenuItem>
          <ContextMenuItem shortcut="Ctrl+Shift+V" onSelect={() => void pasteAs(editor, 'plain')}>
            {t('paste.plain')}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  );
}

/**
 * On the slide itself: the text of the clipboard as a new text box, in the kind of paste that is
 * chosen. The "Paste" above it pastes what was copied in Slidr, objects and slides.
 */
export function PasteTextItems() {
  const { t } = useTranslation('text');
  const editor = useEditor();
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger icon={ClipboardType}>{t('menu.pasteText')}</ContextMenuSubTrigger>
      <ContextMenuSubContent data-testid="stage-menu-paste-text">
        <ContextMenuItem onSelect={() => void pasteTextBox(editor, 'source')}>
          {t('paste.source')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void pasteTextBox(editor, 'match')}>
          {t('paste.matchDeck')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void pasteTextBox(editor, 'plain')}>
          {t('paste.plain')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** The link, bold, italic and underline, "clear formatting" and "select all". */
export function TextFormatItems() {
  const { t } = useTranslation('text');
  const edited = useEdited();
  if (!edited) return null;
  const { target, ctx, format, view } = edited;
  const step = { label: t('step.format') };
  const linkable = linkTarget(view.state) !== null;
  return (
    <>
      <ContextMenuItem
        icon={Link}
        shortcut={LINK_KEYS}
        disabled={!linkable}
        // Once the menu has closed: the popover it opens must not be taken for a click outside.
        onSelect={() => afterMenu(requestLink)}
      >
        {format.link ? t('menu.editLink') : t('menu.link')}
      </ContextMenuItem>
      <ContextMenuCheckboxItem
        shortcut="Ctrl+B"
        checked={format.bold}
        onCheckedChange={() => toggleBold(target, ctx, step)}
      >
        {t('bold')}
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        shortcut="Ctrl+I"
        checked={format.italic}
        onCheckedChange={() => toggleMark(target, ctx, 'italic', step)}
      >
        {t('italic')}
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        shortcut="Ctrl+U"
        checked={format.underline}
        onCheckedChange={() => toggleMark(target, ctx, 'underline', step)}
      >
        {t('underline')}
      </ContextMenuCheckboxItem>
      <ContextMenuItem
        icon={RemoveFormatting}
        shortcut={CLEAR_KEYS}
        onSelect={() => clearFormatting(target, { label: t('step.clear') })}
      >
        {t('clear')}
      </ContextMenuItem>
      <ContextMenuItem
        icon={TextSelect}
        shortcut="Ctrl+A"
        onSelect={() =>
          afterMenu(() => {
            if (!view.isDestroyed) selectAll(view);
          })
        }
      >
        {t('menu.selectAll')}
      </ContextMenuItem>
    </>
  );
}

/** All the text of the editor, from the start of its first line to the end of its last. */
function selectAll(view: EditorView): void {
  const { state } = view;
  view.focus();
  view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)),
  );
}
