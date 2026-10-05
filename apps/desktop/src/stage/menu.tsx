import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { findElement, findSlide, type Element, type Slide } from '@slidr/model';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@slidr/ui';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crop,
  EyeOff,
  Group,
  Layers2,
  Lock,
  LockOpen,
  LogIn,
  Scissors,
  Sparkles,
  Spline,
  SquareDashedMousePointer,
  Table2,
  TextCursorInput,
  Trash2,
  Ungroup,
  type LucideIcon,
} from '@slidr/ui/icons';
import { abilities, type Abilities } from '../arrange/abilities';
import {
  align,
  distribute,
  duplicate,
  group,
  hide,
  remove,
  reorder,
  toggleLock,
  ungroup,
} from '../arrange/actions';
import { canPaste, pasteFromMemory } from '../arrange/clipboard';
import { openData } from '../chart/session';
import {
  aiKinds,
  openAiChat,
  useDeck,
  useEditor,
  useSelection,
  type ContextToolProps,
  type Editor,
} from '../shell';
import { enterTable } from '../table/session';
import { stageCommand } from './keyboardSession';
import { ORDER_MOVES } from './SelectionToolbar';

/*
 * The Stage's right-click menu (STG-06), part by part. The Stage has already made what was
 * clicked the selection, so every part acts on the selection, with the same functions the
 * toolbars and the shortcuts call: a menu item and its shortcut cannot drift apart. A part
 * draws nothing where it has nothing to offer; `register.tsx` says which kinds each is for.
 *
 * Inside a table (its cells are selected, not the table) the menu is about the cells: the parts
 * here step aside, except copy and cut, and the table area adds its rows and columns.
 */

interface MenuTarget {
  editor: Editor;
  slide: Slide | undefined;
  /** The one selected element; undefined for none and for several. */
  single: Element | undefined;
  can: Abilities;
  /** The user is working among the cells of the selected table. */
  inTable: boolean;
}

function useMenuTarget(): MenuTarget {
  const editor = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  const can = useMemo(() => abilities(slide, ids), [slide, ids]);
  const single = slide && ids.length === 1 && ids[0] ? findElement(slide, ids[0]) : undefined;
  return {
    editor,
    slide,
    single,
    can,
    inTable: single?.type === 'table' && editingId === single.id,
  };
}

/**
 * Asks the browser for a `copy` or `cut` event, which the clipboard listeners of the areas answer
 * exactly as they answer Ctrl+C and Ctrl+X: elements on the slide, cells inside a table. A click,
 * unlike the key, gets no other way to the system clipboard.
 */
function clipboardCommand(command: 'copy' | 'cut'): void {
  try {
    document.execCommand(command);
  } catch {
    // Refused by the browser: nothing was copied, and nothing was removed.
  }
}

/* ---------------------------------------------------------------- clipboard */

