import { cx } from '@slidr/ui';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, type ActionPopoverProps } from '../shell';
import { insertTable } from './insert';

/** The largest table the grid offers; rows and columns are added later from row B. */
const ROWS = 8;
const COLS = 8;

const rows = Array.from({ length: ROWS }, (_, r) => r + 1);
const cols = Array.from({ length: COLS }, (_, c) => c + 1);

/**
 * What the "Table" button of row A opens (TBL-01): a grid to pick the number of rows and columns
 * from, by pointing or with the arrow keys. The grid starts on the side the UI reads from.
 */
export function TableInsert({ close }: ActionPopoverProps) {
  const { t } = useTranslation('table');
  const editor = useEditor();
  const [size, setSize] = useState({ rows: 0, cols: 0 });

  const pick = (pickedRows: number, pickedCols: number) => {
    // The popover closes first: the table's text editor then takes the focus and keeps it.
    close();
    insertTable(editor, pickedRows, pickedCols);
  };

  /** The arrows walk the grid; left and right follow the reading direction. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const at = { rows: Math.max(size.rows, 1), cols: Math.max(size.cols, 1) };
    if (event.key === forward) at.cols = Math.min(COLS, at.cols + 1);
    else if (event.key === back) at.cols = Math.max(1, at.cols - 1);
    else if (event.key === 'ArrowDown') at.rows = Math.min(ROWS, at.rows + 1);
    else if (event.key === 'ArrowUp') at.rows = Math.max(1, at.rows - 1);
    else return;
    event.preventDefault();
    event.currentTarget
      .querySelector<HTMLElement>(`[data-rows="${at.rows}"][data-cols="${at.cols}"]`)
      ?.focus();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="grid"
        aria-label={t('insert.grid')}
        className="grid grid-cols-8 gap-0.5"
        onKeyDown={onKeyDown}
        onPointerLeave={() => setSize({ rows: 0, cols: 0 })}
      >
        {rows.map((row) => (
          // A grid is made of rows to a screen reader: the cells of a row are in one, which
          // takes no box of its own, so the eight columns are still the grid's.
          <div key={row} role="row" className="contents">
            {cols.map((col) => (
              <button
                key={col}
                type="button"
                role="gridcell"
                data-rows={row}
                data-cols={col}
                aria-label={t('insert.size', { rows: row, cols: col })}
                // One stop for Tab; the arrows move inside the grid.
                tabIndex={row === Math.max(size.rows, 1) && col === Math.max(size.cols, 1) ? 0 : -1}
                className={cx(
                  'size-5 cursor-default rounded-small border transition-colors',
                  row <= size.rows && col <= size.cols
                    ? 'border-ui-accent bg-ui-accent-soft'
                    : 'border-ui-line-strong bg-ui-field',
                )}
                onPointerEnter={() => setSize({ rows: row, cols: col })}
                onFocus={() => setSize({ rows: row, cols: col })}
                onClick={() => pick(row, col)}
              />
            ))}
          </div>
        ))}
      </div>
      <span data-testid="table-insert-size" className="text-xs text-ui-fg-muted">
        {size.rows ? t('insert.size', size) : t('insert.hint')}
      </span>
    </div>
  );
}
