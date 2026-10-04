import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Search } from 'lucide-react';
import { cx } from '../cx';
import { ScrollArea } from './feedback';
import { Icon } from './icon';
import { Input } from './input';

export interface FontOption {
  /** The family name, as CSS and the deck use it. */
  family: string;
  /** The face has Hebrew letters. */
  hebrew?: boolean;
  /** A symbol font: it draws pictures in place of letters, so its name is set in the UI font. */
  symbol?: boolean;
}

/** A part of the list under a heading of its own: a library, the fonts of this computer. */
export interface FontGroup {
  label: string;
  fonts: readonly FontOption[];
}

/** The picker's strings; the design system has no language of its own. */
export interface FontPickerLabels {
  search: string;
  recent: string;
  /** The accessible name of the whole list. */
  all: string;
  /** The accessible name of the Hebrew mark, e.g. "Supports Hebrew". */
  hebrew: string;
  /** Shown when the search matches nothing. */
  empty: string;
}

export interface FontPickerProps {
  /** The fonts, group after group. A heading is shown once the list has more than one part. */
  groups: readonly FontGroup[];
  /** Families used lately, most recent first. */
  recent?: readonly string[];
  value: string | null;
  onValueChange: (family: string) => void;
  /** Puts the caret in the search field when the picker appears. On by default. */
  autoFocus?: boolean;
  labels: FontPickerLabels;
  className?: string;
}

/** A line of the list: a heading, or a font and its place among the fonts. */
type Line = { heading: string } | { font: FontOption; key: string; row: number };

const NO_RECENT: readonly string[] = [];

/**
 * Lines drawn above and below the ones in view, so a scroll shows text and not a gap. Kept
 * small: a line that is drawn loads its font, in view or not.
 */
const OVERSCAN = 4;
/** The lines in view until the list is measured. */
const IN_VIEW = 9;

/** The height of a line: that of a control (`h-control`), read from the token. */
function controlHeight(): number {
  const token = getComputedStyle(document.documentElement).getPropertyValue('--spacing-control');
  return parseFloat(token) || 32;
}

/** A family name as a CSS string. */
const quoted = (family: string) => `"${family.replace(/["\\]/g, '\\$&')}"`;

/**
 * The font list (TXT-02): search, the fonts used lately, every name drawn in its own face, and a
 * mark on the faces that have Hebrew. It is the content of a popover or a panel. The search field
 * keeps the focus; Up, Down and Enter work the list from it, and the search looks in every group.
 *
 * Only the lines in view are drawn. A name in its own face costs the loading of that font, and a
 * computer has hundreds of them: drawn all at once, the list took two seconds to appear. Every
 * line, a heading too, has the height of a control, so the place of a line is its index.
 */
