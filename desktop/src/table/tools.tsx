import {
  canMerge,
  canSplit,
  createSlide,
  deleteCols,
  deleteRows,
  distributeCols,
  distributeRows,
  flipDirection,
  insertCols,
  insertRows,
  mergeCells,
  newTable,
  setBorders,
  splitCells,
  updateCells,
  type BorderEdges,
  type Color,
  type Direction,
  type Stroke,
  type TableCell,
  type TableElement,
} from '@slidr/model';
import { CELL_PADDING, cellLook, SlideRenderer, tableStyle, tableStyles } from '@slidr/renderer';
import {
  Checkbox,
  ContextMenuItem,
  ContextMenuSeparator,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  IconButton,
  NumberField,
  SegmentedControl,
  Toggle,
  Tooltip,
} from '@slidr/ui';
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Grid2x2,
  PaintBucket,
  Rows3,
  SquareSquare,
  StretchHorizontal,
  StretchVertical,
  TableCellsMerge,
  TableCellsSplit,
  TableProperties,
  Trash2,
} from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, useGestureTx } from '../controls';
import { StrokeEditor } from '../objects/editors';
import { focusStage, useAssetResolver, useDeck } from '../shell';
import { closeToText, keepFocus, PopoverTool } from '../text/toolbar/shared';
import { borderIcons } from './icons';
import { selectCells, stopTyping, tableSession } from './session';
import { useTableTarget, type TableTarget } from './target';

/*
 * Row B for a table (SPEC 4.4): rows and columns, merge and split, the table style, and the fill,
 * borders and alignment of the selected cells (TBL-02 to TBL-05, TBL-07). The tools act on the
 * cells selected inside the table, and on the whole table when it is selected as an object.
 * Every action is one `element.update`: one undo step.
 */

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const cellAt = (table: TableElement, { row, col }: { row: number; col: number }): TableCell =>
  table.cells[row]![col]!;

/* ---------------------------------------------------------------- rows and columns */

/**
 * A change of the table's structure ends the typing in a cell first: the cell may move, or go.
 * The keyboard goes back to the Stage, where the arrows walk the cells.
 */
function leaveText(): void {
  if (tableSession.getState().typing) stopTyping();
  focusStage();
}

/** Keeps the same cells selected after rows or columns were added before them. */
function shiftSelection(target: TableTarget, rows: number, cols: number): void {
  if (!target.inside) return;
  const { anchor, focus } = tableSession.getState();
  selectCells(
    { row: anchor.row + rows, col: anchor.col + cols },
    { row: focus.row + rows, col: focus.col + cols },
  );
}

const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * The changes of a table's structure, for the selected cells. Row B and the Stage's right-click
 * menu call the same ones, so the two cannot drift apart.
 */
