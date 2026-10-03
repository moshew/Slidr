import {
  Button,
  Icon,
  Input,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Separator,
  Toggle,
  Tooltip,
  type LucideIcon,
} from '@slidr/ui';
import {
  Eye,
  Grid3x3,
  Heading,
  List,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  RotateCcw,
  Table2,
  Tag,
  X,
} from '@slidr/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { ColorField, useGestureTx } from '../controls';
import { Field } from '../objects/parts';
import { focusStage, useDeck, useEditor } from '../shell';
import { keepFocus, PopoverTool, returnFocus, Row, useBurstTx } from '../text/toolbar/shared';
import { setType } from './actions';
import { TypeGallery } from './ChartInsert';
import { DataEditor } from './DataEditor';
import { useChartTarget } from './hooks';
import { Axes, typeIcons } from './icons';
import {
  axisControls,
  coloredParts,
  hasOwnColors,
  resetColors,
  setAxis,
  setColor,
  setLabels,
  setLegend,
  setTitle,
  type AxisChange,
  type AxisControls,
  type AxisName,
  type LegendPosition,
} from './options';
import { chartSession, closeData, openData } from './session';
import type { ChartTarget } from './target';

/*
 * Row B for a chart (SPEC 4.4; WG6-T06, T07): its type, its data, and its options: title, legend,
 * axes, value labels and colours (CHT-02 to CHT-05). Every action is one `element.update`: one
 * undo step. What is typed in a text field, and a drag in the colour picker, are one step each.
 */

interface ToolProps {
  target: ChartTarget;
}

/* ---------------------------------------------------------------- type and data */

function TypeTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  const editor = useEditor();
  const { chartType } = target.chart;
  return (
    <PopoverTool label={t('type.title')} icon={typeIcons[chartType]}>
      {/* The gallery stays open: trying one type after another is what it is for. */}
      <TypeGallery current={chartType} onPick={(next) => setType(editor, next)} />
    </PopoverTool>
  );
}

/** Whether a key event comes from a cell of the data grid that is being typed in. */
const typingInCell = (target: EventTarget | null) =>
  target instanceof HTMLInputElement && Boolean(target.closest('[data-chart-cell]'));

/**
 * The "Edit data" button and the data editor it opens (CHT-02). The editor is a popover that is
 * not modal and does not close when the user works elsewhere: the chart on the slide stays in
 * sight and follows every edit, and the other tools of the row stay at hand. It closes with its
 * own button, with Esc, and when the chart is no longer what is selected. It opens towards the
 * Tool Panel, away from the slide.
 */
function DataTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  const { id } = target.chart;
  const open = useStore(chartSession, (s) => s.elementId === id);
  // The editor is of the selected chart: it goes when another element is selected.
  useEffect(() => closeData, [id]);

  return (
    <Popover open={open} onOpenChange={(next) => (next ? openData(id) : closeData())}>
      <Tooltip content={t('data.button')} shortcut="Enter">
        <PopoverTrigger asChild>
          <Button size="sm" variant={open ? 'soft' : 'ghost'} icon={Table2} onMouseDown={keepFocus}>
            {t('data.button')}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align="end"
        aria-label={t('data.panel')}
        // What is copied and pasted anywhere in the editor is of its grid (`clipboard.ts`).
        data-chart-editor
        className="min-w-fit"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          // The keyboard goes to the selected cell of the grid, ready for a paste.
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLElement>('[data-chart-cell][tabindex="0"]')
            ?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusStage();
        }}
        onEscapeKeyDown={(event) => {
          // In a cell that is being typed in, Esc drops the typing and the editor stays open.
          if (typingInCell(event.target)) event.preventDefault();
          // Anywhere else it closes the editor and nothing more: the chart stays selected.
          else event.stopPropagation();
        }}
      >
        <DataEditor target={target} />
      </PopoverContent>
    </Popover>
  );
}

/** Row B, first group: what the chart is and what it shows. */
export function DataTools() {
  const target = useChartTarget();
  if (!target) return null;
  return (
    <>
      <TypeTool target={target} />
      <DataTool target={target} />
    </>
  );
}

/* ---------------------------------------------------------------- text fields */

/**
 * A text of the chart, written as it is typed: the chart on the slide follows every letter, and
 * the field has nothing to lose when its popover closes. The host makes the typing one undo step
 * (`useGestureTx`): it ends when the field is left, and Enter leaves it for the slide.
 */
