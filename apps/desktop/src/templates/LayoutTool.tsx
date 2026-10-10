import { CommandBus, findSlide, type Deck, type Layout, type Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { changeLayout } from '@slidr/templates';
import { cx, IconButton, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { LayoutTemplate } from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssetResolver, useDeck, useEditor, useSelection } from '../shell';

/*
 * The "Layout" tool of row B, with nothing selected (SLD-02): the layouts of the deck, each
 * drawn with this slide on it, and a click moves the slide there with its content mapped by
 * role, as one step to undo. "New slide" picks a layout for a slide that does not exist yet;
 * this is the same choice for one that does.
 */

/** The width of a choice's picture, in px: three to a row in the popover. */
const THUMB = 168;

/** The slide as it would be on a layout: what a choice shows before it is taken. */
function onLayout(deck: Deck, slide: Slide, layout: Layout): { deck: Deck; slide: Slide } {
  const commands = changeLayout(deck, slide.id, layout.id);
  if (commands.length === 0) return { deck, slide };
  const scratch = new CommandBus(deck);
  scratch.batch(commands);
  return { deck: scratch.deck, slide: findSlide(scratch.deck, slide.id) ?? slide };
}

function Choices({ deck, slide }: { deck: Deck; slide: Slide }) {
  const { t } = useTranslation('templates');
  const { bus } = useEditor();
  const resolveAsset = useAssetResolver();
  const choices = useMemo(
    () => deck.layouts.map((layout) => ({ layout, ...onLayout(deck, slide, layout) })),
    [deck, slide],
  );
  return (
    <div className="flex flex-col gap-3" data-testid="layout-tool-choices">
      <h3 className="text-xs font-medium text-ui-fg-muted">{t('layout.title')}</h3>
      <div className="grid max-h-120 grid-cols-3 gap-3 overflow-y-auto p-0.5">
        {choices.map(({ layout, deck: shown, slide: drawn }) => {
          const current = layout.id === slide.layoutId;
          return (
            <button
              key={layout.id}
              type="button"
              aria-pressed={current}
              data-layout-choice={layout.id}
              onClick={() =>
                bus.batch(changeLayout(bus.deck, slide.id, layout.id), {
                  label: t('undo.layout'),
                })
              }
              className="flex min-w-0 cursor-default flex-col gap-1 text-start"
            >
              {/* A picture, with every word of the slide: the choice is named by its layout. */}
              <span
                aria-hidden
                className={cx(
                  'overflow-hidden rounded-inset border transition-colors',
                  current
                    ? 'border-ui-accent outline-2 outline-ui-accent'
                    : 'border-ui-line hover:border-ui-line-strong',
                )}
              >
                <ScaledSlide
                  deck={shown}
                  slide={drawn}
                  mode="thumbnail"
                  width={THUMB}
                  resolveAsset={resolveAsset}
                />
              </span>
              <span className="truncate text-xs text-ui-fg" dir="auto">
                {layout.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LayoutTool() {
  const { t } = useTranslation('templates');
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const [open, setOpen] = useState(false);
  if (!slide) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          icon={LayoutTemplate}
          label={t('layout.button')}
          size="sm"
          data-testid="layout-tool"
          className="[&_svg]:size-[18px]"
        />
      </PopoverTrigger>
      <PopoverContent className="w-xl">
        {deck.layouts.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('layout.none')}</p>
        ) : (
          // Drawn only while it is open: every choice is a slide of its own.
          open && <Choices deck={deck} slide={slide} />
        )}
      </PopoverContent>
    </Popover>
  );
}
