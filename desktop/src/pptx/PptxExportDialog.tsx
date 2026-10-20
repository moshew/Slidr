import type { PptxExportResult } from '@slidr/pptx';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Icon,
  NumberField,
  ScrollArea,
  SegmentedControl,
  Spinner,
} from '@slidr/ui';
import { CircleAlert, CircleCheck, TriangleAlert } from '@slidr/ui/icons';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chooseDestination,
  exportFileName,
  formatBytes,
  ltr,
  planExport,
  type Destination,
} from '../export/exportDeck';
import type { Editor } from '../shell';
import { exportPptxTo } from './exportPptx';
import { WarningList } from './WarningList';

/*
 * The PowerPoint export dialog (ADR-108): which slides, with or without their transitions and
 * animations; then where to save; then what went into the file and what PowerPoint shows
 * otherwise than Slidr. Its choices are the HTML export's, and so are their words (`export`).
 */

type Phase =
  | { at: 'choose' }
  | { at: 'working' }
  | { at: 'done'; result: PptxExportResult; destination: Destination; seconds: number }
  | { at: 'failed'; title: string; message: string };

/** A count in words: one string for one, another for more. */
const counted = (t: TFunction, key: string, n: number): string =>
  n === 1 ? t(`${key}One`) : t(`${key}Many`, { n });

export function PptxExportDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation('export');
  const { t: tp } = useTranslation('pptx');
  // The deck as it is when the dialog opens: the dialog is modal, and the file is of that deck.
  const [deck] = useState(() => editor.bus.deck);
  const total = deck.slides.length;
  const [ranged, setRanged] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(total);
  const [animations, setAnimations] = useState(true);
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });

  const range = ranged ? { from, to } : null;
  const plan = planExport(deck, range);

  const run = async () => {
    const name = exportFileName(
      editor.file.getState().path,
      deck.meta.title,
      t('app.untitled', { ns: 'shell' }),
      'pptx',
    );
    const destination = await chooseDestination(name, tp('filter'), 'pptx');
    if (!destination) return;
    setPhase({ at: 'working' });
    const outcome = await exportPptxTo(editor, deck, { range, animations }, destination);
    if (outcome.ok) setPhase({ at: 'done', ...outcome });
    else {
      setPhase({
        at: 'failed',
        title: outcome.step === 'save' ? t('failed.save') : t('failed.title'),
        message: outcome.message,
      });
    }
  };

  const close = (
    <Button variant={phase.at === 'done' ? 'primary' : 'ghost'} onClick={onClose}>
      {phase.at === 'choose' ? t('cancel') : t('close')}
    </Button>
  );
  const footer =
    phase.at === 'choose' ? (
      <>
        {close}
        <Button
          variant="primary"
          data-testid="pptx-export-run"
          disabled={plan.slideIds.length === 0}
          onClick={() => void run()}
        >
          {t('export')}
        </Button>
      </>
    ) : phase.at === 'working' ? undefined : (
      <>
        <Button variant="ghost" onClick={() => setPhase({ at: 'choose' })}>
          {t('again')}
        </Button>
        {close}
      </>
    );

  return (
    <Dialog open onOpenChange={(open) => !open && phase.at !== 'working' && onClose()}>
      <DialogContent
        title={tp('export.title')}
        description={tp('export.description')}
        closeLabel={phase.at === 'working' ? undefined : t('close')}
        footer={footer}
        data-testid="pptx-export-dialog"
        data-phase={phase.at}
      >
        {phase.at === 'choose' && (
          <div className="flex flex-col gap-4">
            <Field label={t('slides.label')}>
              <SegmentedControl
                aria-label={t('slides.label')}
                className="self-start"
                value={ranged ? 'range' : 'all'}
                onValueChange={(mode) => setRanged(mode === 'range')}
                options={[
                  { value: 'all', label: t('slides.all') },
                  { value: 'range', label: t('slides.range') },
                ]}
              />
              {ranged && (
                <div className="flex items-center gap-2">
                  <span>{t('slides.from')}</span>
                  <NumberField
                    aria-label={t('slides.from')}
                    className="w-16"
                    value={from}
                    min={1}
                    max={total}
                    onValueChange={setFrom}
                  />
                  <span>{t('slides.to')}</span>
                  <NumberField
                    aria-label={t('slides.to')}
                    className="w-16"
                    value={to}
                    min={1}
                    max={total}
                    onValueChange={setTo}
                  />
                </div>
              )}
              <p data-testid="pptx-export-count" className="text-xs text-ui-fg-muted">
                {plan.slideIds.length === 0
                  ? t('slides.none')
                  : [
                      counted(t, 'slides.count', plan.slideIds.length),
                      ...(plan.hidden > 0 ? [counted(t, 'slides.hidden', plan.hidden)] : []),
                    ].join(' ')}
              </p>
            </Field>
            <Field label={t('animations.label')}>
              <SegmentedControl
                aria-label={t('animations.label')}
                className="self-start"
                value={animations ? 'with' : 'without'}
                onValueChange={(mode) => setAnimations(mode === 'with')}
                options={[
                  { value: 'with', label: t('animations.with') },
                  { value: 'without', label: t('animations.without') },
                ]}
              />
              {!animations && (
                <p className="text-xs text-ui-fg-muted">{t('animations.withoutHint')}</p>
              )}
            </Field>
          </div>
        )}
        {phase.at === 'working' && (
          <div role="status" className="flex items-center gap-2 py-4 text-ui-fg-muted">
            <Spinner />
            {tp('export.working')}
          </div>
        )}
        {phase.at === 'failed' && (
          <div role="alert" className="flex items-start gap-2">
            <Icon icon={CircleAlert} className="mt-0.5 text-ui-danger-fg" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">{phase.title}</span>
              <span className="break-words text-ui-fg-muted">{phase.message}</span>
            </div>
          </div>
        )}
        {phase.at === 'done' && <Report {...phase} />}
      </DialogContent>
    </Dialog>
  );
}