function LiveText({
  label,
  value,
  placeholder,
  onChange,
  onEnd,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  onEnd: () => void;
}) {
  // What is being typed: the chart takes it without the spaces around it, the field keeps them.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      aria-label={label}
      dir="auto"
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onBlur={() => {
        setDraft(null);
        onEnd();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        // The key is done here: it is not also Enter on the chart the keyboard goes back to.
        event.preventDefault();
        returnFocus();
      }}
    />
  );
}

/* ---------------------------------------------------------------- title */

function TitleField({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  const tx = useGestureTx();
  return (
    <Field label={t('title.field')}>
      <LiveText
        label={t('title.field')}
        value={target.chart.options.title ?? ''}
        placeholder={t('title.none')}
        onChange={(text) =>
          target.write(setTitle(target.chart, text), { txId: tx.id(), label: t('history.title') })
        }
        onEnd={tx.end}
      />
    </Field>
  );
}

function TitleTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  return (
    <PopoverTool label={t('title.title')} icon={Heading}>
      <TitleField target={target} />
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- legend */

/** Where the legend is, as a side of the screen. */
type Side = 'top' | 'bottom' | 'right' | 'left';

const SIDE_ICONS: Record<Side, LucideIcon> = {
  top: PanelTop,
  bottom: PanelBottom,
  right: PanelRight,
  left: PanelLeft,
};

function LegendTool({ target }: ToolProps) {
  const { t, i18n } = useTranslation('chart');
  // The model says `start` and `end`: the sides the text of the deck starts and ends on. The
  // buttons name sides of the screen, as the alignment of text does (ADR-013).
  const rtl = useDeck((s) => s.deck.meta.dir === 'rtl');
  const { legend } = target.chart.options;
  const { position } = legend;
  const side: Side =
    position === 'top' || position === 'bottom'
      ? position
      : (position === 'start') === rtl
        ? 'right'
        : 'left';
  const positionOf = (next: Side): LegendPosition =>
    next === 'top' || next === 'bottom' ? next : (next === 'right') === rtl ? 'start' : 'end';
  // Right is on the right: the two sides follow the order the UI lays the buttons out in.
  const sides: Side[] =
    i18n.dir() === 'rtl' ? ['top', 'bottom', 'right', 'left'] : ['top', 'bottom', 'left', 'right'];
  const write = (change: Partial<typeof legend>) =>
    target.write(setLegend(target.chart, change), { label: t('history.legend') });

  return (
    <PopoverTool label={t('legend.title')} icon={List}>
      <Row label={t('legend.show')}>
        <Toggle
          icon={Eye}
          size="sm"
          label={t('legend.show')}
          pressed={legend.show}
          onPressedChange={(show) => write({ show })}
        />
      </Row>
      <Row label={t('legend.position')}>
        <SegmentedControl<Side>
          aria-label={t('legend.position')}
          size="sm"
          disabled={!legend.show}
          options={sides.map((value) => ({
            value,
            label: t(`legend.${value}`),
            icon: SIDE_ICONS[value],
            iconOnly: true,
          }))}
          value={side}
          onValueChange={(next) => write({ position: positionOf(next) })}
        />
      </Row>
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- axes */

/**
 * The minimum or the maximum of an axis. Empty is "automatic": the chart picks the range from
 * its values. A number is written when it is committed (Enter, leaving the field, an arrow key),
 * and the small button takes the axis back to automatic.
 */
function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation('chart');
  return (
    <Field label={label} className="flex-1">
      <NumberField
        aria-label={label}
        size="sm"
        value={value ?? null}
        placeholder={t('axes.auto')}
        precision={6}
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        onValueChange={onChange}
        end={
          value !== undefined && (
            <button
              type="button"
              aria-label={t('axes.clear')}
              className="-me-1 inline-flex size-5 shrink-0 cursor-default items-center justify-center rounded-small text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg"
              onClick={() => onChange(null)}
            >
              <Icon icon={X} />
            </button>
          )
        }
      />
    </Field>
  );
}

function AxisSection({
  target,
  name,
  controls,
}: ToolProps & { name: AxisName; controls: AxisControls }) {
  const { t } = useTranslation('chart');
  const tx = useGestureTx();
  const burst = useBurstTx();
  const axis = target.chart.options.axes[name];
  const title = t(`axes.${controls.kind}`);
  const write = (change: AxisChange, txId?: string) =>
    target.write(setAxis(target.chart, name, change), { txId, label: t('history.axes') });

  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ui-fg">{title}</span>
      {controls.look && (
        <>
          <Row label={t('axes.show')}>
            <Toggle
              icon={Eye}
              size="sm"
              label={t('axes.show')}
              pressed={axis.show}
              onPressedChange={(show) => write({ show })}
            />
          </Row>
          <Row label={t('axes.grid')}>
            <Toggle
              icon={Grid3x3}
              size="sm"
              label={t('axes.grid')}
              // An axis that says nothing has the grid lines of its kind: the values have them.
              pressed={axis.gridLines ?? controls.gridByDefault}
              onPressedChange={(gridLines) => write({ gridLines })}
            />
          </Row>
          <LiveText
            label={t('axes.name')}
            value={axis.title ?? ''}
            placeholder={t('axes.name')}
            onChange={(text) => write({ title: text }, tx.id())}
            onEnd={tx.end}
          />
        </>
      )}
      {controls.range && (
        <div className="flex gap-2">
          <RangeField
            label={t('axes.min')}
            value={axis.min}
            max={axis.max}
            onChange={(min) => write({ min }, burst(`${name}.min`))}
          />
          <RangeField
            label={t('axes.max')}
            value={axis.max}
            min={axis.min}
            onChange={(max) => write({ max }, burst(`${name}.max`))}
          />
        </div>
      )}
    </div>
  );
}

/** The axes the chart's type has (CHT-03). A pie and a donut have none, and no tool. */
function AxesTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  const controls = axisControls(target.chart.chartType);
  const names = (['x', 'y'] as const).filter((name) => controls[name]);
  if (names.length === 0) return null;
  return (
    <PopoverTool label={t('axes.title')} icon={Axes}>
      {names.map((name, i) => (
        <div key={name} className="flex flex-col gap-3">
          {i > 0 && <Separator />}
          <AxisSection target={target} name={name} controls={controls[name]!} />
        </div>
      ))}
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- value labels */

function LabelsTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  return (
    <Toggle
      icon={Tag}
      size="sm"
      label={t('labels.title')}
      pressed={target.chart.options.labels}
      onMouseDown={keepFocus}
      onPressedChange={(labels) =>
        target.write(setLabels(target.chart, labels), { label: t('history.labels') })
      }
    />
  );
}

/* ---------------------------------------------------------------- colours */

/**
 * A colour for each series, over the chart colours of the theme (CHT-04). A pie and a donut
 * colour their slices, so there it is a colour for each slice. A drag in the picker is one undo
 * step.
 */
function ColorList({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  const theme = useDeck((s) => s.deck.theme);
  const tx = useGestureTx();
  const { chart } = target;
  const round = chart.chartType === 'pie' || chart.chartType === 'donut';
  const label = t('history.colors');
  const list = useRef<HTMLDivElement>(null);

  /**
   * A picker closed. The keyboard goes to the popover and not back to the swatch: a swatch that
   * has the focus shows its tooltip, and the next Esc would close that instead of the popover.
   */
  const onPickerClose = (event: Event) => {
    tx.end();
    event.preventDefault();
    list.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
  };

  return (
    <>
      <Field label={t(round ? 'colors.slices' : 'colors.series')}>
        <div ref={list} className="-me-2 flex max-h-56 flex-col overflow-y-auto pe-2">
          {coloredParts(chart, theme).map((part, i) => (
            <div key={i} className="flex min-h-control items-center justify-between gap-3">
              <span dir="auto" className="min-w-0 truncate text-sm text-ui-fg">
                {part.name || t('colors.unnamed')}
              </span>
              <ColorField
                size="sm"
                label={part.name || t('colors.unnamed')}
                value={part.color}
                onChange={(color) => {
                  if (color) {
                    target.write(setColor(chart, theme, i, color), { txId: tx.id(), label });
                  }
                }}
                onGestureEnd={tx.end}
                onCloseAutoFocus={onPickerClose}
              />
            </div>
          ))}
        </div>
      </Field>
      <Button
        size="sm"
        variant="secondary"
        icon={RotateCcw}
        disabled={!hasOwnColors(chart)}
        onClick={() => {
          tx.end();
          target.write(resetColors(chart), { label });
        }}
      >
        {t('colors.reset')}
      </Button>
    </>
  );
}

function ColorsTool({ target }: ToolProps) {
  const { t } = useTranslation('chart');
  return (
    <PopoverTool label={t('colors.title')} icon={Palette}>
      <ColorList target={target} />
    </PopoverTool>
  );
}

/** Row B, second group: how the chart looks. */
export function OptionTools() {
  const target = useChartTarget();
  if (!target) return null;
  return (
    <>
      <TitleTool target={target} />
      <LegendTool target={target} />
      <AxesTool target={target} />
      <LabelsTool target={target} />
      <ColorsTool target={target} />
    </>
  );
}
