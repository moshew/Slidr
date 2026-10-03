import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { findSlide, type AlignEdge, type DistributeAxis } from '@slidr/model';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  CopyPlus,
  EyeOff,
  Group,
  Layers,
  Lock,
  LockOpen,
  SquareStack,
  Trash2,
  Ungroup,
  type LucideIcon,
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
  IconButton,
  Tooltip,
} from '@slidr/ui';
import {
  openPanel,
  useDeck,
  useEditor,
  useSelection,
  type ContextToolProps,
  type Editor,
} from '../shell';
import { abilities, type Abilities } from './abilities';
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
} from './actions';

/*
 * Row B of Top Tools for arranging (SPEC 4.4, ARR-01..05). A multiple selection gets the align
 * and distribute buttons and "group"; every element kind gets the Arrange menu at the end of the
 * row. Alignment is physical: left is the left of the slide in Hebrew too, so no icon here is
 * mirrored.
 */

/** The id of the Layers panel, which takes the place of the shell's placeholder. */
export const LAYERS_PANEL = 'layers';

function useArrange(): { editor: Editor; can: Abilities } {
  const editor = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  const can = useMemo(() => abilities(slide, ids), [slide, ids]);
  return { editor, can };
}

const horizontal: { edge: AlignEdge; icon: LucideIcon }[] = [
  { edge: 'left', icon: AlignStartVertical },
  { edge: 'center', icon: AlignCenterVertical },
  { edge: 'right', icon: AlignEndVertical },
];
const vertical: { edge: AlignEdge; icon: LucideIcon }[] = [
  { edge: 'top', icon: AlignStartHorizontal },
  { edge: 'middle', icon: AlignCenterHorizontal },
  { edge: 'bottom', icon: AlignEndHorizontal },
];
const axes: { axis: DistributeAxis; icon: LucideIcon }[] = [
  { axis: 'horizontal', icon: AlignHorizontalSpaceAround },
  { axis: 'vertical', icon: AlignVerticalSpaceAround },
];

function AlignButtons({ edges }: { edges: typeof horizontal }) {
  const { t } = useTranslation('arrange');
  const { editor, can } = useArrange();
  return edges.map(({ edge, icon }) => (
    <IconButton
      key={edge}
      icon={icon}
      size="sm"
      label={t(`align.${edge}`)}
      data-testid={`align-${edge}`}
      disabled={!can.align}
      onClick={() => align(editor, edge, 'selection')}
    />
  ));
}

/**
 * Left, centre, right: against the bounds of the selection (ARR-02). The three keep their
 * physical order in a right-to-left UI too, so "left" is the one on the left.
 */
export function AlignHorizontal(_: ContextToolProps) {
  return (
    <div dir="ltr" className="flex items-center gap-0.5">
      <AlignButtons edges={horizontal} />
    </div>
  );
}

/** Top, middle, bottom. */
export function AlignVertical(_: ContextToolProps) {
  return <AlignButtons edges={vertical} />;
}

/** Equal gaps between three elements or more; the outermost two stay put. */
export function Distribute(_: ContextToolProps) {
  const { t } = useTranslation('arrange');
  const { editor, can } = useArrange();
  return axes.map(({ axis, icon }) => (
    <IconButton
      key={axis}
      icon={icon}
      size="sm"
      label={t(`distribute.${axis}`)}
      data-testid={`distribute-${axis}`}
      disabled={!can.distribute}
      onClick={() => distribute(editor, axis, 'selection')}
    />
  ));
}

/** "Group" for a multiple selection, "Ungroup" for a group (ARR-01). */
export function GroupButton({ kind }: ContextToolProps) {
  const { t } = useTranslation('arrange');
  const { editor, can } = useArrange();
  if (kind === 'group') {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={Ungroup}
        data-testid="ungroup"
        onClick={() => ungroup(editor)}
      >
        {t('menu.ungroup')}
      </Button>
    );
  }
  return (
    <Tooltip content={t('menu.group')} shortcut="Ctrl+G">
      <Button
        variant="ghost"
        size="sm"
        icon={Group}
        data-testid="group"
        disabled={!can.group}
        onClick={() => group(editor)}
      >
        {t('menu.group')}
      </Button>
    </Tooltip>
  );
}

/**
 * The Arrange menu, at the end of row B for every element kind: layer order, alignment against
 * the slide, grouping, lock and hide, duplicate and delete. What does not apply is disabled.
 */
export function ArrangeMenu(_: ContextToolProps) {
  const { t } = useTranslation('arrange');
  const { editor, can } = useArrange();
  return (
    <DropdownMenu>
      <Tooltip content={t('menu.label')}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            icon={SquareStack}
            iconEnd={ChevronDown}
            aria-label={t('menu.label')}
            data-testid="arrange-menu"
          >
            {/* At the narrow resolution row B has no room to spare: the icon stands alone. */}
            <span className="hidden 2xl:inline">{t('menu.label')}</span>
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent data-testid="arrange-menu-content">
        <DropdownMenuItem
          icon={ArrowUpToLine}
          shortcut="Ctrl+Shift+]"
          disabled={!can.order.front}
          onSelect={() => reorder(editor, 'front')}
        >
          {t('menu.front')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={ArrowUp}
          shortcut="Ctrl+]"
          disabled={!can.order.forward}
          onSelect={() => reorder(editor, 'forward')}
        >
          {t('menu.forward')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={ArrowDown}
          shortcut="Ctrl+["
          disabled={!can.order.backward}
          onSelect={() => reorder(editor, 'backward')}
        >
          {t('menu.backward')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={ArrowDownToLine}
          shortcut="Ctrl+Shift+["
          disabled={!can.order.back}
          onSelect={() => reorder(editor, 'back')}
        >
          {t('menu.back')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={AlignCenterVertical} disabled={!can.toSlide}>
            {t('menu.toSlide')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent data-testid="align-to-slide">
            {[...horizontal, ...vertical].map(({ edge, icon }) => (
              <DropdownMenuItem
                key={edge}
                icon={icon}
                data-testid={`slide-${edge}`}
                onSelect={() => align(editor, edge, 'slide')}
              >
                {t(`align.${edge}`)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {axes.map(({ axis, icon }) => (
              <DropdownMenuItem
                key={axis}
                icon={icon}
                data-testid={`slide-distribute-${axis}`}
                onSelect={() => distribute(editor, axis, 'slide')}
              >
                {t(`distribute.${axis}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Group}
          shortcut="Ctrl+G"
          disabled={!can.group}
          onSelect={() => group(editor)}
        >
          {t('menu.group')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={Ungroup}
          shortcut="Ctrl+Shift+G"
          disabled={!can.ungroup}
          onSelect={() => ungroup(editor)}
        >
          {t('menu.ungroup')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={can.allLocked ? LockOpen : Lock}
          onSelect={() => toggleLock(editor)}
        >
          {can.allLocked ? t('menu.unlock') : t('menu.lock')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={EyeOff} onSelect={() => hide(editor)}>
          {t('menu.hide')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={CopyPlus} shortcut="Ctrl+D" onSelect={() => duplicate(editor)}>
          {t('menu.duplicate')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={Trash2}
          shortcut="Del"
          tone="danger"
          disabled={!can.remove}
          onSelect={() => remove(editor)}
        >
          {t('menu.delete')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Layers} onSelect={() => openPanel(LAYERS_PANEL)}>
          {t('menu.layers')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