function useStructure(target: TableTarget) {
  const { t } = useTranslation('table');
  const { table, range, write } = target;
  const rtl = table.dir === 'rtl';
  const rows = span(range.row0, range.row1);
  const cols = span(range.col0, range.col1);
  // As many rows or columns as are selected inside the table go in at once (ADR-033); a table
  // selected as an object gets one.
  const newRows = target.inside ? rows.length : 1;
  const newCols = target.inside ? cols.length : 1;

  const insertRow = (above: boolean) => {
    leaveText();
    const at = above ? range.row0 : range.row1;
    write(insertRows(table, above ? at : at + 1, newRows, at), {
      label: t(newRows > 1 ? 'history.insertRows' : 'history.insertRow'),
    });
    if (above) shiftSelection(target, newRows, 0);
  };
  /** On the screen: in a right-to-left table the column before the selection is on its right. */
  const insertCol = (side: 'left' | 'right') => {
    leaveText();
    const before = (side === 'right') === rtl;
    const at = before ? range.col0 : range.col1;
    write(insertCols(table, before ? at : at + 1, newCols, at), {
      label: t(newCols > 1 ? 'history.insertColumns' : 'history.insertColumn'),
      fit: true,
    });
    if (before) shiftSelection(target, 0, newCols);
  };
  const remove = (what: 'rows' | 'cols') => {
    leaveText();
    const patch = what === 'rows' ? deleteRows(table, rows) : deleteCols(table, cols);
    write(patch, {
      label: t(what === 'rows' ? 'history.deleteRow' : 'history.deleteColumn'),
      fit: true,
    });
    // The cell that took the place of the first one removed.
    if (patch && target.inside) {
      const at = { row: range.row0, col: range.col0 };
      selectCells({
        row: what === 'rows' ? Math.min(at.row, table.rows.length - rows.length - 1) : at.row,
        col: what === 'cols' ? Math.min(at.col, table.cols.length - cols.length - 1) : at.col,
      });
    }
  };
  const even = (what: 'rows' | 'cols') => {
    write(what === 'rows' ? distributeRows(table, range) : distributeCols(table, range), {
      label: t('history.distribute'),
      fit: true,
    });
  };
  const merge = () => {
    leaveText();
    write(mergeCells(table, range), { label: t('history.merge'), fit: true });
    if (target.inside) selectCells({ row: range.row0, col: range.col0 });
  };
  const split = () => {
    leaveText();
    write(splitCells(table, range), { label: t('history.split'), fit: true });
  };

  return {
    t,
    insertRow,
    insertCol,
    remove,
    even,
    merge,
    split,
    /** The words of inserting: one row or column, or as many as are selected. */
    inserts: {
      above: newRows > 1 ? t('structure.rowsAbove', { count: newRows }) : t('structure.rowAbove'),
      below: newRows > 1 ? t('structure.rowsBelow', { count: newRows }) : t('structure.rowBelow'),
      right: newCols > 1 ? t('structure.colsRight', { count: newCols }) : t('structure.colRight'),
      left: newCols > 1 ? t('structure.colsLeft', { count: newCols }) : t('structure.colLeft'),
    },
    /** The words and the limits of deleting: one row or several, and never the last ones. */
    deleteRows: {
      label: t(rows.length > 1 ? 'structure.deleteRows' : 'structure.deleteRow'),
      disabled: rows.length >= table.rows.length,
    },
    deleteCols: {
      label: t(cols.length > 1 ? 'structure.deleteCols' : 'structure.deleteCol'),
      disabled: cols.length >= table.cols.length,
    },
    canMerge: target.inside && canMerge(table, range),
    canSplit: canSplit(table, range),
  };
}

