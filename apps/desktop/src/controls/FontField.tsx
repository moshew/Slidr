import {
  cx,
  FontPicker,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type FontGroup,
  type FontOption,
} from '@slidr/ui';
import { ChevronDown } from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { builtinFamilies, useSystemFonts } from '../fonts';
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

/** CSS finds a family whatever the case of its name, so one name in two cases is one font. */
const nameOf = (family: string) => family.toLowerCase();

/**
 * The fonts a deck can be set in, in the order of the list: the ones the deck carries as assets
 * (SPEC 5.7), the built-in library, and the ones installed on this computer (SPEC appendix B).
 * A family is listed once, in the first of the three that has it: the deck's file or the
 * library's is the one that draws it, whatever is installed under the same name.
 */
function useFontGroups(labels: { deck: string; library: string; system: string }): FontGroup[] {
  const assets = useDeck((s) => s.deck.assets);
  const installed = useSystemFonts();
  const { deck, library, system } = labels;
  return useMemo(() => {
    const known = new Set(builtin.map((f) => nameOf(f.family)));
    const carried: FontOption[] = [];
    for (const asset of Object.values(assets)) {
      const family = asset.kind === 'font' ? asset.font?.family : undefined;
      if (!family || known.has(nameOf(family))) continue;
      known.add(nameOf(family));
      carried.push({ family });
    }
    carried.sort((a, b) => a.family.localeCompare(b.family));
    const onComputer = installed.filter((font) => !known.has(nameOf(font.family)));
    return [
      { label: deck, fonts: carried },
      { label: library, fonts: builtin },
      { label: system, fonts: onComputer },
    ].filter((group) => group.fonts.length > 0);
  }, [assets, installed, deck, library, system]);
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
  const groups = useFontGroups({
    deck: t('font.deck'),
    library: t('font.library'),
    system: t('font.system'),
  });
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
          groups={groups}
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
