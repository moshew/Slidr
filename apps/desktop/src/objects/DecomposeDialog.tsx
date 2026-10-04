import { findElement, findSlide, type Deck, type Frame } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import {
  Button,
  cx,
  Dialog,
  DialogContent,
  Icon,
  SegmentedControl,
  Spinner,
  UiProvider,
} from '@slidr/ui';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from '@slidr/ui/icons';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n';
import { focusStage, useAssetResolver, useElementSize, type Editor } from '../shell';
import { EditorProvider } from '../shell/editor';
import {
  conversionOf,
  decompose,
  decomposeBlock,
  previewRegion,
  replaceCommands,
  type Decomposition,
} from './decompose';

/*
 * The dialog of "Decompose into objects" (HTM-05). It converts first and changes nothing: the
 * user sees the element as it is, as it would be, and where the two differ, and only "Decompose"
 * puts the parts in the deck, as one undo step.
 */

type Phase =
  { at: 'working' } | { at: 'ready'; result: Decomposition } | { at: 'failed'; message: string };

type View = 'before' | 'after' | 'diff';
const VIEWS: readonly View[] = ['before', 'after', 'diff'];

/** Width over height of the preview. */
const ASPECT = 16 / 9;

const counted = (t: TFunction<'objects'>, key: string, n: number): string =>
  n === 1 ? t(`${key}One`) : t(`${key}Many`, { n });

/**
 * A region of a slide, drawn by the renderer itself and scaled to the width it is given: the
 * same DOM the Stage draws, so the preview is the element and not a picture of it.
 */
function Region({
  deck,
  slideId,
  region,
  scale,
  className,
}: {
  deck: Deck;
  slideId: string;
  region: Frame;
  scale: number;
  className?: string;
}) {
  const resolveAsset = useAssetResolver();
  const slide = findSlide(deck, slideId);
  if (!slide) return null;
  // Physical left and top, as the renderer's own scaled slide: in a right-to-left dialog a
  // block wider than its box would otherwise hang off the right.
  const placed: CSSProperties = {
    left: 0,
    top: 0,
    transformOrigin: '0 0',
    transform: `scale(${scale}) translate(${-region.x}px, ${-region.y}px)`,
  };
  return (
    <div className={cx('absolute', className)} style={placed}>
      <SlideRenderer deck={deck} slide={slide} mode="thumbnail" resolveAsset={resolveAsset} />
    </div>
  );
}

/** Marks on the preview where the parts look different, in the slide's own pixels. */
function Marks({ result, region, scale }: { result: Decomposition; region: Frame; scale: number }) {
  const marks = result.differences.flatMap((difference) => {
    const part = difference.elementId
      ? result.elements.find((element) => element.id === difference.elementId)
      : undefined;
    const frame = part?.frame ?? difference.frame;
    return frame ? [{ frame, rotation: part?.rotation ?? 0, kind: difference.kind }] : [];
  });
  return marks.map(({ frame, rotation }, i) => {
    const box: CSSProperties = {
      left: (result.origin.x + frame.x - region.x) * scale,
      top: (result.origin.y + frame.y - region.y) * scale,
      width: frame.w * scale,
      height: frame.h * scale,
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
    };
    return (
      <div
        key={i}
        aria-hidden
        data-testid="decompose-mark"
        className="pointer-events-none absolute rounded-small border-2 border-dashed border-ui-danger"
        style={box}
      />
    );
  });
}

