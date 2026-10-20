import type { ChartType } from '@slidr/model';
import { cx, Icon } from '@slidr/ui';
import { useTranslation } from 'react-i18next';
import { useEditor, type ActionPopoverProps } from '../shell';
import { CHART_TYPES, typeIcons } from './icons';
import { insertChart } from './insert';

/**
 * The eight chart types as a gallery: an icon and a name for each. The Chart button of row A
 * shows it to insert a chart, and the type tool of row B to change the type of one, with the
 * current type marked.
 */
export function TypeGallery({
  current,
  onPick,
}: {
  current?: ChartType;
  onPick: (chartType: ChartType) => void;
}) {
  const { t } = useTranslation('chart');
  return (
    <div role="group" aria-label={t('insert.gallery')} className="grid grid-cols-4 gap-1">
      {CHART_TYPES.map((chartType) => (
        <button
          key={chartType}
          type="button"
          data-chart-type={chartType}
          aria-pressed={current === undefined ? undefined : chartType === current}
          className={cx(
            'flex cursor-default flex-col items-center gap-1.5 rounded-control px-1 py-2 text-xs transition-colors select-none',
            'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed',
            chartType === current
              ? 'bg-ui-accent-soft text-ui-accent-fg hover:bg-ui-accent-soft-hover hover:text-ui-accent-fg'
              : 'text-ui-fg-muted',
          )}
          onClick={() => onPick(chartType)}
        >
          <Icon icon={typeIcons[chartType]} size="md" />
          <span className="text-center leading-tight">{t(`types.${chartType}`)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * What the "Chart" button of row A opens (CHT-01): the gallery of chart types. A click inserts a
 * chart of that type in the middle of the slide, with sample data, selects it and closes the
 * gallery.
 */
export function ChartInsert({ close }: ActionPopoverProps) {
  const editor = useEditor();
  return (
    <TypeGallery
      onPick={(chartType) => {
        insertChart(editor, chartType);
        close();
      }}
    />
  );
}
