import type { ExportResult } from '@slidr/html-export';
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
import type { Editor } from '../shell';
import {
  chooseDestination,
  exportFileName,
  exportTo,
  fontFamilyName,
  formatBytes,
  ltr,
  planExport,
  planMedia,
  type Destination,
  type ExportChoices,
  type MediaPlan,
} from './exportDeck';
import { warningText } from './warnings';

/*
 * The export dialog (WG9-T12, SPEC 12): which slides, with or without animations; then where to
 * save; then what went into the file: its size, its assets and fonts, and what could not be
 * exported as it is in the deck.
 */

type Phase =
  | { at: 'choose' }
  | { at: 'working' }
  | { at: 'done'; result: ExportResult; destination: Destination; seconds: number }
  | { at: 'failed'; title: string; message: string };

/** A count in words: one string for one, another for more (see `messages.ts`). */
const counted = (t: TFunction<'export'>, key: string, n: number): string =>
  n === 1 ? t(`${key}One`) : t(`${key}Many`, { n });

export function ExportDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation('export');
  // The deck as it is when the dialog opens: the dialog is modal, and the file is of that deck.
  const [deck] = useState(() => editor.bus.deck);
  const total = deck.slides.length;
  const [ranged, setRanged] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(total);
  const [animations, setAnimations] = useState(true);
  const [mediaBeside, setMediaBeside] = useState(false);
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });

  const range = ranged ? { from, to } : null;
  const plan = planExport(deck, range);
  // The video and audio of the slides that will be exported, and what they weigh (MED-05).
  const media = planMedia(deck, plan.slideIds);
  const beside = media.assets.length > 0 && (mediaBeside || media.tooLarge);
  const choices: ExportChoices = { range, animations, media: beside ? 'beside' : 'inside' };

  const run = async () => {
    const name = exportFileName(
      editor.file.getState().path,
      deck.meta.title,
      t('app.untitled', { ns: 'shell' }),
    );
    const destination = await chooseDestination(name, t('filter'));
    // The save dialog was cancelled: the choices are still there.
    if (!destination) return;
    setPhase({ at: 'working' });
    const outcome = await exportTo(editor, deck, choices, destination);
    if (outcome.ok) setPhase({ at: 'done', ...outcome });
    else {
      const title =
        outcome.step === 'save'
          ? t('failed.save')
          : outcome.step === 'media'
            ? t('failed.media')
            : t('failed.title');
      setPhase({ at: 'failed', title, message: outcome.message });
    }
  };

  // One file, unless its video and audio go into a folder beside it (ADR-057).
  const withFolder =
    phase.at === 'done' ? phase.result.mediaFolder !== undefined : phase.at !== 'failed' && beside;

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
          data-testid="export-run"
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
        title={t('title')}
        description={withFolder ? t('descriptionBeside') : t('description')}
        closeLabel={phase.at === 'working' ? undefined : t('close')}
        footer={footer}
        data-testid="export-dialog"
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
              <p data-testid="export-count" className="text-xs text-ui-fg-muted">
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
            {media.assets.length > 0 && (
              <MediaChoice media={media} beside={beside} onChange={setMediaBeside} />
            )}
          </div>
        )}
        {phase.at === 'working' && (
          <div role="status" className="flex items-center gap-2 py-4 text-ui-fg-muted">
            <Spinner />
            {t('working')}
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
        {phase.at === 'done' && <Report editor={editor} {...phase} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Where the video and audio of the deck go (MED-05, EXP-08): inside the file, which stays one
 * file and grows by all of them, or in a folder beside it. Shown only for a deck that has any.
 * The size is said before the export, with a warning when it is large; media too large for one
 * file can only go beside it.
 */
function MediaChoice({
  media,
  beside,
  onChange,
}: {
  media: MediaPlan;
  beside: boolean;
  onChange: (beside: boolean) => void;
}) {
  const { t } = useTranslation('export');
  const count = counted(t, 'media.count', media.assets.length);
  const hint = beside
    ? media.tooLarge
      ? t('media.tooLarge', { count, size: ltr(formatBytes(media.bytes)) })
      : t('media.besideHint', { count, size: ltr(formatBytes(media.bytes)) })
    : media.large
      ? t('media.large', { count, size: ltr(formatBytes(media.inFile)) })
      : t('media.insideHint', { count, size: ltr(formatBytes(media.inFile)) });
  const warns = media.tooLarge || (!beside && media.large);
  return (
    <Field label={t('media.label')}>
      <SegmentedControl
        aria-label={t('media.label')}
        className="self-start"
        value={beside ? 'beside' : 'inside'}
        onValueChange={(where) => onChange(where === 'beside')}
        options={[
          { value: 'inside', label: t('media.inside'), disabled: media.tooLarge },
          { value: 'beside', label: t('media.beside') },
        ]}
      />
      <p
        data-testid="export-media"
        data-warning={warns}
        role={warns ? 'status' : undefined}
        className="flex items-start gap-2 text-xs text-ui-fg-muted"
      >
        {warns && <Icon icon={TriangleAlert} className="mt-0.5 shrink-0 text-ui-warning-fg" />}
        <span>{hint}</span>
      </p>
    </Field>
  );
}

/** What went into the file. */
function Report({
  editor,
  result,
  destination,
  seconds,
}: {
  editor: Editor;
  result: ExportResult;
  destination: Destination;
  seconds: number;
}) {
  const { t } = useTranslation('export');
  const assets = editor.bus.deck.assets;
  const fonts = result.fonts;
  const fontBytes = fonts.reduce((sum, font) => sum + font.bytes, 0);
  const fontOriginal = fonts.reduce((sum, font) => sum + font.originalBytes, 0);
  const where = destination.kind === 'file' ? destination.path : destination.name;
  // Video and audio that are in the folder beside the file are listed apart from what is in it.
  const inFile = result.assets.filter((asset) => asset.file === undefined);
  const besideFile = result.assets.filter((asset) => asset.file !== undefined);
  const nameOf = (id: string) => assets[id]?.name ?? assets[id]?.file ?? id;

  return (
    <div data-testid="export-report" className="flex flex-col gap-4">
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
          <span data-testid="export-summary" className="flex gap-1.5 text-xs text-ui-fg-muted">
            <bdi>{counted(t, 'done.slides', result.slides)}</bdi>·
            <bdi dir="ltr">{formatBytes(result.bytes)}</bdi>·
            <bdi>{t('done.seconds', { n: seconds.toFixed(1) })}</bdi>
          </span>
        </div>
      </div>
      <ScrollArea viewportClassName="max-h-72">
        <div className="flex flex-col gap-4 pe-3">
          {result.warnings.length > 0 && (
            <Field label={t('done.warnings')}>
              <ul data-testid="export-warnings" className="flex flex-col gap-1">
                {result.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Icon icon={TriangleAlert} className="mt-0.5 text-ui-warning-fg" />
                    <span className="min-w-0 break-words">{warningText(t, warning)}</span>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          {besideFile.length > 0 && result.mediaFolder !== undefined && (
            <Field label={t('done.media')}>
              <span data-testid="export-media-folder">
                {destination.kind === 'file'
                  ? t('done.mediaFolder', { folder: ltr(result.mediaFolder) })
                  : t('done.mediaDownloaded', { folder: ltr(result.mediaFolder) })}
              </span>
              <ul data-testid="export-media-files" className="flex flex-col gap-1">
                {besideFile.map((asset) => (
                  <li key={asset.id} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1">
                      <span dir="auto" className="truncate">
                        {nameOf(asset.id)}
                      </span>
                    </span>
                    <span dir="ltr" className="w-16 text-end tabular-nums">
                      {formatBytes(asset.originalBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label={t('done.assets')}>
            {inFile.length === 0 ? (
              <span className="text-ui-fg-muted">{t('done.noAssets')}</span>
            ) : (
              <ul data-testid="export-assets" className="flex flex-col gap-1">
                <li className="flex items-center gap-3 text-xs text-ui-fg-muted">
                  <span className="min-w-0 flex-1">{t('done.asset')}</span>
                  <span className="w-16 text-end">{t('done.original')}</span>
                  <span className="w-16 text-end">{t('done.embedded')}</span>
                </li>
                {inFile.map((asset) => (
                  <li key={asset.id} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span dir="auto" className="truncate">
                        {nameOf(asset.id)}
                      </span>
                      {asset.width !== undefined && asset.height !== undefined && (
                        <span dir="ltr" className="shrink-0 text-xs text-ui-fg-muted">
                          {asset.width}×{asset.height}
                        </span>
                      )}
                    </span>
                    <span dir="ltr" className="w-16 text-end text-ui-fg-muted tabular-nums">
                      {formatBytes(asset.originalBytes)}
                    </span>
                    <span dir="ltr" className="w-16 text-end tabular-nums">
                      {formatBytes(asset.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          {result.charts.count > 0 && (
            <Field label={t('done.charts')}>
              <span data-testid="export-charts">
                {result.charts.count === 1
                  ? t('done.chartsOne', { size: ltr(formatBytes(result.charts.bytes)) })
                  : t('done.chartsMany', {
                      n: result.charts.count,
                      size: ltr(formatBytes(result.charts.bytes)),
                    })}
              </span>
            </Field>
          )}
          <Field label={t('done.fonts')}>
            {fonts.length === 0 ? (
              <span className="text-ui-fg-muted">{t('done.noFonts')}</span>
            ) : (
              <>
                <span data-testid="export-fonts">
                  {fonts.length === 1
                    ? t('done.fontsOne', {
                        size: ltr(formatBytes(fontBytes)),
                        original: ltr(formatBytes(fontOriginal)),
                      })
                    : t('done.fontsMany', {
                        n: fonts.length,
                        size: ltr(formatBytes(fontBytes)),
                        original: ltr(formatBytes(fontOriginal)),
                      })}
                </span>
                <span className="text-xs text-ui-fg-muted">
                  <bdi dir="ltr">
                    {Array.from(new Set(fonts.map((font) => fontFamilyName(font.family)))).join(
                      ' · ',
                    )}
                  </bdi>
                </span>
              </>
            )}
          </Field>
        </div>
      </ScrollArea>
    </div>
  );
}
