import type { LintFinding } from '@slidr/lint';
import { findElement } from '@slidr/model';
import { Button, Icon, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { CircleAlert, TriangleAlert, WandSparkles } from '@slidr/ui/icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { focusStage, StatusItem, useDeck, useEditor } from '../shell';
import { canFixWithAi, fixWithAi, useDeckChatBusy } from './ai';
import { checkOf } from './app';
import { he } from './messages';

/** A compact, deck-wide view of actionable findings, opened from the status bar. */
export function StatusCount() {
  const { t } = useTranslation('lint');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const { findings, pending, failed } = useStore(checkOf(editor).state);
  const busy = useDeckChatBusy();
  const [open, setOpen] = useState(false);
  const focusFinding = useRef(false);
  const issues = findings.filter((finding) => finding.severity !== 'info');
  const errors = issues.filter((finding) => finding.severity === 'error').length;
  const [dot, label] = failed
    ? ['bg-ui-danger-fg', t('panel.failed')]
    : issues.length > 0
      ? [
          errors > 0 ? 'bg-ui-danger-fg' : 'bg-ui-warning-fg',
          issues.length === 1
            ? t('status.finding')
            : t('status.findings', { count: issues.length }),
        ]
      : ['bg-ui-success-fg', t('status.none')];

  const goTo = (finding: LintFinding) => {
    const selection = editor.selection.getState();
    selection.setCurrentSlide(finding.slideId);
    selection.selectElements(finding.elementIds);
    focusFinding.current = true;
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t('status.open')}: ${label}`}
          data-testid="status-lint"
          data-errors={errors}
          data-problems={issues.length}
          className="flex min-w-0 cursor-default items-center rounded-control px-1 transition-colors hover:bg-ui-hover hover:text-ui-fg"
        >
          {pending && findings.length === 0 ? (
            <StatusItem busy>{t('status.checking')}</StatusItem>
          ) : (
            <StatusItem dot={dot}>{label}</StatusItem>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        data-testid="design-check"
        className="flex flex-col gap-3 overflow-y-auto overscroll-contain"
        onCloseAutoFocus={(event) => {
          if (!focusFinding.current) return;
          event.preventDefault();
          focusFinding.current = false;
          focusStage();
        }}
        style={{
          width: 360,
          maxHeight: 'min(70vh, var(--radix-popover-content-available-height))',
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ui-fg">{t('status.title')}</h2>
          <p className="text-xs text-ui-fg-muted">{t('status.explainer')}</p>
        </div>
        <div role="status" data-testid="design-check-summary" data-pending={pending || undefined}>
          {failed ? t('panel.failed') : pending ? t('panel.checking') : label}
        </div>
        {!failed && !pending && issues.length > 0 && (
          <>
            <p className="text-xs text-ui-fg-muted">{t('status.choose')}</p>
            <ul className="flex flex-col gap-1">
              {issues.map((finding, index) => {
                const slide = deck.slides.find((item) => item.id === finding.slideId);
                const number = deck.slides.findIndex((item) => item.id === finding.slideId) + 1;
                const first = finding.elementIds[0];
                const element = first && slide ? findElement(slide, first) : undefined;
                const where = element?.name ?? (element ? t(`element.${element.type}`) : undefined);
                const rule =
                  finding.rule in he.rule ? (finding.rule as keyof typeof he.rule) : 'other';
                return (
                  <li
                    key={`${finding.slideId}-${finding.rule}-${finding.elementIds.join('-')}-${index}`}
                    data-slide={finding.slideId}
                    data-finding={finding.rule}
                  >
                    <button
                      type="button"
                      onClick={() => goTo(finding)}
                      className="flex w-full cursor-default items-start gap-2 rounded-control px-2 py-1.5 text-start transition-colors hover:bg-ui-hover"
                    >
                      <Icon
                        icon={finding.severity === 'error' ? CircleAlert : TriangleAlert}
                        size="sm"
                        className={
                          finding.severity === 'error'
                            ? 'mt-0.5 shrink-0 text-ui-danger-fg'
                            : 'mt-0.5 shrink-0 text-ui-warning-fg'
                        }
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm text-ui-fg">{t(`rule.${rule}.title`)}</span>
                        <span className="text-xs text-ui-fg-muted" dir="auto">
                          {t('panel.slide', { n: number })}
                          {where ? ` · ${where}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {canFixWithAi(editor, 'deck') && (
              <Button
                size="sm"
                icon={WandSparkles}
                disabled={busy}
                data-testid="fix-with-ai"
                onClick={() => {
                  if (fixWithAi(editor, { kind: 'deck' })) setOpen(false);
                }}
              >
                {t('panel.fixWithAi')}
              </Button>
            )}
          </>
        )}
        {!failed && !pending && issues.length === 0 && (
          <p className="text-xs text-ui-fg-muted">{t('status.cleanBody')}</p>
        )}
        {failed && <p className="text-xs text-ui-fg-muted">{t('panel.failedBody')}</p>}
      </PopoverContent>
    </Popover>
  );
}
