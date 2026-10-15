import { findElement, findSlide, type HtmlElement } from '@slidr/model';
import { Button, Dialog, DialogContent, Icon, SegmentedControl, UiProvider } from '@slidr/ui';
import { Info } from '@slidr/ui/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n';
import { focusStage, useDeck, useEditor, useElementSize, type Editor } from '../shell';
import { EditorProvider } from '../shell/editor';
import { CodeEditor } from './CodeEditor';
import { originOf, previewRegion } from './decompose';
import { Region } from './DecomposeDialog';
import { codeOf, createCodeWriter, type CodePart } from './htmlCode';

/*
 * The code dialog (HTM-04): the HTML and the CSS of one `html` element, edited as text. What is
 * typed is written to the deck as it is typed, so the slide, the Filmstrip and an agent that
 * looks all see the same element; the dialog shows the element beside the code, since it covers
 * the Stage while it is open.
 */

const PARTS: readonly CodePart[] = ['markup', 'styles'];

/** Width over height of the preview. */
const ASPECT = 4 / 3;

/** The element as the slide draws it now, with what is around it. */
function Preview({ slideId, element }: { slideId: string; element: HtmlElement }) {
  const { t } = useTranslation('objects');
  const box = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(box);
  const deck = useDeck((s) => s.deck);
  const region = useMemo(() => {
    const slide = findSlide(deck, slideId);
    const origin = slide ? originOf(slide, element.id) : { x: 0, y: 0 };
    const frame = {
      ...element.frame,
      x: origin.x + element.frame.x,
      y: origin.y + element.frame.y,
    };
    return previewRegion(frame, element.rotation, { w: deck.size.w, h: deck.size.h }, ASPECT);
  }, [deck, slideId, element]);
  const scale = width > 0 ? width / region.w : 0;
  return (
    <div
      ref={box}
      role="img"
      aria-label={t('code.preview')}
      data-testid="code-preview"
      className="relative isolate aspect-4/3 w-full overflow-hidden rounded-control border border-ui-line bg-ui-canvas"
    >
      {scale > 0 && <Region deck={deck} slideId={slideId} region={region} scale={scale} />}
    </div>
  );
}

function PartEditor({
  slideId,
  element,
  part,
}: {
  slideId: string;
  element: HtmlElement;
  part: CodePart;
}) {
  const { t } = useTranslation('objects');
  const { bus } = useEditor();
  const elementId = element.id;
  const label = t('history.code');
  const writer = useMemo(
    () =>
      createCodeWriter({
        bus,
        slideId,
        elementId,
        part,
        label,
        element: () => {
          const slide = findSlide(bus.deck, slideId);
          const found = slide ? findElement(slide, elementId) : undefined;
          return found?.type === 'html' ? found : undefined;
        },
      }),
    [bus, slideId, elementId, part, label],
  );
  // What was typed and not yet written goes in before the editor goes away.
  useEffect(() => () => writer.flush(), [writer]);
  return (
    <CodeEditor
      language={part === 'markup' ? 'html' : 'css'}
      label={t(`code.${part}Label`)}
      value={codeOf(element, part)}
      own={writer.own}
      onChange={writer.type}
      onUndo={writer.undo}
      onRedo={writer.redo}
    />
  );
}

export function CodeDialog({
  slideId,
  elementId,
  onClose,
}: {
  slideId: string;
  elementId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('objects');
  const [part, setPart] = useState<CodePart>('markup');
  const element = useDeck((s) => {
    const slide = findSlide(s.deck, slideId);
    const found = slide ? findElement(slide, elementId) : undefined;
    return found?.type === 'html' ? found : undefined;
  });
  // The element may go while its code is open: an undo, or a turn of the agent's. The dialog
  // is a root of its own, and React does not take a root down from inside its own render.
  useEffect(() => {
    if (!element) queueMicrotask(onClose);
  }, [element, onClose]);
  if (!element) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('code.open')}
        description={t('code.live')}
        closeLabel={t('code.close')}
        footer={
          <Button variant="primary" data-testid="code-done" onClick={onClose}>
            {t('code.done')}
          </Button>
        }
        data-testid="code-dialog"
        // Wider than a form: the code and the element are side by side.
        size="wide"
        onEscapeKeyDown={(event) => {
          // In the code Escape is the editor's own: it frees Tab to move on (`codeView.ts`).
          if (event.target instanceof Element && event.target.closest('.cm-editor')) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <SegmentedControl
              aria-label={t('code.parts')}
              fill
              options={PARTS.map((value) => ({ value, label: t(`code.${value}`) }))}
              value={part}
              onValueChange={setPart}
            />
            {/* A long text scrolls in its place: the dialog stays inside the window. */}
            <div className="max-h-96 min-h-40 overflow-y-auto rounded-control">
              <PartEditor key={part} slideId={slideId} element={element} part={part} />
            </div>
          </div>
          <div className="flex w-60 shrink-0 flex-col gap-3">
            <Preview slideId={slideId} element={element} />
            {part === 'styles' && (
              <p className="text-xs text-ui-fg-muted">{t('code.stylesHint')}</p>
            )}
            {element.hasScripts && (
              <p
                data-testid="code-scripts"
                className="flex items-start gap-2 text-xs text-ui-fg-muted"
              >
                <Icon icon={Info} className="mt-0.5 shrink-0" />
                {t('code.scripts')}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

let closing: (() => void) | undefined;

/**
 * Opens the dialog for one `html` element. A React root of its own, like the decompose dialog.
 * Does nothing while it is open already.
 */
export function openCodeDialog(editor: Editor, slideId: string, elementId: string): void {
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
        <CodeDialog slideId={slideId} elementId={elementId} onClose={() => closing?.()} />
      </EditorProvider>
    </UiProvider>,
  );
}
