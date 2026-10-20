import { useTranslation } from 'react-i18next';
import { cx, IconButton, Separator } from '@slidr/ui';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from '@slidr/ui/icons';

export interface ControlsProps {
  /** Shown while the pointer moves, like the pointer itself. */
  visible: boolean;
  /** The slide on show, from 1, and how many there are. */
  slide: number;
  total: number;
  full: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}

/**
 * The bar over a show, for whoever presents with a mouse or on a touch screen: back, forward,
 * full screen and the way out. It is always dark, whatever the app's theme, because it sits on a
 * slide; and it reads left to right in every language, like the arrow keys, where right is
 * forwards.
 */
export function Controls({
  visible,
  slide,
  total,
  full,
  onPrevious,
  onNext,
  onFullscreen,
  onExit,
}: ControlsProps) {
  const { t } = useTranslation('present');
  return (
    <div
      role="toolbar"
      aria-label={t('controls')}
      dir="ltr"
      data-theme="dark"
      data-testid="present-controls"
      data-visible={visible}
      // A click on the bar is not a click on the slide (the runtime's `bindControls`).
      data-slidr-control=""
      className={cx(
        'absolute inset-x-0 bottom-4 z-10 mx-auto flex w-fit items-center gap-0.5 rounded-panel border border-ui-line bg-ui-raised p-1 shadow-overlay transition-opacity duration-(--duration-slow)',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <IconButton
        icon={ChevronLeft}
        size="sm"
        label={t('previous')}
        tooltipSide="top"
        onClick={onPrevious}
      />
      {/* Said when the slide changes: "Slide 3 of 12", not the two numbers. */}
      <span
        role="status"
        className="min-w-12 px-1 text-center text-xs text-ui-fg-muted tabular-nums"
      >
        <span className="sr-only">{t('counter', { n: slide, total })}</span>
        <span aria-hidden>
          {slide} / {total}
        </span>
      </span>
      <IconButton
        icon={ChevronRight}
        size="sm"
        label={t('next')}
        tooltipSide="top"
        onClick={onNext}
      />
      <Separator orientation="vertical" className="mx-1 my-1" />
      <IconButton
        icon={full ? Minimize : Maximize}
        size="sm"
        label={full ? t('windowed') : t('fullscreen')}
        shortcut="F"
        tooltipSide="top"
        onClick={onFullscreen}
      />
      <IconButton
        icon={X}
        size="sm"
        label={t('exit')}
        shortcut="Esc"
        tooltipSide="top"
        onClick={onExit}
      />
    </div>
  );
}