/** What went into the file. */
function Report({
  result,
  destination,
  seconds,
}: {
  result: PptxExportResult;
  destination: Destination;
  seconds: number;
}) {
  const { t } = useTranslation('export');
  const { t: tp } = useTranslation('pptx');
  const where = destination.kind === 'file' ? destination.path : destination.name;
  const warnings = result.warnings.filter((w) => w.code !== 'fonts');
  return (
    <div data-testid="pptx-export-report" className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <Icon icon={CircleCheck} className="mt-0.5 text-ui-success-fg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">
            {destination.kind === 'file' ? t('done.saved') : t('done.downloaded')}
          </span>
          {/* A path reads left to right in every language. */}
          <span dir="ltr" className="truncate text-start text-xs text-ui-fg-muted">
            {where}
          </span>
          <span data-testid="pptx-export-summary" className="flex gap-1.5 text-xs text-ui-fg-muted">
            <bdi>{counted(t, 'done.slides', result.slides)}</bdi>·
            <bdi dir="ltr">{formatBytes(result.bytes.length)}</bdi>·
            <bdi>{t('done.seconds', { n: seconds.toFixed(1) })}</bdi>
          </span>
        </div>
      </div>
      <ScrollArea viewportClassName="max-h-72">
        <div className="flex flex-col gap-4 pe-3">
          {warnings.length > 0 && (
            <Field label={t('done.warnings')}>
              <WarningList warnings={warnings} group="exported" testId="pptx-export-warnings" />
            </Field>
          )}
          <Field label={t('done.assets')}>
            <span
              data-testid="pptx-export-media"
              className={result.media.files ? '' : 'text-ui-fg-muted'}
            >
              {result.media.files === 0
                ? tp('export.noMedia')
                : result.media.files === 1
                  ? tp('export.mediaOne', { size: ltr(formatBytes(result.media.bytes)) })
                  : tp('export.mediaMany', {
                      n: result.media.files,
                      size: ltr(formatBytes(result.media.bytes)),
                    })}
            </span>
          </Field>
          {result.fonts.length > 0 && (
            <Field label={tp('export.fonts')}>
              <span data-testid="pptx-export-fonts" className="flex items-start gap-2">
                <Icon icon={TriangleAlert} className="mt-0.5 shrink-0 text-ui-warning-fg" />
                <span>{tp('export.fontsBody')}</span>
              </span>
              <span className="text-xs text-ui-fg-muted">
                <bdi dir="ltr">{result.fonts.join(' · ')}</bdi>
              </span>
            </Field>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
