import { ToggleGroup } from 'radix-ui';
import { cx } from '../cx';
import { Icon, type LucideIcon } from './icon';
import { Tooltip } from './tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; the label becomes the tooltip and the accessible name. */
  iconOnly?: boolean;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Names the group for screen readers. */
  'aria-label': string;
  size?: 'sm' | 'md';
  /** Stretch the segments over the full width. */
  fill?: boolean;
  disabled?: boolean;
  className?: string;
}

/** One choice out of a few, all visible: a track with a raised thumb on the selected segment. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = 'md',
  fill = false,
  disabled = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix sends '' when the selected segment is clicked again; a segmented control keeps it.
      onValueChange={(next) => next && onValueChange(next as T)}
      disabled={disabled}
      aria-label={aria['aria-label']}
      className={cx(
        'inline-flex items-stretch gap-0.5 rounded-control bg-ui-field p-0.5',
        size === 'md' ? 'h-control' : 'h-control-sm',
        fill && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const item = (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option.iconOnly ? option.label : undefined}
            className={cx(
              'inline-flex cursor-default items-center justify-center gap-1.5 rounded-inset text-sm font-medium whitespace-nowrap text-ui-fg-muted transition-colors select-none',
              'hover:text-ui-fg focus-visible:outline-offset-0 disabled:text-ui-fg-subtle',
              'data-[state=on]:bg-ui-thumb data-[state=on]:text-ui-fg data-[state=on]:shadow-raised',
              option.iconOnly ? 'aspect-square' : 'px-2.5',
              fill && 'flex-1',
            )}
          >
            {option.icon && <Icon icon={option.icon} />}
            {!option.iconOnly && option.label}
          </ToggleGroup.Item>
        );
        return option.iconOnly ? (
          <Tooltip key={option.value} content={option.label}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}
