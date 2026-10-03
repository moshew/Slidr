import { useId, useMemo, useState, type KeyboardEvent } from 'react';
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
}

/** The picker's strings; the design system has no language of its own. */
export interface FontPickerLabels {
  search: string;
  recent: string;
  all: string;
  /** The accessible name of the Hebrew mark, e.g. "Supports Hebrew". */
  hebrew: string;
  /** Shown when the search matches nothing. */
  empty: string;
}

export interface FontPickerProps {
  fonts: readonly FontOption[];
  /** Families used lately, most recent first. */
  recent?: readonly string[];
  value: string | null;
  onValueChange: (family: string) => void;
  /** Puts the caret in the search field when the picker appears. On by default. */
  autoFocus?: boolean;
  labels: FontPickerLabels;
  className?: string;
}

interface Row {
  key: string;
  font: FontOption;
}

const NO_RECENT: readonly string[] = [];

/**
 * The font list (TXT-02): search, the fonts used lately, every name drawn in its own face, and a
 * mark on the faces that have Hebrew. It is the content of a popover or a panel. The search field
 * keeps the focus; Up, Down and Enter work the list from it.
 */
export function FontPicker({
  fonts,
  recent = NO_RECENT,
  value,
  onValueChange,
  autoFocus = true,
  labels,
  className,
}: FontPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const { recentRows, allRows } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = fonts.filter((f) => f.family.toLowerCase().includes(needle));
    const byFamily = new Map(fonts.map((f) => [f.family, f]));
    const used = needle
      ? []
      : recent.map((family) => byFamily.get(family)).filter((f): f is FontOption => Boolean(f));
    return {
      recentRows: used.map((font): Row => ({ key: `recent:${font.family}`, font })),
      allRows: matching.map((font): Row => ({ key: `all:${font.family}`, font })),
    };
  }, [fonts, recent, query]);
  const rows = [...recentRows, ...allRows];
  const activeRow = rows[Math.min(active, rows.length - 1)];

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      setActive(next);
      const key = rows[next]?.key;
      if (key) document.getElementById(`${listId}-${key}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && activeRow) {
      event.preventDefault();
      onValueChange(activeRow.font.family);
    }
  };

  const option = (row: Row) => {
    const { family, hebrew } = row.font;
    const selected = family === value;
    return (
      <li
        key={row.key}
        id={`${listId}-${row.key}`}
        role="option"
        aria-selected={selected}
        data-active={row === activeRow || undefined}
        onPointerMove={() => setActive(rows.indexOf(row))}
        onClick={() => onValueChange(family)}
        className="relative flex h-control cursor-default items-center gap-2 rounded-control ps-8 pe-2 select-none data-active:bg-ui-hover"
      >
        {selected && (
          <span className="absolute start-2 inline-flex size-4 items-center justify-center text-ui-accent-fg">
            <Icon icon={Check} />
          </span>
        )}
        <span style={{ fontFamily: `"${family}"` }} className="min-w-0 flex-1 truncate text-md">
          {family}
        </span>
        {hebrew && (
          <span
            role="img"
            aria-label={labels.hebrew}
            style={{ fontFamily: `"${family}"` }}
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
        aria-activedescendant={activeRow ? `${listId}-${activeRow.key}` : undefined}
        aria-label={labels.search}
        placeholder={labels.search}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ScrollArea type="always" className="-mx-1 h-72">
        <ul id={listId} role="listbox" aria-label={labels.all} className="flex flex-col px-1">
          {recentRows.length > 0 && (
            <>
              <li
                role="presentation"
                className="px-2 pt-1 pb-1 text-xs font-medium text-ui-fg-muted"
              >
                {labels.recent}
              </li>
              {recentRows.map(option)}
              <li
                role="presentation"
                className="px-2 pt-3 pb-1 text-xs font-medium text-ui-fg-muted"
              >
                {labels.all}
              </li>
            </>
          )}
          {allRows.map(option)}
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
