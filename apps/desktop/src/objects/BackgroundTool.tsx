import type { AssetMeta, Background, Command, Fill } from '@slidr/model';
import { Button, cx, Popover, PopoverContent, PopoverTrigger, Separator } from '@slidr/ui';
import { CopyCheck, PaintBucket, RotateCcw } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../controls';
import { useDeck, useEditor } from '../shell';
import {
  applyToAllCommands,
  inheritedBackground,
  variantIndex,
  withAdjust,
  withFill,
} from './background';
import { FillEditor } from './FillEditor';
import { Field, FillSwatch, Hint, SliderField } from './parts';
import { useCurrentSlide } from './target';

/** The strongest blur the slider offers, in slide pixels. */
const MAX_BLUR = 80;

/** A background as a small slide: the choices of the theme. */
function BackgroundChoice({
  background,
  label,
  selected,
  onClick,
}: {
  background: Background;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        className={cx(
          'h-9 w-16 shrink-0 cursor-default rounded-small transition-colors',
          selected && 'outline-2 outline-offset-2 outline-ui-accent',
        )}
      >
        <FillSwatch fill={background.fill} className="size-full" />
      </button>
    </Hint>
  );
}

/**
 * The slide background (SLD-03), row B with nothing selected: the theme's background and its
 * variants, a colour, a gradient or a picture (with blur and dim) for this slide, the same for
 * every slide, and back to the theme's.
 */
export function BackgroundTool() {
  const { t } = useTranslation('objects');
  const { bus } = useEditor();
  const deck = useDeck((s) => s.deck);
  const slide = useCurrentSlide();
  const tx = useGestureTx();
  if (!slide) return null;

  const inherited = inheritedBackground(deck, slide);
  const background = slide.background ?? inherited;
  const label = t('history.background');
  const variant = variantIndex(deck, slide.background);
  const toAll = applyToAllCommands(deck, slide.id);

  /** A step of a drag or of an edit on this slide's background; `tx.end` closes the undo step. */
  const change = (next: Background, asset?: AssetMeta) => {
    const commands: Command[] = [
      ...(asset ? [{ type: 'asset.add', asset } as const] : []),
      { type: 'slide.update', slideId: slide.id, patch: { background: next } },
    ];
    bus.batch(commands, { txId: tx.id(), label });
  };
  /** A whole step by itself: a choice of the theme, or back to it. */
  const set = (next: Background | null) => {
    tx.end();
    bus.dispatch(
      { type: 'slide.update', slideId: slide.id, patch: { background: next } },
      { label },
    );
  };

  return (
    <Popover onOpenChange={(open) => !open && tx.end()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" icon={PaintBucket}>
          {t('background.title')}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div data-testid="background-editor" className="flex flex-col gap-3">
          <Field label={t('background.theme')}>
            <div className="flex flex-wrap gap-2">
              <BackgroundChoice
                background={inherited}
                label={t('background.inherited')}
                selected={!slide.background}
                onClick={() => set(null)}
              />
              {deck.theme.backgroundVariants.map((choice, i) => (
                <BackgroundChoice
                  key={i}
                  background={choice}
                  label={t('background.variant', { n: i + 1 })}
                  selected={variant === i}
                  onClick={() => set(choice)}
                />
              ))}
            </div>
          </Field>
          <Separator />
          <Field label={t('background.custom')}>
            <FillEditor
              value={background.fill}
              allowNone={false}
              defaultColor={{ token: 'bg' }}
              onChange={(fill: Fill, asset) => change(withFill(background, fill), asset)}
              onGestureEnd={tx.end}
            />
          </Field>
          {background.fill.kind === 'image' && (
            <>
              <SliderField
                label={t('background.blur')}
                value={background.blur ?? 0}
                max={MAX_BLUR}
                unit="px"
                onChange={(blur) => change(withAdjust(background, { blur }))}
                onCommit={tx.end}
              />
              <SliderField
                label={t('background.dim')}
                value={Math.round((background.dim ?? 0) * 100)}
                unit="%"
                onChange={(percent) => change(withAdjust(background, { dim: percent / 100 }))}
                onCommit={tx.end}
              />
            </>
          )}
          <Separator />
          <div className="flex flex-col items-start gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={CopyCheck}
              disabled={toAll.length === 0}
              onClick={() => {
                tx.end();
                bus.batch(toAll, { label });
              }}
            >
              {t('background.applyAll')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              disabled={!slide.background}
              onClick={() => set(null)}
            >
              {t('background.reset')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