export function FontPicker({
  groups,
  recent = NO_RECENT,
  value,
  onValueChange,
  autoFocus = true,
  labels,
  className,
}: FontPickerProps) {
  const listId = useId();
  const viewport = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [lineHeight] = useState(controlHeight);
  /** The first line in view, and how many lines the list shows. */
  const [view, setView] = useState({ first: 0, count: IN_VIEW });

  const { lines, rows } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byFamily = new Map<string, FontOption>();
    for (const group of groups) {
      for (const font of group.fonts) {
        if (!byFamily.has(font.family)) byFamily.set(font.family, font);
      }
    }
    const used = needle
      ? []
      : recent.map((family) => byFamily.get(family)).filter((f): f is FontOption => Boolean(f));
    const parts = [
      { key: 'recent', label: labels.recent, fonts: used },
      ...groups.map((group, i) => ({
        key: `group${i}`,
        label: group.label,
        fonts: needle
          ? group.fonts.filter((f) => f.family.toLowerCase().includes(needle))
          : group.fonts,
      })),
    ].filter((part) => part.fonts.length > 0);

    const lines: Line[] = [];
    /** The line of each font, in the order the arrows walk them. */
    const rows: number[] = [];
    for (const part of parts) {
      if (parts.length > 1) lines.push({ heading: part.label });
      for (const font of part.fonts) {
        lines.push({ font, key: `${part.key}:${font.family}`, row: rows.length });
        rows.push(lines.length - 1);
      }
    }
    return { lines, rows };
  }, [groups, recent, query, labels.recent]);

  const activeRow = Math.min(active, rows.length - 1);
  const activeAt = rows[activeRow];
  const activeLine = activeAt === undefined ? undefined : lines[activeAt];
  const from = Math.max(0, Math.min(view.first, lines.length - view.count) - OVERSCAN);
  const to = Math.min(lines.length, from + view.count + 2 * OVERSCAN);

  /** Where the list has scrolled to, in lines: the state changes when a line comes or goes. */
  const look = useCallback(
    (element: HTMLDivElement) => {
      const first = Math.floor(element.scrollTop / lineHeight);
      const count = Math.ceil(element.clientHeight / lineHeight) + 1;
      setView((was) => (was.first === first && was.count === count ? was : { first, count }));
    },
    [lineHeight],
  );
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      viewport.current = element;
      if (element) look(element);
    },
    [look],
  );

  /** Scrolls the list just enough for a font to be in view; the first font brings its heading. */
  const reveal = (row: number) => {
    const element = viewport.current;
    const at = rows[row];
    if (!element || at === undefined) return;
    const top = (row === 0 ? 0 : at) * lineHeight;
    const bottom = (at + 1) * lineHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
    look(element);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(rows.length - 1, activeRow + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      setActive(next);
      reveal(next);
    } else if (event.key === 'Enter' && activeLine && 'font' in activeLine) {
      event.preventDefault();
      onValueChange(activeLine.font.family);
    }
  };

  const draw = (line: Line, at: number) => {
    if ('heading' in line) {
      return (
        <li
          key={`heading:${at}`}
          role="presentation"
          className="flex h-control items-end px-2 pb-1 text-xs font-medium text-ui-fg-muted"
        >
          {line.heading}
        </li>
      );
    }
    const { family, hebrew, symbol } = line.font;
    const selected = family === value;
    return (
      <li
        key={line.key}
        id={`${listId}-${line.row}`}
        role="option"
        aria-selected={selected}
        // What is drawn is a part of the list: this is the font's place in all of it.
        aria-setsize={rows.length}
        aria-posinset={line.row + 1}
        data-active={line.row === activeRow || undefined}
        onPointerMove={() => setActive(line.row)}
        onClick={() => onValueChange(family)}
        className="relative flex h-control cursor-default items-center gap-2 rounded-control ps-8 pe-2 select-none data-active:bg-ui-hover"
      >
        {selected && (
          <span className="absolute start-2 inline-flex size-4 items-center justify-center text-ui-accent-fg">
            <Icon icon={Check} />
          </span>
        )}
        <span
          style={symbol ? undefined : { fontFamily: quoted(family) }}
          className="min-w-0 flex-1 truncate text-md"
        >
          {family}
        </span>
        {hebrew && (
          <span
            role="img"
            aria-label={labels.hebrew}
            style={{ fontFamily: quoted(family) }}
            className="shrink-0 text-md text-ui-fg-muted"
          >
            אבג
          </span>
        )}
      </li>
    );
  };

  return (
    <div className={cx('flex min-h-0 flex-col gap-2', className)}>
      <Input
        icon={Search}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        // Only a font that is drawn can be pointed at: a scroll may leave the active one behind.
        aria-activedescendant={
          activeAt !== undefined && activeAt >= from && activeAt < to
            ? `${listId}-${activeRow}`
            : undefined
        }
        aria-label={labels.search}
        placeholder={labels.search}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          // Another list: it starts at its top.
          if (viewport.current) viewport.current.scrollTop = 0;
          setView((was) => (was.first === 0 ? was : { ...was, first: 0 }));
        }}
        onKeyDown={onKeyDown}
      />
      <ScrollArea
        type="always"
        className="-mx-1 h-72"
        viewportRef={attach}
        onScroll={(event) => look(event.currentTarget)}
      >
        <ul
          id={listId}
          role="listbox"
          aria-label={labels.all}
          // The lines that are not drawn keep their room, so the list scrolls at its full length.
          style={{
            paddingBlockStart: from * lineHeight,
            paddingBlockEnd: (lines.length - to) * lineHeight,
          }}
          className="flex flex-col px-1"
        >
          {lines.slice(from, to).map((line, i) => draw(line, from + i))}
          {rows.length === 0 && (
            <li role="presentation" className="px-2 py-6 text-center text-ui-fg-muted">
              {labels.empty}
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
