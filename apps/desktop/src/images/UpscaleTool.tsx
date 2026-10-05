import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Spinner,
  Tooltip,
} from '@slidr/ui';
import { ImageUpscale, X } from '@slidr/ui/icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { tell, useDeck, useEditor } from '../shell';
import {
  cancelUpscale,
  upscaleImage,
  upscalePercent,
  useUpscaleStatus,
  useUpscaleWork,
} from './upscale';
import { upscaleRefusal } from './upscaler';

/** The sizes the button shows before it knows what the model gives: so a missing model is seen. */
const FACTORS = [2, 4];

/**
 * A size in pixels, kept left to right inside a line of Hebrew: without the isolate a
 * right-to-left line shows the height before the width.
 */
const pixels = (width: number, height: number) =>
  `${String.fromCodePoint(0x2066)}${width} × ${height}${String.fromCodePoint(0x2069)}`;

/**
 * "Upscale" in row B of a picture (AIO-04): draws the picture again at two or four times its
 * size with the model that runs on this machine, and puts the result in its place as one undo
 * step. Each choice says what it gives, or why it cannot be taken: the model is not installed,
 * or the picture is too large. While the work runs, the button gives its place to how far the
 * work is and to the button that stops it.
 */
export function UpscaleTool({
  elementId,
  assetId,
}: {
  elementId: string;
  assetId: string | undefined;
}) {
  const { t } = useTranslation('images');
  const editor = useEditor();
  const status = useUpscaleStatus(editor);
  const work = useUpscaleWork(elementId);
  const asset = useDeck((s) => (assetId ? s.deck.assets[assetId] : undefined));
  const size =
    asset?.kind === 'image' && asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : undefined;

  // The button and what takes its place while the work runs are two elements: the keyboard
  // goes from the one that left to the one that came, instead of falling to the page.
  const place = useRef<HTMLSpanElement>(null);
  const working = Boolean(work);
  const was = useRef(working);
  useEffect(() => {
    if (was.current === working) return;
    was.current = working;
    const { activeElement, body } = document;
    if (activeElement === body || place.current?.contains(activeElement)) {
      place.current?.querySelector('button')?.focus({ preventScroll: true });
    }
  }, [working]);

  const run = (factor: number) => {
    upscaleImage(editor, elementId, factor, t('upscale.history')).catch(
      (error: unknown) =>
        void tell(t('upscale.failed'), error instanceof Error ? error.message : undefined),
    );
  };

  if (work) {
    const percent = upscalePercent(work);
    const progress = work.total > 0 ? t('upscale.working', { percent }) : t('upscale.starting');
    return (
      <span ref={place} className="contents" data-testid="image-upscale-work">
        <Tooltip content={progress}>
          <span
            role="status"
            className="flex h-control-sm items-center gap-1.5 px-1.5 text-xs text-ui-fg-muted tabular-nums"
          >
            <Spinner />
            <span className="sr-only">{progress}</span>
            {/* A number: it reads left to right in both languages. */}
            <span aria-hidden dir="ltr">
              {percent}%
            </span>
          </span>
        </Tooltip>
        <IconButton
          icon={X}
          size="sm"
          label={t('upscale.cancel')}
          data-testid="image-upscale-cancel"
          onClick={() => cancelUpscale(editor, elementId)}
        />
      </span>
    );
  }

  const factors = status?.factors.length ? status.factors : FACTORS;
  return (
    <span ref={place} className="contents">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={ImageUpscale}
            size="sm"
            label={t('upscale.title')}
            disabled={!size}
            data-testid="image-upscale"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {size &&
            factors.map((factor) => {
              const refusal = status ? upscaleRefusal(status, size, factor) : undefined;
              const hint =
                refusal === 'not_installed'
                  ? t('upscale.missing')
                  : refusal === 'too_large'
                    ? t('upscale.tooLarge')
                    : t('upscale.result', {
                        size: pixels(size.width * factor, size.height * factor),
                      });
              return (
                <DropdownMenuItem
                  key={factor}
                  // Until the status is in, nothing can be taken: there may be no model.
                  disabled={!status || Boolean(refusal)}
                  hint={status ? hint : undefined}
                  data-upscale={factor}
                  onSelect={() => run(factor)}
                >
                  {t('upscale.factor', { factor })}
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
