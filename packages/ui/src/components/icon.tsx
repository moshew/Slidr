import type { LucideIcon } from 'lucide-react';
import { cx } from '../cx';

export type { LucideIcon };

/** The two icon sizes of SPEC 4.0: 16 in controls and menus, 18 in the Activity Bar. */
export const iconSizes = { sm: 16, md: 18 } as const;
export type IconSize = keyof typeof iconSizes;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  /** Flips the icon in right-to-left layouts: arrows, chevrons, undo and redo. */
  mirror?: boolean;
  className?: string;
}

/** A Lucide icon at a design-system size and stroke (DSN-04). Decorative: label the control. */
export function Icon({ icon: Glyph, size = 'sm', mirror, className }: IconProps) {
  return (
    <Glyph
      aria-hidden
      size={iconSizes[size]}
      strokeWidth={1.75}
      className={cx('shrink-0', mirror && 'rtl:-scale-x-100', className)}
    />
  );
}
