import { firstStrong } from '@slidr/renderer';
import { Button, cx, IconButton, Tooltip } from '@slidr/ui';
import { Plus, Trash2, X } from '@slidr/ui/icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useDeck, useEditor } from '../shell';
import { isCtrlLetter } from '../stage/keys';
import {
  addColumn,
  addRow,
  canRemove,
  cellInside,
  editCell,
  removeColumn,
  removeRow,
} from './actions';
import { chartGrid, type GridCell } from './data';
import { chartSession, closeData, moveTo } from './session';
import type { ChartTarget } from './target';

/*
 * The data editor of a chart (WG6-T06, CHT-02): its data as a grid, the names of the series in the
 * first row and the categories in the first column. It works the way a spreadsheet does. A cell
 * is selected, and the arrows, Tab and Enter move between cells; a character typed on a cell
 * replaces what it holds, and F2 or a double click edits it. What is typed is written when the
 * cell is left, as one undo step, and the chart on the slide follows. A range copied in Excel is
 * pasted from the selected cell (`clipboard.ts`).
 */

/** The text being typed in a cell. */
interface Typing {
  cell: GridCell;
  text: string;
  /** It was typed over the cell, not opened to edit: the arrows leave the cell, as in Excel. */
  over: boolean;
}

const sameCell = (a: GridCell, b: GridCell) => a.row === b.row && a.col === b.col;

/**
 * A key that was the grid's is nobody else's: not a shortcut of the app ("T" adds a text box),
 * and not the popover's, which on Tab takes the focus from its last control back to its first.
 */
