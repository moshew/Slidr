import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { findSlide, type Element } from '@slidr/model';
import {
  ChartColumn,
  Clapperboard,
  CodeXml,
  Eye,
  EyeOff,
  Group,
  Image,
  Layers,
  Lock,
  LockOpen,
  PenTool,
  Slash,
  Square,
  Table,
  Type,
  Volume2,
  type LucideIcon,
} from '@slidr/ui/icons';
import { cx, EmptyState, Icon, IconButton, Input } from '@slidr/ui';
import { useDeck, useEditor, useSelection } from '../shell';
import { remove, rename, setHidden, setLocked } from './actions';
import { layerRows, layerSnippet, rowRange, type LayerRow } from './layers';

/*
 * The Layers panel (SPEC 4.2, ARR-04): the elements of the current slide from the top one down,
 * groups with their children under them. It is the way back to what the Stage will not select: a
 * locked or a hidden element is picked here, and unlocked or shown again from its row.
 */

const typeIcons: Record<Element['type'], LucideIcon> = {
  text: Type,
  image: Image,
  shape: Square,
  line: Slash,
  svg: PenTool,
  group: Group,
  table: Table,
  chart: ChartColumn,
  video: Clapperboard,
  audio: Volume2,
  html: CodeXml,
};

/**
 * The place of every row among the rows of its own group, and how many they are: the rows are
 * one flat list in the document, so a screen reader cannot count them itself ("2 of 5").
 */
function places(rows: readonly LayerRow[]): { at: number; of: number }[] {
  const out = rows.map(() => ({ at: 1, of: 1 }));
  const groups: number[][] = [];
  /** The group that is being listed at each depth. */
  const open: number[][] = [];
  rows.forEach((row, index) => {
    // A row that is less deep than the one before it ends the groups under that one.
    open.length = Math.min(open.length, row.depth + 1);
    let group = open[row.depth];
    if (!group) {
      group = [];
      open[row.depth] = group;
      groups.push(group);
    }
    group.push(index);
  });
  for (const group of groups) {
    group.forEach((index, n) => {
      out[index] = { at: n + 1, of: group.length };
    });
  }
  return out;
}

/** The indent of a row by its depth in the tree; deeper groups share the last step. */
const indents = ['ps-2', 'ps-7', 'ps-12', 'ps-16'] as const;

export function LayersPanel() {
  const { t } = useTranslation('arrange');
  const editor = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  const rows = useMemo(() => (slide ? layerRows(slide.elements) : []), [slide]);
  const placed = useMemo(() => places(rows), [rows]);
  /** Where a Shift+click range starts: the row picked last without Shift. */
  const anchor = useRef<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  /** The place of a row deleted from the keyboard: the row that takes it gets the keyboard. */
  const refocus = useRef<number | null>(null);
  useEffect(() => {
    const at = refocus.current;
    if (at === null) return;
    refocus.current = null;
    const nodes = list.current?.querySelectorAll<HTMLElement>('[data-layer]') ?? [];
    nodes[Math.min(at, nodes.length - 1)]?.focus();
  }, [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title={slide ? t('layers.emptyTitle') : t('layers.noSlide')}
        description={slide ? t('layers.emptyBody') : undefined}
        className="min-h-80"
      />
    );
  }

  const pick = (id: string, keys: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const { selectElements, toggleElement } = editor.selection.getState();
    if (keys.shiftKey && anchor.current) {
      selectElements(rowRange(rows, anchor.current, id));
      return;
    }
    anchor.current = id;
    if (keys.ctrlKey || keys.metaKey) toggleElement(id);
    else selectElements([id]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: LayerRow) => {
    // Keys typed into the name field are the field's.
    if (event.target !== event.currentTarget) return;
    const { id } = row.element;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(id, event);
    } else if (event.key === 'F2') {
      event.preventDefault();
      setRenaming(id);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const at = rows.findIndex((r) => r.element.id === id);
      if (remove(editor)) refocus.current = at;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        event.key === 'ArrowDown'
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling;
      if (!(next instanceof HTMLElement) || !next.dataset.layer) return;
      next.focus();
      pick(next.dataset.layer, event);
    }
  };

  return (
    <div
      ref={list}
      role="tree"
      aria-label={t('layers.list')}
      aria-multiselectable
      data-testid="layers"
      className="flex flex-col gap-0.5 px-2 pb-3"
    >
      {rows.map((row, index) => (
        <Row
          key={row.element.id}
          row={row}
          place={placed[index] ?? { at: 1, of: 1 }}
          selected={selected.includes(row.element.id)}
          renaming={renaming === row.element.id}
          onPick={(event) => pick(row.element.id, event)}
          onKeyDown={(event) => onKeyDown(event, row)}
          onRename={() => setRenaming(row.element.id)}
          onRenamed={(name) => {
            setRenaming(null);
            if (name !== undefined) rename(editor, row.element.id, name);
          }}
          onLock={(locked) => setLocked(editor, [row.element.id], locked)}
          onHide={(hidden) => setHidden(editor, [row.element.id], hidden)}
        />
      ))}
    </div>
  );
}