function Preview({ before, result, view }: { before: Deck; result: Decomposition; view: View }) {
  const box = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(box);
  const region = useMemo(() => {
    const slide = findSlide(before, result.slideId);
    const element = slide ? findElement(slide, result.elementId) : undefined;
    if (!element) return { x: 0, y: 0, ...sizeOf(before) };
    const frame = {
      ...element.frame,
      x: result.origin.x + element.frame.x,
      y: result.origin.y + element.frame.y,
    };
    return previewRegion(frame, element.rotation, sizeOf(before), ASPECT);
  }, [before, result]);
  const scale = width > 0 ? width / region.w : 0;
  return (
    <div
      ref={box}
      data-testid="decompose-preview"
      data-view={view}
      className="relative isolate aspect-video w-full overflow-hidden rounded-control border border-ui-line bg-ui-canvas"
    >
      {scale > 0 && (
        <>
          {view !== 'after' && (
            <Region deck={before} slideId={result.slideId} region={region} scale={scale} />
          )}
          {view !== 'before' && (
            <Region
              deck={result.after}
              slideId={result.slideId}
              region={region}
              scale={scale}
              // Over the original, pixel against pixel: what is the same goes black.
              className={view === 'diff' ? 'mix-blend-difference' : undefined}
            />
          )}
          {view !== 'before' && <Marks result={result} region={region} scale={scale} />}
        </>
      )}
    </div>
  );
}

const sizeOf = (deck: Deck) => ({ w: deck.size.w, h: deck.size.h });