/** Cut, copy, paste, duplicate and delete; on the empty slide, paste and select all. */
export function ClipboardItems({ kind }: ContextToolProps) {
  const { t } = useTranslation();
  const { editor, slide, can, inTable } = useMenuTarget();
  const paste = (
    <ContextMenuItem
      icon={ClipboardPaste}
      shortcut="Ctrl+V"
      disabled={!canPaste()}
      onSelect={() => pasteFromMemory(editor)}
    >
      {t('stage:menu.paste')}
    </ContextMenuItem>
  );
  if (kind === 'none') {
    const all = slide?.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id) ?? [];
    return (
      <>
        {paste}
        <ContextMenuItem
          icon={SquareDashedMousePointer}
          shortcut="Ctrl+A"
          disabled={all.length === 0}
          onSelect={() => editor.selection.getState().selectElements(all)}
        >
          {t('stage:menu.selectAll')}
        </ContextMenuItem>
      </>
    );
  }
  return (
    <>
      <ContextMenuItem
        icon={Scissors}
        shortcut="Ctrl+X"
        disabled={!inTable && !can.remove}
        onSelect={() => clipboardCommand('cut')}
      >
        {t('stage:menu.cut')}
      </ContextMenuItem>
      <ContextMenuItem icon={Copy} shortcut="Ctrl+C" onSelect={() => clipboardCommand('copy')}>
        {t('stage:menu.copy')}
      </ContextMenuItem>
      {/* Among the cells a paste is text from the system clipboard, which only Ctrl+V can read. */}
      {!inTable && (
        <>
          {paste}
          <ContextMenuItem icon={CopyPlus} shortcut="Ctrl+D" onSelect={() => duplicate(editor)}>
            {t('arrange:menu.duplicate')}
          </ContextMenuItem>
          <ContextMenuItem
            icon={Trash2}
            shortcut="Del"
            tone="danger"
            disabled={!can.remove}
            onSelect={() => remove(editor)}
          >
            {t('arrange:menu.delete')}
          </ContextMenuItem>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- the element's own way in */

/** What Enter and a double click do to this element, by its type, said in words. */
export function EditItems(_: ContextToolProps) {
  const { t } = useTranslation();
  const { editor, single, inTable } = useMenuTarget();
  const assets = useDeck((s) => s.deck.assets);
  if (!single || single.locked || inTable) return null;
  const { selection } = editor;
  const edit = (label: string, icon: LucideIcon, run: () => void) => (
    <ContextMenuItem icon={icon} shortcut="Enter" onSelect={run}>
      {label}
    </ContextMenuItem>
  );
  const startEditing = () => selection.getState().startEditing(single.id);
  switch (single.type) {
    case 'text':
      return edit(t('stage:menu.editText'), TextCursorInput, startEditing);
    case 'shape': {
      const hasText = single.content?.paragraphs.some((p) => p.runs.some((r) => r.text !== ''));
      return edit(
        t(hasText ? 'stage:menu.editText' : 'stage:menu.addText'),
        TextCursorInput,
        startEditing,
      );
    }
    case 'html':
      // One with scripts runs in a frame the editor cannot reach into (HTM-03).
      return single.hasScripts
        ? null
        : edit(t('stage:menu.editText'), TextCursorInput, startEditing);
    case 'image': {
      const asset = single.assetId ? assets[single.assetId] : undefined;
      return asset?.width && asset.height ? edit(t('stage:menu.crop'), Crop, startEditing) : null;
    }
    case 'group':
      return edit(t('stage:menu.enterGroup'), LogIn, () =>
        selection
          .getState()
          .selectElements(single.children.filter((c) => !c.locked && !c.hidden).map((c) => c.id)),
      );
    case 'table':
      return edit(t('stage:menu.editCells'), Table2, () => enterTable(selection, single.id));
    case 'line':
      // Its points: Tab goes from one to the next, and the arrows move it (UI-06).
      return edit(t('stage:menu.editPoints'), Spline, () => stageCommand({ type: 'points' }));
    case 'chart':
      return (
        <ContextMenuItem icon={Table2} onSelect={() => openData(single.id)}>
          {t('stage:menu.editData')}
        </ContextMenuItem>
      );
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- order and alignment */

const toSlide: { edge: Parameters<typeof align>[1]; icon: LucideIcon }[] = [
  { edge: 'left', icon: AlignStartVertical },
  { edge: 'center', icon: AlignCenterVertical },
  { edge: 'right', icon: AlignEndVertical },
  { edge: 'top', icon: AlignStartHorizontal },
  { edge: 'middle', icon: AlignCenterHorizontal },
  { edge: 'bottom', icon: AlignEndHorizontal },
];
const spread: { axis: Parameters<typeof distribute>[1]; icon: LucideIcon }[] = [
  { axis: 'horizontal', icon: AlignHorizontalSpaceAround },
  { axis: 'vertical', icon: AlignVerticalSpaceAround },
];

/** The layer order, and alignment against the slide, each as a sub-menu. */
export function OrderItems(_: ContextToolProps) {
  const { t } = useTranslation();
  const { editor, can, inTable } = useMenuTarget();
  if (can.count === 0 || inTable) return null;
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger icon={Layers2}>{t('stage:menu.order')}</ContextMenuSubTrigger>
        <ContextMenuSubContent data-testid="stage-menu-order">
          {ORDER_MOVES.map(({ to, icon, shortcut }) => (
            <ContextMenuItem
              key={to}
              icon={icon}
              shortcut={shortcut}
              disabled={!can.order[to]}
              onSelect={() => reorder(editor, to)}
            >
              {t(`arrange:menu.${to}`)}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger icon={AlignCenterVertical} disabled={!can.toSlide}>
          {t('arrange:menu.toSlide')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent data-testid="stage-menu-align">
          {toSlide.map(({ edge, icon }) => (
            <ContextMenuItem key={edge} icon={icon} onSelect={() => align(editor, edge, 'slide')}>
              {t(`arrange:align.${edge}`)}
            </ContextMenuItem>
          ))}
          {can.count > 1 && (
            <>
              <ContextMenuSeparator />
              {spread.map(({ axis, icon }) => (
                <ContextMenuItem
                  key={axis}
                  icon={icon}
                  onSelect={() => distribute(editor, axis, 'slide')}
                >
                  {t(`arrange:distribute.${axis}`)}
                </ContextMenuItem>
              ))}
            </>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  );
}

/* ---------------------------------------------------------------- grouping */

/** "Group" for several elements of one parent, "ungroup" where a group is selected. */
export function GroupItems(_: ContextToolProps) {
  const { t } = useTranslation();
  const { editor, can } = useMenuTarget();
  if (!can.group && !can.ungroup) return null;
  return (
    <>
      {can.group && (
        <ContextMenuItem icon={Group} shortcut="Ctrl+G" onSelect={() => group(editor)}>
          {t('arrange:menu.group')}
        </ContextMenuItem>
      )}
      {can.ungroup && (
        <ContextMenuItem icon={Ungroup} shortcut="Ctrl+Shift+G" onSelect={() => ungroup(editor)}>
          {t('arrange:menu.ungroup')}
        </ContextMenuItem>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- lock and hide */

export function StateItems(_: ContextToolProps) {
  const { t } = useTranslation();
  const { editor, can, inTable } = useMenuTarget();
  if (can.count === 0 || inTable) return null;
  return (
    <>
      <ContextMenuItem icon={can.allLocked ? LockOpen : Lock} onSelect={() => toggleLock(editor)}>
        {can.allLocked ? t('arrange:menu.unlock') : t('arrange:menu.lock')}
      </ContextMenuItem>
      <ContextMenuItem icon={EyeOff} onSelect={() => hide(editor)}>
        {t('arrange:menu.hide')}
      </ContextMenuItem>
    </>
  );
}

/* ---------------------------------------------------------------- AI */

/**
 * The way to the AI chat (SPEC 4.2, ADR-072): about the slide, or about what is selected on it.
 * The chat is the same one; what it is about goes to the agent with the message.
 */
export function AiItems({ kind }: ContextToolProps) {
  const { t } = useTranslation();
  if (kind !== 'none' && !aiKinds.has(kind)) return null;
  return (
    <ContextMenuItem icon={Sparkles} shortcut="Ctrl+L" onSelect={openAiChat}>
      {t(kind === 'none' ? 'tools.aiSlide' : 'tools.aiSelection')}
    </ContextMenuItem>
  );
}
