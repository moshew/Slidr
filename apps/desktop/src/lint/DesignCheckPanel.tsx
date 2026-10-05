import type { LintFinding } from '@slidr/lint';
import { findElement, type Deck, type Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import {
  Button,
  cx,
  EmptyState,
  Icon,
  IconButton,
  SegmentedControl,
  Separator,
  Spinner,
  Tooltip,
} from '@slidr/ui';
import {
  CircleAlert,
  CircleCheck,
  Info,
  ScanEye,
  TriangleAlert,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { focusStage, useAssetResolver, useDeck, useEditor, useSelection } from '../shell';
import { canFixWithAi, fixWithAi, useDeckChatBusy } from './ai';
import { checkOf } from './app';
import { fixable } from './check';
import { he } from './messages';

/*
 * The "Design check" panel (LNT-03, WG7-T08): what the design lint finds on the open deck, by
 * slide. A finding leads to its objects on the Stage; "Fix" runs the rule's own fix as one step
 * to undo, "Fix all" every such fix, and "Fix with AI" hands the findings to the agent.
 */

type Severity = LintFinding['severity'];
type RuleId = keyof typeof he.rule;
type Shown = 'all' | 'problems';

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info'];
const MARK: Record<Severity, { icon: LucideIcon; tone: string }> = {
  error: { icon: CircleAlert, tone: 'text-ui-danger-fg' },
  warning: { icon: TriangleAlert, tone: 'text-ui-warning-fg' },
  info: { icon: Info, tone: 'text-ui-fg-muted' },
};
/** The width of a slide's picture beside its findings, in px. */
const THUMB = 96;

const known = (rule: string): RuleId => (rule in he.rule ? (rule as RuleId) : 'other');
const keyOf = (finding: LintFinding) =>
  `${finding.slideId} ${finding.rule} ${finding.elementIds.join(' ')} ${finding.message}`;

function useCount() {
  const { t } = useTranslation('lint');
  return (severity: Severity, count: number) =>
    count === 1 ? t(`panel.${severity}`) : t(`panel.${severity}s`, { count });
}

/** How many findings there are of each severity, with the icon of each. */
function Counts({ findings }: { findings: readonly LintFinding[] }) {
  const count = useCount();
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {SEVERITIES.map((severity) => {
        const n = findings.filter((f) => f.severity === severity).length;
        if (n === 0) return null;
        return (
          <span key={severity} className="flex items-center gap-1 text-xs text-ui-fg-muted">
            <Icon icon={MARK[severity].icon} size="sm" className={MARK[severity].tone} />
            {count(severity, n)}
          </span>
        );
      })}
    </span>
  );
}

/** What a finding is about, in words: the name of its object, or how many there are. */
function useWhere() {
  const { t } = useTranslation('lint');
  return (slide: Slide | undefined, finding: LintFinding): string => {
    const [first, ...rest] = finding.elementIds;
    if (first === undefined) return t('panel.wholeSlide');
    if (rest.length > 0) return t('panel.elements', { count: finding.elementIds.length });
    const element = slide ? findElement(slide, first) : undefined;
    if (!element) return t('panel.wholeSlide');
    return element.name ?? t(`element.${element.type}`);
  };
}

function Finding({
  finding,
  slide,
  open,
  onOpen,
}: {
  finding: LintFinding;
  slide: Slide | undefined;
  open: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation('lint');
  const editor = useEditor();
  const check = checkOf(editor);
  const pending = useStore(check.state, (s) => s.pending);
  const where = useWhere();
  const rule = known(finding.rule);
  const mark = MARK[finding.severity];
  const title = t(`rule.${rule}.title`);
  const place = where(slide, finding);

  const go = () => {
    const selection = editor.selection.getState();
    selection.setCurrentSlide(finding.slideId);
    selection.selectElements(finding.elementIds);
    onOpen();
    focusStage();
  };

  return (
    <li
      data-finding={finding.rule}
      data-severity={finding.severity}
      data-open={open || undefined}
      className={cx('rounded-control', open && 'bg-ui-hover')}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('panel.goTo', { title, where: place })}
          aria-expanded={open}
          onClick={go}
          className="flex min-w-0 flex-1 cursor-default items-start gap-2 rounded-control p-2 text-start transition-colors hover:bg-ui-hover"
        >
          <Icon icon={mark.icon} size="sm" className={cx('mt-0.5 shrink-0', mark.tone)} />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm text-ui-fg">{title}</span>
            <span className="truncate text-xs text-ui-fg-muted" dir="auto">
              {place}
            </span>
          </span>
        </button>
        {finding.fix && 'fix' in he.rule[rule] && (
          <Tooltip content={pending ? t('panel.cannotFix') : t(`rule.${rule}.fix`)}>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              data-fix={finding.rule}
              className="me-1 shrink-0"
              onClick={() => void check.fix(finding, t('undo.fix'))}
            >
              {t('panel.fix')}
            </Button>
          </Tooltip>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 px-2 pb-2 ps-8 text-xs text-ui-fg-muted">
          <p>{t(`rule.${rule}.advice`)}</p>
          <details>
            <summary className="cursor-default select-none text-ui-fg-muted">
              {t('panel.details')}
            </summary>
            <p className="pt-1 text-ui-fg-muted">{t('panel.detailsNote')}</p>
            <p dir="ltr" lang="en" className="pt-1 text-start font-mono text-ui-fg-muted">
              {finding.message}
            </p>
          </details>
        </div>
      )}
    </li>
  );
}

function SlideFindings({
  deck,
  slide,
  number,
  findings,
  open,
  onOpen,
  ai,
}: {
  deck: Deck;
  slide: Slide;
  number: number;
  findings: readonly LintFinding[];
  open: string | null;
  onOpen: (key: string) => void;
  ai: { off: boolean; why: string | undefined };
}) {
  const { t } = useTranslation('lint');
  const editor = useEditor();
  const resolveAsset = useAssetResolver();
  const current = useSelection((s) => s.currentSlideId === slide.id);
  const label = t('panel.slide', { n: number });
  return (
    <section
      aria-label={t('panel.slideFindings', { n: number })}
      data-slide={slide.id}
      className="flex flex-col gap-1"
    >
      <header className="flex items-center gap-2 px-2">
        <button
          type="button"
          aria-label={label}
          aria-current={current || undefined}
          onClick={() => {
            editor.selection.getState().setCurrentSlide(slide.id);
            focusStage();
          }}
          className={cx(
            'shrink-0 cursor-default overflow-hidden rounded-inset border transition-colors',
            current ? 'border-ui-accent' : 'border-ui-line hover:border-ui-line-strong',
          )}
        >
          <ScaledSlide
            deck={deck}
            slide={slide}
            mode="thumbnail"
            width={THUMB}
            resolveAsset={resolveAsset}
          />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-sm font-medium text-ui-fg" dir="auto">
            {slide.name ? `${label} · ${slide.name}` : label}
          </h3>
          <Counts findings={findings} />
        </div>
        <IconButton
          icon={WandSparkles}
          size="sm"
          label={ai.why ?? t('panel.fixSlideWithAi')}
          disabled={ai.off}
          data-testid="fix-slide-with-ai"
          onClick={() => fixWithAi(editor, { kind: 'slide', slideId: slide.id })}
        />
      </header>
      <ul className="flex flex-col gap-0.5">
        {findings.map((finding) => {
          const key = keyOf(finding);
          return (
            <Finding
              key={key}
              finding={finding}
              slide={slide}
              open={open === key}
              onOpen={() => onOpen(key)}
            />
          );
        })}
      </ul>
    </section>
  );
}

export function DesignCheckPanel() {
  const { t } = useTranslation('lint');
  const editor = useEditor();
  const check = checkOf(editor);
  const { findings, pending, failed } = useStore(check.state);
  const deck = useDeck((s) => s.deck);
  const busy = useDeckChatBusy();
  const [shown, setShown] = useState<Shown>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const visible = useMemo(
    () => (shown === 'all' ? findings : findings.filter((f) => f.severity !== 'info')),
    [findings, shown],
  );
  const bySlide = useMemo(() => {
    const groups = new Map<string, LintFinding[]>();
    for (const finding of visible) {
      if (!groups.has(finding.slideId)) groups.set(finding.slideId, []);
      groups.get(finding.slideId)!.push(finding);
    }
    return groups;
  }, [visible]);
  const fixes = findings.filter(fixable).length;
  const ai = {
    off: busy || !canFixWithAi(editor, 'deck'),
    why: busy ? t('panel.aiBusy') : canFixWithAi(editor, 'deck') ? undefined : t('panel.aiMissing'),
  };

  const fixAll = async () => {
    setFixing(true);
    setReport(null);
    try {
      const applied = await check.fixAll(t('undo.fixAll'));
      setReport(
        applied === 0
          ? t('panel.fixedNone')
          : applied === 1
            ? t('panel.fixedOne')
            : t('panel.fixed', { count: applied }),
      );
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-2 pt-1 pb-6" data-testid="design-check">
      <div className="flex flex-col gap-3 px-2">
        <div
          role="status"
          aria-label={t('panel.summary')}
          data-testid="design-check-summary"
          data-pending={pending || undefined}
          className="flex min-h-control items-center gap-2"
        >
          {failed ? (
            <span className="text-sm text-ui-danger-fg">{t('panel.failed')}</span>
          ) : findings.length === 0 && !pending ? (
            <span className="flex items-center gap-1.5 text-sm text-ui-fg">
              <Icon icon={CircleCheck} size="sm" className="text-ui-success-fg" />
              {t('panel.none')}
            </span>
          ) : (
            <Counts findings={findings} />
          )}
          {pending && (
            <span className="flex items-center gap-1.5 text-xs text-ui-fg-muted">
              <Spinner className="size-3" />
              {findings.length === 0 && t('panel.checking')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip content={t('panel.fixAllHint')}>
            <Button
              variant="primary"
              size="sm"
              icon={Wrench}
              disabled={fixes === 0 || pending}
              loading={fixing}
              data-testid="fix-all"
              onClick={() => void fixAll()}
            >
              {fixes > 0 ? t('panel.fixAllCount', { count: fixes }) : t('panel.fixAll')}
            </Button>
          </Tooltip>
          <Tooltip content={ai.why ?? t('panel.fixWithAiHint')}>
            <Button
              size="sm"
              icon={WandSparkles}
              disabled={ai.off || findings.length === 0}
              data-testid="fix-with-ai"
              onClick={() => fixWithAi(editor, { kind: 'deck' })}
            >
              {t('panel.fixWithAi')}
            </Button>
          </Tooltip>
        </div>
        <SegmentedControl<Shown>
          aria-label={t('panel.show')}
          size="sm"
          fill
          value={shown}
          onValueChange={setShown}
          options={[
            { value: 'all', label: t('panel.showAll') },
            { value: 'problems', label: t('panel.showProblems') },
          ]}
        />
        {report && (
          <p role="status" data-testid="fix-report" className="text-xs text-ui-fg-muted">
            {report}
          </p>
        )}
      </div>
      <Separator />
      {failed ? (
        <EmptyState
          icon={ScanEye}
          title={t('panel.failed')}
          description={t('panel.failedBody')}
          className="min-h-64"
        />
      ) : findings.length === 0 && !pending ? (
        <EmptyState
          icon={CircleCheck}
          title={t('panel.none')}
          description={t('panel.noneBody')}
          className="min-h-64"
        />
      ) : (
        <div className="flex flex-col gap-5">
          {deck.slides.map((slide, i) => {
            const own = bySlide.get(slide.id);
            if (!own) return null;
            return (
              <SlideFindings
                key={slide.id}
                deck={deck}
                slide={slide}
                number={i + 1}
                findings={own}
                open={open}
                onOpen={setOpen}
                ai={ai}
              />
            );
          })}
          {visible.length === 0 && findings.length > 0 && (
            <p className="px-2 text-xs text-ui-fg-muted">{t('panel.hidden')}</p>
          )}
        </div>
      )}
    </div>
  );
}