function StructureMenu({ target }: { target: TableTarget }) {
  const { t, insertRow, insertCol, remove, even, inserts, deleteRows, deleteCols } =
    useStructure(target);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Rows3} size="sm" label={t('structure.title')} onMouseDown={keepFocus} />
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={closeToText}>
        <DropdownMenuItem icon={ArrowUp} onSelect={() => insertRow(true)}>
          {inserts.above}
        </DropdownMenuItem>
        <DropdownMenuItem icon={ArrowDown} onSelect={() => insertRow(false)}>
          {inserts.below}
        </DropdownMenuItem>
        <DropdownMenuItem icon={ArrowRight} onSelect={() => insertCol('right')}>
          {inserts.right}
        </DropdownMenuItem>
        <DropdownMenuItem icon={ArrowLeft} onSelect={() => insertCol('left')}>
          {inserts.left}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Trash2}
          tone="danger"
          disabled={deleteRows.disabled}
          onSelect={() => remove('rows')}
        >
          {deleteRows.label}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={Trash2}
          tone="danger"
          disabled={deleteCols.disabled}
          onSelect={() => remove('cols')}
        >
          {deleteCols.label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={StretchHorizontal} onSelect={() => even('rows')}>
          {t('structure.evenRows')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={StretchVertical} onSelect={() => even('cols')}>
          {t('structure.evenCols')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MergeTools({ target }: { target: TableTarget }) {
  const { t, merge, split, canMerge, canSplit } = useStructure(target);
  return (
    <>
      <IconButton
        icon={TableCellsMerge}
        size="sm"
        label={t('merge')}
        disabled={!canMerge}
        onMouseDown={keepFocus}
        onClick={merge}
      />
      <IconButton
        icon={TableCellsSplit}
        size="sm"
        label={t('split')}
        disabled={!canSplit}
        onMouseDown={keepFocus}
        onClick={split}
      />
    </>
  );
}

function StructureItems({ target }: { target: TableTarget }) {
  const s = useStructure(target);
  const { t } = s;
  return (
    <>
      <ContextMenuItem icon={ArrowUp} onSelect={() => s.insertRow(true)}>
        {s.inserts.above}
      </ContextMenuItem>
      <ContextMenuItem icon={ArrowDown} onSelect={() => s.insertRow(false)}>
        {s.inserts.below}
      </ContextMenuItem>
      <ContextMenuItem icon={ArrowRight} onSelect={() => s.insertCol('right')}>
        {s.inserts.right}
      </ContextMenuItem>
      <ContextMenuItem icon={ArrowLeft} onSelect={() => s.insertCol('left')}>
        {s.inserts.left}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={Trash2}
        tone="danger"
        disabled={s.deleteRows.disabled}
        onSelect={() => s.remove('rows')}
      >
        {s.deleteRows.label}
      </ContextMenuItem>
      <ContextMenuItem
        icon={Trash2}
        tone="danger"
        disabled={s.deleteCols.disabled}
        onSelect={() => s.remove('cols')}
      >
        {s.deleteCols.label}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem icon={TableCellsMerge} disabled={!s.canMerge} onSelect={s.merge}>
        {t('merge')}
      </ContextMenuItem>
      <ContextMenuItem icon={TableCellsSplit} disabled={!s.canSplit} onSelect={s.split}>
        {t('split')}
      </ContextMenuItem>
    </>
  );
}

/**
 * The table's part of the Stage's right-click menu (STG-06): rows, columns, merge and split, for
 * the cells the user selected inside the table. A table selected as an object has the menu of
 * every element instead.
 */
export function StructureMenuItems() {
  const target = useTableTarget();
  if (!target?.inside) return null;
  return <StructureItems target={target} />;
}

/** Row B, first group: the structure of the table. */
export function StructureTools() {
  const target = useTableTarget();
  if (!target) return null;
  return (
    <>
      <StructureMenu target={target} />
      <MergeTools target={target} />
    </>
  );
}

/* ---------------------------------------------------------------- the table style */

/** A small table drawn by the renderer itself, in one style and in the theme of the deck. */
function StylePreview({ styleId, style }: { styleId: string; style: TableElement['style'] }) {
  const deck = useDeck((s) => s.deck);
  const resolveAsset = useAssetResolver();
  const { headerRow, bandedRows, firstColumn } = style;
  const slide = useMemo(() => {
    const table = newTable({
      id: 'e_table_style',
      rows: 4,
      cols: 3,
      frame: { x: 6, y: 6, w: 68, h: 36 },
      dir: 'ltr',
      style: { headerRow, bandedRows, firstColumn, styleId },
    });
    // Without text or padding: at this size a row is nine pixels tall, and a line of text is not.
    const bare = { content: { paragraphs: [] }, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
    const cells = table.cells.map((row) => row.map(() => bare));
    return createSlide({ id: `s_table_style_${styleId}`, elements: [{ ...table, cells }] });
  }, [styleId, headerRow, bandedRows, firstColumn]);
  return (
    // Left to right, whatever the UI reads: the corner of the slide that is shown is its top left.
    <span
      aria-hidden
      dir="ltr"
      className="pointer-events-none block h-12 w-20 overflow-hidden rounded-inset"
    >
      <SlideRenderer deck={deck} slide={slide} mode="thumbnail" resolveAsset={resolveAsset} />
    </span>
  );
}

function StyleTool({ target }: { target: TableTarget }) {
  const { t } = useTranslation('table');
  const { table, write } = target;
  const current = tableStyle(table.style.styleId).id;
  const first = tableStyles[0]?.id;

  const setStyle = (patch: Partial<TableElement['style']>) => {
    const { styleId, ...parts } = { ...table.style, ...patch };
    // The first style is what a table without a style has: it is not written.
    const style = styleId && styleId !== first ? { ...parts, styleId } : parts;
    write({ style }, { label: t('history.style'), fit: true });
  };
  // Options of the style, each on or off: a box to tick, as in the table tools of other editors.
  const part = (key: 'headerRow' | 'bandedRows' | 'firstColumn') => (
    <Checkbox
      label={t(`style.${key}`)}
      checked={table.style[key]}
      onCheckedChange={(on) => setStyle({ [key]: on })}
    />
  );

  return (
    <PopoverTool label={t('style.title')} icon={TableProperties}>
      <Field label={t('style.gallery')}>
        <div className="grid grid-cols-3 gap-2">
          {tableStyles.map(({ id }) => (
            <Tooltip key={id} content={t(`style.names.${id}`)}>
              <div
                className={cx(
                  'relative rounded-control border p-px',
                  id === current ? 'border-ui-accent' : 'border-ui-line',
                )}
              >
                <StylePreview styleId={id} style={table.style} />
                <button
                  type="button"
                  aria-label={t(`style.names.${id}`)}
                  aria-pressed={id === current}
                  data-table-style={id}
                  className="absolute inset-0 cursor-default rounded-control hover:bg-ui-hover"
                  onClick={() => setStyle({ styleId: id })}
                />
              </div>
            </Tooltip>
          ))}
        </div>
      </Field>
      <div className="flex flex-col gap-2">
        {part('headerRow')}
        {part('bandedRows')}
        {part('firstColumn')}
      </div>
      <Field label={t('style.direction')}>
        <SegmentedControl<Direction>
          aria-label={t('style.direction')}
          fill
          options={[
            { value: 'rtl', label: t('style.rtl') },
            { value: 'ltr', label: t('style.ltr') },
          ]}
          value={table.dir}
          onValueChange={(dir) => {
            if (dir !== table.dir) write(flipDirection(table), { label: t('history.direction') });
          }}
        />
      </Field>
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- the selected cells */

function FillTool({ target }: { target: TableTarget }) {
  const { t } = useTranslation('table');
  const tx = useGestureTx();
  const { table, cells, write } = target;
  // What the cells show: their own fill, or the one their table style gives them.
  const fills = cells.map((cell) => cellLook(table, cell.row, cell.col).fill);
  const first = fills[0];
  const same = fills.every((fill) => sameJson(fill, first));
  const plain = !first || first.kind === 'none' || first.kind === 'solid';
  const value: Color | null = same && first?.kind === 'solid' ? first.color : null;

  return (
    <ColorField
      icon={PaintBucket}
      size="sm"
      label={t('fill.title')}
      value={value}
      mixed={!same || !plain}
      allowNone
      alpha
      onChange={(color) =>
        write(
          updateCells(table, cells, (cell) => ({
            ...cell,
            // "None" is said outright: a cell without a fill of its own takes its style's.
            fill: color ? { kind: 'solid', color } : { kind: 'none' },
          })),
          { txId: tx.id(), label: t('history.fill') },
        )
      }
      onGestureEnd={tx.end}
      onCloseAutoFocus={closeToText}
    />
  );
}

const NEW_BORDER: Stroke = { color: { token: 'text' }, width: 2 };

/**
 * A border the selected cells have of their own, to start the pen from. Not one their table
 * style gives them: the rule of a style is faint, and borders drawn with it would hardly show.
 */
function borderOf(target: TableTarget): Stroke | undefined {
  for (const cell of target.cells) {
    const own = cellAt(target.table, cell).borders;
    const found =
      own &&
      [own.top, own.right, own.bottom, own.left].find((stroke) => stroke && stroke.width > 0);
    if (found) return found;
  }
  return undefined;
}

function BordersTool({ target }: { target: TableTarget }) {
  const { t } = useTranslation('table');
  const tx = useGestureTx();
  const { table, range, write } = target;
  const [pen, setPen] = useState<Stroke>(() => borderOf(target) ?? NEW_BORDER);
  /** The lines chosen last: a change of the pen is made to them. */
  const [chosen, setChosen] = useState<BorderEdges | null>(null);

  const draw = (edges: BorderEdges, stroke: Stroke) =>
    write(
      setBorders(
        table,
        range,
        edges,
        edges === 'none' ? null : stroke,
        (_, at) => cellLook(table, at.row, at.col).borders,
      ),
      { txId: tx.id(), label: t('history.borders') },
    );

  return (
    <PopoverTool label={t('borders.title')} icon={Grid2x2}>
      <Field label={t('borders.edges')}>
        <div className="grid grid-cols-5 gap-1">
          {borderIcons.map(({ edges, icon }) => (
            <Toggle
              key={edges}
              icon={icon}
              size="sm"
              label={t(`borders.${edges}`)}
              data-border-edges={edges}
              pressed={chosen === edges}
              onPressedChange={() => {
                setChosen(edges === 'none' ? null : edges);
                draw(edges, pen);
                tx.end();
              }}
            />
          ))}
        </div>
      </Field>
      <StrokeEditor
        value={pen}
        required
        capAndJoin={false}
        defaultJoin="miter"
        defaultStroke={NEW_BORDER}
        onChange={(next) => {
          if (!next) return;
          setPen(next);
          if (chosen) draw(chosen, next);
        }}
        onGestureEnd={tx.end}
      />
    </PopoverTool>
  );
}

type VAlign = NonNullable<TableCell['vAlign']>;

const V_ALIGN_ICONS = {
  top: AlignVerticalJustifyStart,
  middle: AlignVerticalJustifyCenter,
  bottom: AlignVerticalJustifyEnd,
};

function VAlignTool({ target }: { target: TableTarget }) {
  const { t } = useTranslation('table');
  const { table, cells, write } = target;
  // A cell that says nothing is drawn in the middle (`TableView`).
  const values = new Set(cells.map((cell) => cellAt(table, cell).vAlign ?? 'middle'));
  const [only] = values;
  const value: VAlign | undefined = values.size === 1 ? only : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={V_ALIGN_ICONS[value ?? 'middle']}
          size="sm"
          label={t('valign.title')}
          onMouseDown={keepFocus}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={closeToText}>
        <DropdownMenuRadioGroup
          value={value ?? ''}
          onValueChange={(vAlign) =>
            write(
              updateCells(table, cells, (cell) => ({ ...cell, vAlign: vAlign as VAlign })),
              { label: t('history.align') },
            )
          }
        >
          {(['top', 'middle', 'bottom'] as const).map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`valign.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The largest padding the fields offer, in slide pixels. */
const MAX_PADDING = 120;

/**
 * The padding of the selected cells (ADR-033): across, on both sides of the text, and down,
 * above and below it. A field is empty when the cells differ. A change can make text taller:
 * the rows are measured after it.
 */
function PaddingTool({ target }: { target: TableTarget }) {
  const { t } = useTranslation('table');
  const { table, cells, write } = target;
  const pads = cells.map((cell) => cellAt(table, cell).padding ?? CELL_PADDING);
  const shared = (a: 'left' | 'top', b: 'right' | 'bottom') => {
    const first = pads[0]?.[a];
    return pads.every((pad) => pad[a] === first && pad[b] === first) ? (first ?? null) : null;
  };
  const set = (sides: 'across' | 'down', value: number) =>
    write(
      updateCells(table, cells, (cell) => {
        const pad = cell.padding ?? CELL_PADDING;
        const next =
          sides === 'across'
            ? { ...pad, left: value, right: value }
            : { ...pad, top: value, bottom: value };
        return sameJson(next, pad) ? cell : { ...cell, padding: next };
      }),
      { label: t('history.padding'), fit: true },
    );
  return (
    <PopoverTool label={t('padding.title')} icon={SquareSquare}>
      <div className="flex gap-3" data-testid="cell-padding">
        <Field label={t('padding.across')} className="flex-1">
          <NumberField
            aria-label={t('padding.across')}
            size="sm"
            unit="px"
            min={0}
            max={MAX_PADDING}
            value={shared('left', 'right')}
            onValueChange={(value) => set('across', value)}
          />
        </Field>
        <Field label={t('padding.down')} className="flex-1">
          <NumberField
            aria-label={t('padding.down')}
            size="sm"
            unit="px"
            min={0}
            max={MAX_PADDING}
            value={shared('top', 'bottom')}
            onValueChange={(value) => set('down', value)}
          />
        </Field>
      </div>
    </PopoverTool>
  );
}

/** Row B, second group: how the table and its selected cells look. */
export function LookTools() {
  const target = useTableTarget();
  if (!target) return null;
  return (
    <>
      <StyleTool target={target} />
      <FillTool target={target} />
      {/* A new selection starts the borders popover afresh: its pen is that of the cells. */}
      <BordersTool key={`${target.table.id}:${JSON.stringify(target.range)}`} target={target} />
      <VAlignTool target={target} />
      <PaddingTool target={target} />
    </>
  );
}