function taken(event: KeyboardEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

export function DataEditor({ target }: { target: ChartTarget }) {
  const { t } = useTranslation('chart');
  const editor = useEditor();
  /** The grid reads in the direction of the deck, as the chart does: whatever the UI's is. */
  const dir = useDeck((s) => s.deck.meta.dir);
  const { slideId } = target;
  const { id: elementId, chartType, data } = target.chart;
  const grid = useMemo(() => chartGrid({ chartType, data }), [chartType, data]);
  const height = grid.length;
  const width = grid[0]?.length ?? 1;
  const cell = cellInside(
    grid,
    useStore(chartSession, (s) => s.cell),
  );
  const scatter = chartType === 'scatter';

  const [typing, setTyping] = useState<Typing | null>(null);
  /** The typing as it is now, for the handlers that run after the render they were made in. */
  const live = useRef<Typing | null>(null);
  /** The cell whose text was not a number, and that text: the cell kept its value. */
  const [invalid, setInvalid] = useState<(GridCell & { text: string }) | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /** Set by what moves the keyboard: the cell it lands on takes the focus once it is drawn. */
  const refocus = useRef(false);

  const cellNode = (at: GridCell) =>
    root.current?.querySelector<HTMLElement>(`[data-chart-cell="${at.row},${at.col}"]`);

  const type = (next: Typing | null) => {
    live.current = next;
    setTyping(next);
  };

  /**
   * Ends the typing and writes the text. False when the cell does not take it (text in a value
   * cell): the cell is marked and the typing goes on. A key that ended it keeps the keyboard in
   * the grid; a click that took the focus elsewhere (`keep` false) keeps the focus where it went.
   */
  const finish = (keep = true): boolean => {
    const now = live.current;
    if (!now) return true;
    if (editCell(editor.bus, { slideId, elementId }, now.cell, now.text) === 'invalid') {
      setInvalid({ ...now.cell, text: now.text });
      return false;
    }
    if (keep) refocus.current = true;
    type(null);
    setInvalid(null);
    return true;
  };

  /** Drops what was typed: the cell shows what it holds, and is no longer marked. */
  const cancel = () => {
    refocus.current = true;
    type(null);
    setInvalid(null);
  };

  /** Starts typing in the selected cell: over what it holds, or with it. The corner holds nothing. */
  const start = (over: boolean, text = grid[cell.row]?.[cell.col] ?? '') => {
    if (cell.row === 0 && cell.col === 0) return;
    setInvalid(null);
    type({ cell, text, over });
  };

  /** Moves the keyboard to a cell. */
  const go = (next: GridCell) => {
    if (sameCell(next, cell)) {
      cellNode(cell)?.focus();
      return;
    }
    refocus.current = true;
    setInvalid(null);
    moveTo(next);
  };

  const step = (rows: number, cols: number) =>
    go({
      row: Math.max(0, Math.min(cell.row + rows, height - 1)),
      col: Math.max(0, Math.min(cell.col + cols, width - 1)),
    });

  /** The next cell in reading order, or the one before. False at the ends of the grid. */
  const next = (by: 1 | -1): boolean => {
    const index = cell.row * width + cell.col + by;
    if (index < 0 || index >= height * width) return false;
    go({ row: Math.floor(index / width), col: index % width });
    return true;
  };

  // The cell the keyboard moved to takes the focus, after it is drawn as the selected one.
  useLayoutEffect(() => {
    if (!refocus.current || typing) return;
    refocus.current = false;
    root.current
      ?.querySelector<HTMLElement>(`[data-chart-cell="${cell.row},${cell.col}"]`)
      ?.focus();
  }, [cell.row, cell.col, typing, grid]);

  // A click on the slide changes the selection before the cell loses the focus, and the editor
  // is gone by then: what was typed is written as it goes.
  useEffect(
    () => () => {
      const now = live.current;
      live.current = null;
      if (now) editCell(editor.bus, { slideId, elementId }, now.cell, now.text);
    },
    [editor, slideId, elementId],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    // On the screen: in a right-to-left grid the next column is on the left.
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const now = live.current;

    if (now) {
      const leaves =
        key === 'Enter' ||
        key === 'Tab' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        (now.over && (key === forward || key === back));
      if (key === 'Escape') cancel();
      else if (!leaves) return;
      taken(event);
      if (!leaves || !finish()) return;
      if (key === 'Enter') step(event.shiftKey ? -1 : 1, 0);
      else if (key === 'Tab') next(event.shiftKey ? -1 : 1);
      else if (key === 'ArrowUp' || key === 'ArrowDown') step(key === 'ArrowDown' ? 1 : -1, 0);
      else step(0, key === forward ? 1 : -1);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      // The browser's "select all" would select the page. Undo, redo, copy and paste go on to
      // the shell and to the clipboard. The key is the one marked A, wherever a layout has it.
      if (isCtrlLetter(event, 'a') && !event.altKey) event.preventDefault();
      return;
    }
    if (key === 'ArrowUp') step(-1, 0);
    else if (key === 'ArrowDown') step(1, 0);
    else if (key === forward) step(0, 1);
    else if (key === back) step(0, -1);
    else if (key === 'Home') go({ row: cell.row, col: 0 });
    else if (key === 'End') go({ row: cell.row, col: width - 1 });
    else if (key === 'Enter') step(event.shiftKey ? -1 : 1, 0);
    else if (key === 'F2') start(false);
    else if (key === 'Delete' || key === 'Backspace') {
      editCell(editor.bus, { slideId, elementId }, cell, '');
      setInvalid(null);
    } else if (key === 'Tab') {
      // Past the last cell, and before the first, Tab leaves the grid as it leaves any control.
      if (!next(event.shiftKey ? -1 : 1)) return;
    } else if (key.length === 1) start(true, key);
    else return;
    taken(event);
  };

  /** The input of the cell being typed in takes the focus as it appears, the caret at its end. */
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  /** After a button changed the grid, the keyboard is back on its selected cell. */
  const act = (action: () => boolean) => {
    if (!finish()) cancel();
    if (action()) refocus.current = true;
    setInvalid(null);
  };

  const removable = canRemove(grid, cell);
  const numeric = (at: GridCell) => at.row > 0 && (at.col > 0 || scatter);
  const cellName = (at: GridCell) => {
    if (at.row === 0) return t('data.seriesName');
    if (at.col === 0) return t(scatter ? 'data.x' : 'data.category');
    return t('data.value');
  };

  return (
    <div ref={root} data-chart-data className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ui-fg">{t('data.panel')}</span>
        <IconButton icon={X} size="sm" label={t('data.close')} onClick={closeData} />
      </div>

      <div className="flex items-center gap-1">
        <Tooltip content={t('data.addRow')}>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            aria-label={t('data.addRow')}
            onClick={() => act(() => addRow(editor))}
          >
            {t('data.row')}
          </Button>
        </Tooltip>
        <Tooltip content={t('data.addColumn')}>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            aria-label={t('data.addColumn')}
            onClick={() => act(() => addColumn(editor))}
          >
            {t('data.column')}
          </Button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip content={t('data.deleteRow')}>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={t('data.deleteRow')}
            disabled={!removable.row}
            onClick={() => act(() => removeRow(editor))}
          >
            {t('data.row')}
          </Button>
        </Tooltip>
        <Tooltip content={t('data.deleteColumn')}>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={t('data.deleteColumn')}
            disabled={!removable.column}
            onClick={() => act(() => removeColumn(editor))}
          >
            {t('data.column')}
          </Button>
        </Tooltip>
      </div>

      <div
        dir={dir}
        data-chart-grid
        className="max-h-72 w-fit max-w-120 overflow-auto rounded-control border border-ui-line"
        onKeyDown={onKeyDown}
      >
        <table
          role="grid"
          aria-label={t('data.panel')}
          aria-rowcount={height}
          aria-colcount={width}
          className="border-separate border-spacing-0 text-sm text-ui-fg"
        >
          <tbody>
            {grid.map((line, row) => (
              <tr key={row}>
                {line.map((text, col) => {
                  const at = { row, col };
                  const selected = sameCell(at, cell);
                  const edited = selected && typing !== null;
                  const bad = invalid !== null && sameCell(at, invalid);
                  const header = row === 0 || col === 0;
                  const Cell = header ? 'th' : 'td';
                  return (
                    <Cell
                      key={col}
                      {...(header ? { scope: row === 0 ? 'col' : 'row' } : {})}
                      data-chart-cell={`${row},${col}`}
                      tabIndex={selected ? 0 : -1}
                      aria-selected={selected}
                      aria-invalid={bad || undefined}
                      // A number reads left to right in every deck, and sits on the right. A name
                      // sits where the grid starts, whichever way its own text reads.
                      {...(numeric(at) ? { dir: 'ltr' } : {})}
                      className={cx(
                        'h-control-sm max-w-40 cursor-default truncate border-ui-line px-2 select-none',
                        // The lines between the cells; the frame around the grid is the last one.
                        row < height - 1 && 'border-b',
                        col < width - 1 && 'border-e',
                        // The selected cell wears the focus ring whether or not the keyboard is
                        // in the grid: it is where a paste lands.
                        (selected || bad) && 'outline-2 -outline-offset-2',
                        bad ? 'outline-ui-danger-fg' : selected && 'outline-ui-focus',
                        col === 0 ? 'min-w-28' : 'min-w-20',
                        // The names stay in sight while the values scroll under them, the corner
                        // over both.
                        header ? 'sticky bg-ui-field font-medium' : 'relative font-normal',
                        row === 0 && 'top-0',
                        col === 0 && 'start-0',
                        header && (row === 0 && col === 0 ? 'z-20' : 'z-10'),
                        numeric(at) ? 'text-end tabular-nums' : 'text-start',
                      )}
                      onMouseDown={() => {
                        if (!sameCell(at, cell)) {
                          setInvalid(null);
                          moveTo(at);
                        }
                      }}
                      onDoubleClick={() => start(false)}
                    >
                      {edited ? (
                        <input
                          ref={focusInput}
                          value={typing.text}
                          aria-label={cellName(at)}
                          aria-invalid={bad || undefined}
                          dir={numeric(at) ? 'ltr' : 'auto'}
                          inputMode={numeric(at) ? 'decimal' : 'text'}
                          className={cx(
                            'absolute inset-0 size-full bg-ui-raised px-2 font-normal text-ui-fg outline-2 -outline-offset-2',
                            bad ? 'outline-ui-danger-fg' : 'outline-ui-focus',
                            numeric(at)
                              ? 'text-end tabular-nums'
                              : // The field reads the way its text does (`dir="auto"`); the text
                                // still sits where the grid starts, as it will once it is written.
                                (firstStrong(typing.text) ?? 'ltr') === dir
                                ? 'text-start'
                                : 'text-end',
                          )}
                          onChange={(event) => {
                            setInvalid(null);
                            type({
                              cell: typing.cell,
                              text: event.target.value,
                              over: typing.over,
                            });
                          }}
                          onBlur={() => {
                            // Text a value cell does not take is dropped; the cell stays marked.
                            if (!finish(false)) type(null);
                          }}
                        />
                      ) : numeric(at) ? (
                        text
                      ) : (
                        <bdi>{text}</bdi>
                      )}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        role="status"
        className={cx('text-xs', invalid ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
      >
        {invalid ? t('data.invalid', { text: invalid.text }) : t('data.hint')}
      </p>
    </div>
  );
}
