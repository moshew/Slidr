import {
  cx,
  FontPicker,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type FontOption,
} from '@slidr/ui';
import { ChevronDown } from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { builtinFamilies } from '../fonts';
import { useDeck } from '../shell';
import { rememberFont, useRecent } from './recent';

export interface FontFieldProps {
  /** The family; null when the text takes its font from its style. */
  value: string | null;
  /** The selection has more than one family; `value` is then ignored. */
  mixed?: boolean;
  onChange: (family: string) => void;
  /** The accessible name and the tooltip: "Font". */
  label: string;
  /** What `null` shows: the family the style gives, e.g. the theme's body font. */
  fallback?: string;
  size?: 'sm' | 'md';
  /** Classes for the button, e.g. its width. */
  className?: string;
  /** Where the focus goes when the picker closes, e.g. back to the text editor. */
  onCloseAutoFocus?: (event: Event) => void;
}

const builtin: FontOption[] = builtinFamilies.map(({ family, scripts }) => ({
  family,
  hebrew: (scripts as readonly string[]).includes('he'),
}));

/** The built-in library (SPEC appendix B) and the fonts the deck carries as assets (SPEC 5.7). */
function useFonts(): FontOption[] {
  const assets = useDeck((s) => s.deck.assets);
  return useMemo(() => {
    const known = new Set(builtin.map((f) => f.family));
    const carried: FontOption[] = [];
    for (const asset of Object.values(assets)) {
      const family = asset.kind === 'font' ? asset.font?.family : undefined;
      if (!family || known.has(family)) continue;
      known.add(family);
      carried.push({ family });
    }
    return [...carried.sort((a, b) => a.family.localeCompare(b.family)), ...builtin];
  }, [assets]);
}

/** A font family in a toolbar or a panel: a button that opens the font picker (TXT-02). */
export function FontField({
  value,
  mixed = false,
  onChange,
  label,
  fallback,
  size = 'md',
  className,
  onCloseAutoFocus,
}: FontFieldProps) {
  const { t } = useTranslation('controls');
  const [open, setOpen] = useState(false);
  const fonts = useFonts();
  const recent = useRecent((s) => s.fonts);
  const shown = mixed ? t('mixed') : (value ?? fallback ?? '');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cx(
              'inline-flex shrink-0 cursor-default items-center justify-between gap-1.5 rounded-control px-2 text-sm font-medium text-ui-fg transition-colors select-none',
              'hover:bg-ui-hover active:bg-ui-pressed data-[state=open]:bg-ui-hover',
              size === 'md' ? 'h-control' : 'h-control-sm',
              className ?? 'w-36',
            )}
          >
            <span className={cx('min-w-0 truncate', mixed && 'text-ui-fg-muted')}>{shown}</span>
            <Icon icon={ChevronDown} className="-me-0.5 opacity-70" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent onCloseAutoFocus={onCloseAutoFocus} className="p-2">
        <FontPicker
          fonts={fonts}
          recent={recent}
          value={mixed ? null : (value ?? fallback ?? null)}
          labels={{
            search: t('font.search'),
            recent: t('font.recent'),
            all: t('font.all'),
            hebrew: t('font.hebrew'),
            empty: t('font.empty'),
          }}
          onValueChange={(family) => {
            rememberFont(family);
            onChange(family);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
