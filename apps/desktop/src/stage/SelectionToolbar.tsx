import { useMemo, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { findSlide, type ZOrderMove } from '@slidr/model';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  type LucideIcon,
} from '@slidr/ui';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  CopyPlus,
  Layers2,
  Lock,
  LockOpen,
  Sparkles,
  Trash2,
} from '@slidr/ui/icons';
import { abilities } from '../arrange/abilities';
import { duplicate, remove, reorder, toggleLock } from '../arrange/actions';
import {
  aiKinds,
  focusStage,
  openAiChat,
  selectionKind,
  useDeck,
  useEditor,
  useSelection,
} from '../shell';

/** The four moves of the layer order, front first, with the keys of SPEC Appendix A. */
export const ORDER_MOVES: readonly { to: ZOrderMove; icon: LucideIcon; shortcut: string }[] = [
  { to: 'front', icon: ArrowUpToLine, shortcut: 'Ctrl+Shift+]' },
  { to: 'forward', icon: ArrowUp, shortcut: 'Ctrl+]' },
  { to: 'backward', icon: ArrowDown, shortcut: 'Ctrl+[' },
  { to: 'back', icon: ArrowDownToLine, shortcut: 'Ctrl+Shift+[' },
];

/** The toolbar of the selection, as the Stage places it; null when there is none. */
const toolbarNode = () => document.querySelector<HTMLElement>('[data-testid="selection-toolbar"]');

/** Its buttons that take a press, in their order on the screen's reading line. */
const buttonsOf = (bar: HTMLElement) =>
  Array.from(bar.querySelectorAll<HTMLButtonElement>('button')).filter((b) => !b.disabled);

/**
 * Alt+F10 (UI-06): the keyboard goes to the first tool beside the selection, as in the editors
 * that have a toolbar of their own beside the text. False when no toolbar is shown, so the key
 * goes its way.
 */
export function focusSelectionToolbar(): boolean {
  const bar = toolbarNode();
  const first = bar ? buttonsOf(bar)[0] : undefined;
  if (!first) return false;
  first.focus();
  return true;
}

/**
 * The arrows move along the toolbar, as in any toolbar (one stop for Tab, the arrows inside it),
 * mirrored in a right-to-left UI; Home and End go to its ends.
 */
function moveAlong(event: KeyboardEvent<HTMLDivElement>) {
  const bar = event.currentTarget;
  const buttons = buttonsOf(bar);
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const rtl = getComputedStyle(bar).direction === 'rtl';
  const to =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowRight'
          ? at + (rtl ? -1 : 1)
          : event.key === 'ArrowLeft'
            ? at + (rtl ? 1 : -1)
            : undefined;
  if (to === undefined) return;
  event.preventDefault();
  buttons[(to + buttons.length) % buttons.length]?.focus();
}

/**
 * The floating toolbar beside the selection (STG-05): duplicate, delete, lock, layer order and
 * "AI". The Stage places it and puts it away during a gesture; this is what is in it. A selection
 * that is all locked gets only the way out of the lock, which is the one thing it can do.
 */
export function SelectionToolbar() {
  const { t } = useTranslation();
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const can = useMemo(() => abilities(slide, ids), [slide, ids]);
  const kind = selectionKind(deck, slideId, ids);
  if (can.count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t('stage:toolbar.label')}
      data-testid="selection-toolbar"
      className="flex animate-fade-in items-center gap-0.5 rounded-full border border-ui-line bg-ui-raised p-1.5 shadow-floating"
      onKeyDown={(event) => {
        // Esc gives the keyboard back to the slide.
        if (event.key === 'Escape') focusStage();
        else moveAlong(event);
      }}
    >
      {!can.allLocked && (
        <>
          <IconButton
            icon={CopyPlus}
            size="sm"
            tooltipSide="top"
            label={t('arrange:menu.duplicate')}
            shortcut="Ctrl+D"
            onClick={() => duplicate(editor)}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            tooltipSide="top"
            label={t('arrange:menu.delete')}
            shortcut="Del"
            disabled={!can.remove}
            onClick={() => {
              remove(editor);
              // The button went with the selection: the keyboard is the slide's again.
              focusStage();
            }}
          />
        </>
      )}
      <IconButton
        icon={can.allLocked ? LockOpen : Lock}
        size="sm"
        tooltipSide="top"
        label={can.allLocked ? t('arrange:menu.unlock') : t('arrange:menu.lock')}
        onClick={() => toggleLock(editor)}
      />
      {!can.allLocked && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={Layers2} size="sm" tooltipSide="top" label={t('stage:menu.order')} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            data-testid="selection-toolbar-order"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              focusStage();
            }}
          >
            {ORDER_MOVES.map(({ to, icon, shortcut }) => (
              <DropdownMenuItem
                key={to}
                icon={icon}
                shortcut={shortcut}
                disabled={!can.order[to]}
                onSelect={() => reorder(editor, to)}
              >
                {t(`arrange:menu.${to}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {aiKinds.has(kind) && (
        <Button
          variant="soft"
          size="sm"
          icon={Sparkles}
          aria-label={t('tools.aiSelection')}
          onClick={openAiChat}
        >
          {t('tools.ai')}
        </Button>
      )}
    </div>
  );
}
