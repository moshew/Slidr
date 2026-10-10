import { Button, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { Blend } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { nameLabel, useCurrentSlide } from './parts';
import { TransitionEditor } from './TransitionEditor';

/** The transition into the slide, used by the AI actions panel. */
export function TransitionTool() {
  const { t } = useTranslation('animations');
  const slide = useCurrentSlide();
  if (!slide) return null;
  const type = slide.transition?.type ?? 'none';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" icon={Blend} data-testid="transition-tool">
          {t('transition.title')}
          {/* What the slide has now, when it has one. */}
          {type !== 'none' && (
            <span className="font-normal text-ui-fg-muted">
              {nameLabel(`transition.${type}`, type)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="overflow-y-auto overscroll-contain"
        style={{
          width: 352,
          maxHeight: 'min(80vh, var(--radix-popover-content-available-height))',
        }}
        // To the chosen kind, not to the first tile of the gallery.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
            ?.focus();
        }}
      >
        <TransitionEditor />
      </PopoverContent>
    </Popover>
  );
}
