import { useTranslation } from 'react-i18next';
import { cx, Icon, Tooltip } from '@slidr/ui';
import { usePanels, type PanelDefinition } from './registry';
import { togglePanel, useShell } from './store';

/** Short visible captions; tooltips and accessible names retain the full panel titles. */
const captions: Record<string, string> = {
  notes: 'navigation.notes',
  lint: 'navigation.lint',
  import: 'navigation.import',
};

const effectTones: Record<string, string> = {
  animations: 'bg-ui-tool-pink text-ui-tool-pink-fg',
  transitions: 'bg-ui-tool-blue text-ui-tool-blue-fg',
};

/**
 * The Activity Bar (SPEC 4.2) at the outer edge of the AI area: the AI tools, the other
 * panels, and settings at the bottom. Clicking the open panel collapses the Tool Panel.
 */
export function ActivityBar() {
  const { t } = useTranslation();
  const panels = usePanels();
  const slot = (name: PanelDefinition['slot']) => panels.filter((p) => p.slot === name);

  return (
    <nav
      aria-label={t('panels.tools')}
      data-testid="activity-bar"
      data-pane="activity"
      className="flex w-activitybar shrink-0 flex-col items-center gap-3 overflow-y-auto border-e border-ui-line bg-ui-chrome py-3"
    >
      <Section panels={slot('ai')} />
      <Section panels={slot('tools')} />
      <div className="flex-1" />
      <Section panels={slot('footer')} />
    </nav>
  );
}

function Section({ panels }: { panels: PanelDefinition[] }) {
  if (panels.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {panels.map((panel) => (
        <Item key={panel.id} panel={panel} />
      ))}
    </div>
  );
}

function Item({ panel }: { panel: PanelDefinition }) {
  const { t } = useTranslation();
  const active = useShell((s) => s.panelOpen && s.activePanel === panel.id);
  const label = t(panel.title);
  return (
    <Tooltip content={label} shortcut={panel.shortcut} side="end">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        data-panel={panel.id}
        onClick={() => togglePanel(panel.id)}
        className={cx(
          'inline-flex w-16 shrink-0 cursor-default flex-col items-center justify-center gap-1 rounded-control px-1 py-2 transition-colors',
          active
            ? 'bg-ui-accent-soft text-ui-accent-fg'
            : 'text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed',
        )}
      >
        {effectTones[panel.id] ? (
          <span
            className={cx(
              'flex size-8 items-center justify-center rounded-inset',
              effectTones[panel.id],
            )}
          >
            <Icon icon={panel.icon} size="lg" />
          </span>
        ) : (
          <Icon icon={panel.icon} size="lg" />
        )}
        <span className="w-full truncate text-center text-xs font-medium">
          {t(captions[panel.id] ?? panel.title)}
        </span>
      </button>
    </Tooltip>
  );
}