function Summary({ result }: { result: Decomposition }) {
  const { t } = useTranslation('objects');
  const kinds = (['text', 'look', 'region'] as const)
    .map((kind) => ({
      kind,
      n: result.differences.filter((difference) => difference.kind === kind).length,
    }))
    .filter(({ n }) => n > 0);
  const kindLabel = { text: 'kindText', look: 'kindLook', region: 'kindRegion' } as const;
  if (result.unchanged) {
    return (
      <div className="flex items-start gap-2">
        <Icon icon={Info} className="mt-0.5 shrink-0 text-ui-fg-muted" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{t('decompose.unchangedTitle')}</span>
          <span className="text-ui-fg-muted">{t('decompose.unchangedBody')}</span>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="decompose-summary" className="flex flex-col gap-2">
      <p data-testid="decompose-parts">
        <span className="font-medium">{counted(t, 'decompose.parts', result.elements.length)}</span>{' '}
        <span className="text-ui-fg-muted">
          {result.counts.map(([type, n]) => `${t(`decompose.types.${type}`)}: ${n}`).join(' · ')}
        </span>
      </p>
      {result.differences.length === 0 ? (
        <p data-testid="decompose-same" className="flex items-center gap-2">
          <Icon icon={CircleCheck} className="shrink-0 text-ui-success-fg" />
          {t('decompose.same')}
        </p>
      ) : (
        <div data-testid="decompose-differences" className="flex items-start gap-2">
          <Icon icon={TriangleAlert} className="mt-0.5 shrink-0 text-ui-warning-fg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span>{counted(t, 'decompose.differences', result.differences.length)}</span>
            <span className="text-ui-fg-muted">
              {kinds
                .map(({ kind, n }) => {
                  const label = t(`decompose.${kindLabel[kind]}`);
                  return n > 1 ? `${label} (${n})` : label;
                })
                .join(' · ')}
            </span>
          </div>
        </div>
      )}
      {result.keptHtml > 0 && (
        <p data-testid="decompose-kept" className="flex items-start gap-2 text-ui-fg-muted">
          <Icon icon={Info} className="mt-0.5 shrink-0" />
          {counted(t, 'decompose.kept', result.keptHtml)}
        </p>
      )}
    </div>
  );
}

export function DecomposeDialog({
  editor,
  slideId,
  elementId,
  onClose,
}: {
  editor: Editor;
  slideId: string;
  elementId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('objects');
  // The deck as it is when the dialog opens: the dialog is modal, and the parts are of that deck.
  const [before] = useState(() => editor.bus.deck);
  const [phase, setPhase] = useState<Phase>({ at: 'working' });
  const [view, setView] = useState<View>('after');

  useEffect(() => {
    let gone = false;
    const slide = findSlide(before, slideId);
    const element = slide ? findElement(slide, elementId) : undefined;
    const block = element?.type === 'html' ? decomposeBlock(element) : undefined;
    const run = block
      ? Promise.reject(new Error(t(`decompose.blocked.${block}`)))
      : decompose(conversionOf(editor), before, slideId, elementId);
    run.then(
      (result) => {
        if (gone) return;
        setPhase({ at: 'ready', result });
      },
      (error: unknown) => {
        if (!gone) {
          setPhase({
            at: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      gone = true;
    };
  }, [editor, before, slideId, elementId, t]);

  const apply = () => {
    if (phase.at !== 'ready') return;
    const { result } = phase;
    // The deck of this moment: an agent's turn may have changed it while the dialog was open.
    const commands = replaceCommands(editor.bus.deck, slideId, elementId, result);
    if (commands.length) {
      editor.bus.batch(commands, { label: t('history.decompose') });
      const slide = findSlide(editor.bus.deck, slideId);
      const present = result.elements
        .map((element) => element.id)
        .filter((id) => slide && findElement(slide, id));
      editor.selection.getState().selectElements(present);
    }
    onClose();
  };

  const ready = phase.at === 'ready' ? phase.result : undefined;
  const footer =
    ready && !ready.unchanged ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          {t('decompose.cancel')}
        </Button>
        <Button variant="primary" data-testid="decompose-apply" onClick={apply}>
          {t('decompose.apply')}
        </Button>
      </>
    ) : phase.at === 'working' ? undefined : (
      <Button variant="primary" onClick={onClose}>
        {t('decompose.close')}
      </Button>
    );

  return (
    <Dialog open onOpenChange={(open) => !open && phase.at !== 'working' && onClose()}>
      <DialogContent
        title={t('decompose.title')}
        description={t('decompose.description')}
        closeLabel={phase.at === 'working' ? undefined : t('decompose.close')}
        footer={footer}
        data-testid="decompose-dialog"
        data-phase={phase.at}
        // Wider than a form: the preview is the point of this dialog.
        className="w-180! max-w-full"
      >
        {phase.at === 'working' && (
          <div role="status" className="flex items-center gap-2 py-4 text-ui-fg-muted">
            <Spinner />
            {t('decompose.working')}
          </div>
        )}
        {phase.at === 'failed' && (
          <div role="alert" className="flex items-start gap-2">
            <Icon icon={CircleAlert} className="mt-0.5 shrink-0 text-ui-danger-fg" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">{t('decompose.failed')}</span>
              <span className="break-words text-ui-fg-muted">{phase.message}</span>
            </div>
          </div>
        )}
        {ready && (
          <div className="flex flex-col gap-3">
            {!ready.unchanged && (
              <>
                <div className="flex items-center gap-3">
                  <SegmentedControl
                    aria-label={t('decompose.view')}
                    size="sm"
                    options={VIEWS.map((value) => ({ value, label: t(`decompose.${value}`) }))}
                    value={view}
                    onValueChange={setView}
                  />
                  {view === 'diff' && (
                    <span className="text-xs text-ui-fg-muted">{t('decompose.diffHint')}</span>
                  )}
                </div>
                <Preview before={before} result={ready} view={view} />
              </>
            )}
            <Summary result={ready} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

let closing: (() => void) | undefined;

/**
 * Opens the dialog for one `html` element. A React root of its own, like the export dialog: it
 * has a preview and a report, which the shell's question dialog does not. Does nothing while it
 * is open already.
 */
export function openDecomposeDialog(editor: Editor, slideId: string, elementId: string): void {
  if (closing) return;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  closing = () => {
    closing = undefined;
    root.unmount();
    host.remove();
    focusStage();
  };
  root.render(
    <UiProvider dir={i18n.dir()}>
      <EditorProvider editor={editor}>
        <DecomposeDialog
          editor={editor}
          slideId={slideId}
          elementId={elementId}
          onClose={() => closing?.()}
        />
      </EditorProvider>
    </UiProvider>,
  );
}
