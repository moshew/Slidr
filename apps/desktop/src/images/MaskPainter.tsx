import type { AssetMeta } from '@slidr/model';
import { Button, Dialog, DialogContent, SegmentedControl, Slider, UiProvider } from '@slidr/ui';
import { Eraser } from '@slidr/ui/icons';
import { useRef, useState, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n';
import { focusStage } from '../shell';
import type { Editor } from '../shell/editor';
import { BRUSH, brushRadius, canvasPoint, hasPaint, maskPng, paintSize, shownSize } from './mask';

/*
 * Painting the area of an AI edit (AIO-04): the image, and over it a canvas the user paints on
 * with a round brush. What is painted is where the edit may happen; the result is stored with
 * the document as a mask asset, which `image_edit` takes by id.
 *
 * This file draws on the image itself, in the image's own pixels, like the Stage; the frame
 * around it is the design system's.
 */

type Tool = 'paint' | 'erase';

interface PainterProps {
  editor: Editor;
  /** The image to paint on: an asset of the deck with a known size. */
  asset: AssetMeta;
  /** The mask as an asset stored with the document, or null when the user gave up. */
  onDone: (mask: AssetMeta | null) => void;
}

export function MaskPainter({ editor, asset, onDone }: PainterProps) {
  const { t } = useTranslation('images');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('paint');
  const [size, setSize] = useState<number>(BRUSH.start);
  const [painted, setPainted] = useState(false);
  const [state, setState] = useState<'painting' | 'saving' | 'failed'>('painting');
  const last = useRef<{ x: number; y: number } | null>(null);
  const image = { width: asset.width ?? 1, height: asset.height ?? 1 };
  const area = paintSize(image);
  const shown = shownSize(area);
  const box = { width: shown.w, height: shown.h };
  const url = editor.assets.url(asset);

  /**
   * The ink is a token of the design system, as the theme in use resolves it: a canvas takes a
   * colour, not a variable, so the browser is asked what the variable is here.
   */
  const ink = useRef('');
  // Asked at the first stroke: the dialog is in a portal, which is not there yet when this mounts.
  const inkOf = (parent: HTMLElement | null): string => {
    if (!ink.current && parent) {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ui-danger)';
      parent.append(probe);
      ink.current = getComputedStyle(probe).color;
      probe.remove();
    }
    return ink.current;
  };

  const stroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const target = canvas.current;
    const g = target?.getContext('2d');
    if (!target || !g) return;
    const point = canvasPoint(event, target.getBoundingClientRect(), area);
    const from = last.current ?? point;
    g.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    g.strokeStyle = inkOf(target.parentElement);
    g.lineWidth = brushRadius(size, area) * 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(from.x, from.y);
    // A click without a move still leaves a dot.
    g.lineTo(point.x + (from === point ? 0.01 : 0), point.y);
    g.stroke();
    last.current = point;
  };

  const check = () => {
    const g = canvas.current?.getContext('2d');
    if (g) setPainted(hasPaint(g.getImageData(0, 0, area.w, area.h).data));
  };

  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, area.w, area.h);
    setPainted(false);
  };

  const save = async () => {
    if (!canvas.current) return;
    setState('saving');
    try {
      const blob = await maskPng(canvas.current, image);
      const name = `${(asset.name ?? 'image').replace(/\.[^.]+$/, '')}-mask.png`;
      onDone(await editor.assets.import(new File([blob], name, { type: 'image/png' })));
    } catch {
      setState('failed');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && state !== 'saving' && onDone(null)}>
      <DialogContent
        title={t('mask.title')}
        description={t('mask.description')}
        closeLabel={state === 'saving' ? undefined : t('mask.cancel')}
        data-testid="mask-painter"
        className="w-180! max-w-full"
        footer={
          <>
            <Button variant="ghost" disabled={state === 'saving'} onClick={() => onDone(null)}>
              {t('mask.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!painted}
              loading={state === 'saving'}
              data-testid="mask-done"
              onClick={() => void save()}
            >
              {t('mask.done')}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label={t('mask.tool')}
            size="sm"
            options={[
              { value: 'paint', label: t('mask.paint') },
              { value: 'erase', label: t('mask.erase') },
            ]}
            value={tool}
            onValueChange={setTool}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ui-fg-muted">{t('mask.brush')}</span>
            <div className="w-32 shrink-0">
              <Slider
                aria-label={t('mask.brush')}
                min={BRUSH.min}
                max={BRUSH.max}
                value={size}
                onValueChange={setSize}
              />
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" icon={Eraser} disabled={!painted} onClick={clear}>
            {t('mask.clear')}
          </Button>
        </div>
        {/* The image decides the shape; the box holds it whole, whichever way it is longer. */}
        <div className="flex justify-center overflow-hidden rounded-control bg-ui-canvas">
          <div className="relative shrink-0" style={box}>
            {url && (
              <img src={url} alt="" draggable={false} className="block size-full select-none" />
            )}
            <canvas
              ref={canvas}
              width={area.w}
              height={area.h}
              role="img"
              aria-label={t('mask.canvas')}
              data-testid="mask-canvas"
              className="absolute inset-0 size-full cursor-crosshair touch-none opacity-60"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                last.current = null;
                stroke(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons & 1) stroke(event);
              }}
              onPointerUp={() => {
                last.current = null;
                check();
              }}
            />
          </div>
        </div>
        <p role="status" className="text-xs text-ui-fg-muted">
          {state === 'failed' ? t('mask.failed') : painted ? '' : t('mask.empty')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

let closing: (() => void) | undefined;

/**
 * Asks the user to paint the area of an edit on an image. Resolves with the mask, stored with
 * the document as an asset (not yet part of the deck: it is a tool of one edit, and a file no
 * element refers to is dropped on save), or with null when the dialog was closed.
 */
export function paintMask(editor: Editor, asset: AssetMeta): Promise<AssetMeta | null> {
  if (closing) return Promise.resolve(null);
  return new Promise((resolve) => {
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
        <MaskPainter
          editor={editor}
          asset={asset}
          onDone={(mask) => {
            closing?.();
            resolve(mask);
          }}
        />
      </UiProvider>,
    );
  });
}