function Row({
  row,
  place,
  selected,
  renaming,
  onPick,
  onKeyDown,
  onRename,
  onRenamed,
  onLock,
  onHide,
}: {
  row: LayerRow;
  /** Its place among the rows of its group, counted from one, and how many they are. */
  place: { at: number; of: number };
  selected: boolean;
  renaming: boolean;
  onPick: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRename: () => void;
  /** The new name, or undefined when the edit was abandoned. */
  onRenamed: (name: string | undefined) => void;
  onLock: (locked: boolean) => void;
  onHide: (hidden: boolean) => void;
}) {
  const { t } = useTranslation('arrange');
  const { t: said } = useTranslation('a11y');
  const { element, depth, hiddenByGroup, lockedByGroup } = row;
  // A child of a locked or hidden group is shown as locked or hidden, and only the group can
  // change that.
  const locked = Boolean(element.locked) || lockedByGroup;
  const hidden = Boolean(element.hidden) || hiddenByGroup;
  const kind = t(`type.${element.type}`);
  const name = element.name ?? layerSnippet(element) ?? kind;
  // What the icon and the two toggles show, for a screen reader: the kind of the object (unless
  // that is its name already), and that it is locked or hidden.
  const states = [
    name === kind ? null : kind,
    locked ? said('layers.locked') : null,
    hidden ? said('layers.hidden') : null,
  ].filter(Boolean);
  const statesId = `layer-says-${element.id}`;
  /** A toggle is quiet until the row is pointed at, unless it is on: then it says so always. */
  const quiet = 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100';

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-label={name}
      aria-setsize={place.of}
      aria-posinset={place.at}
      aria-describedby={states.length > 0 ? statesId : undefined}
      tabIndex={0}
      data-layer={element.id}
      data-locked={element.locked || undefined}
      data-hidden={element.hidden || undefined}
      onClick={onPick}
      onDoubleClick={onRename}
      onKeyDown={onKeyDown}
      className={cx(
        'group flex h-control cursor-default items-center gap-2 rounded-control pe-1 -outline-offset-2 transition-colors',
        indents[Math.min(depth, indents.length - 1)],
        selected ? 'bg-ui-accent-soft' : 'hover:bg-ui-hover',
      )}
    >
      <Icon
        icon={typeIcons[element.type]}
        className={selected ? 'text-ui-accent-fg' : 'text-ui-fg-muted'}
      />
      {states.length > 0 && (
        <span id={statesId} className="sr-only">
          {states.join(', ')}
        </span>
      )}
      {renaming ? (
        <NameField element={element} placeholder={name} onDone={onRenamed} />
      ) : (
        <span
          className={cx(
            'min-w-0 flex-1 truncate',
            // What is not shown on the slide reads quieter here.
            hidden && 'text-ui-fg-muted',
          )}
        >
          {name}
        </span>
      )}
      <IconButton
        icon={locked ? Lock : LockOpen}
        size="sm"
        label={locked ? t('layers.unlock') : t('layers.lock')}
        aria-pressed={locked}
        data-testid="layer-lock"
        disabled={lockedByGroup}
        className={cx(!locked && quiet)}
        onClick={(event) => {
          event.stopPropagation();
          onLock(!locked);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
      <IconButton
        icon={hidden ? EyeOff : Eye}
        size="sm"
        label={hidden ? t('layers.show') : t('layers.hide')}
        aria-pressed={hidden}
        data-testid="layer-visibility"
        disabled={hiddenByGroup}
        className={cx(!hidden && quiet)}
        onClick={(event) => {
          event.stopPropagation();
          onHide(!hidden);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

/** The name of an element, edited in its row: Enter or leaving the field keeps it, Esc does not. */
function NameField({
  element,
  placeholder,
  onDone,
}: {
  element: Element;
  placeholder: string;
  onDone: (name: string | undefined) => void;
}) {
  const { t } = useTranslation('arrange');
  /** Set once the edit ended, so that the blur that follows Enter or Esc does not end it twice. */
  const done = useRef(false);
  const finish = (name: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <Input
      autoFocus
      aria-label={t('layers.rename')}
      data-testid="layer-name"
      defaultValue={element.name ?? ''}
      placeholder={placeholder}
      className="min-w-0 flex-1"
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(event.currentTarget.value);
        else if (event.key === 'Escape') finish(undefined);
      }}
    />
  );
}
