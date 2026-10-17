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
  type FontSample,
} from '@slidr/ui';
import {
  contentLanguageOf,
  familyForDeck,
  familyOfLanguage,
  LANGUAGE_SCRIPT,
  type ContentLanguage,
} from '@slidr/model';
import { ChevronDown } from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { builtinFamilies, useSystemFonts, useUserFonts } from '../fonts';
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

/**
 * A phrase in each language whose letters are not Latin, drawn beside the name of each face that
 * has them: what the deck's text will look like.
 */
const SAMPLES: Partial<Record<ContentLanguage, string>> = {
  he: 'סגנון הגופן',
  ar: 'نمط الخط',
  ru: 'Стиль шрифта',
  vi: 'Kiểu phông chữ',
  hi: 'फ़ॉन्ट की शैली',
  ja: '書体の見本',
  ko: '글꼴 스타일',
  'zh-CN': '字体样式',
};

/** CSS finds a family whatever the case of its name, so one name in two cases is one font. */
const nameOf = (family: string) => family.toLowerCase();

/** Every family of the library, listed or not: one installed under the same name is the library's. */
const libraryNames = new Set(builtinFamilies.map(({ family }) => nameOf(family)));

/**
 * The library's fonts for a deck in `lang`: its language's own first, then English's
 * (`familyForDeck`); a family made for other letters is not offered. Each is marked when it has
 * the letters of the deck's language.
 */
function libraryFor(lang: string): FontOption[] {
  const own = contentLanguageOf(lang);
  const script = own && LANGUAGE_SCRIPT[own];
  const offered = builtinFamilies.filter((entry) => familyForDeck(entry, lang));
  const first = own ? offered.filter((entry) => familyOfLanguage(entry, own)) : offered;
  return [...new Set([...first, ...offered])].map(({ family, scripts }) => ({
    family,
    sample: script !== undefined && scripts.includes(script),
  }));
}

/**
 * The fonts a deck can be set in, in the order of the list: the ones the deck carries as assets
 * (SPEC 5.7), the user's own (added in the settings screen), the built-in library, and the ones
 * installed on this computer (SPEC appendix B). A family is listed once, in the first of them
 * that has it: the deck's file or the library's is the one that draws it, whatever is installed
 * under the same name. Of the library, the deck is offered the fonts of its language and of
 * English. Of a font of the user's or the computer's, only whether it has Hebrew letters is known.
 */
function useFontGroups(labels: {
  deck: string;
  mine: string;
  library: string;
  system: string;
}): FontGroup[] {
  const assets = useDeck((s) => s.deck.assets);
  const lang = useDeck((s) => s.deck.meta.lang);
  const own = useUserFonts();
  const installed = useSystemFonts();
  const { deck, mine, library, system } = labels;
  return useMemo(() => {
    const builtin = libraryFor(lang);
    const hebrew = contentLanguageOf(lang) === 'he';
    const known = new Set(libraryNames);
    const carried: FontOption[] = [];
    for (const asset of Object.values(assets)) {
      const family = asset.kind === 'font' ? asset.font?.family : undefined;
      if (!family || known.has(nameOf(family))) continue;
      known.add(nameOf(family));
      carried.push({ family });
    }
    carried.sort((a, b) => a.family.localeCompare(b.family));
    // A family of several files (regular, bold) is one line; it has Hebrew when a file has.
    const added = new Map<string, FontOption>();
    for (const font of own) {
      if (known.has(nameOf(font.family))) continue;
      const listed = added.get(nameOf(font.family));
      const sample = hebrew && (font.hebrew || listed?.sample === true);
      added.set(nameOf(font.family), { family: font.family, sample });
    }
    for (const name of added.keys()) known.add(name);
    const onComputer = installed
      .filter((font) => !known.has(nameOf(font.family)))
      .map(({ family, symbol, hebrew: letters }) => ({
        family,
        symbol,
        sample: hebrew && letters,
      }));
    return [
      { label: deck, fonts: carried },
      { label: mine, fonts: [...added.values()] },
      { label: library, fonts: builtin },
      { label: system, fonts: onComputer },
    ].filter((group) => group.fonts.length > 0);
  }, [assets, lang, own, installed, deck, mine, library, system]);
}

/** The phrase the picker draws in each face with the letters of a deck in `lang`, if any. */
function useSample(lang: string): FontSample | undefined {
  const { t, i18n } = useTranslation('controls');
  const own = contentLanguageOf(lang);
  const text = own && SAMPLES[own];
  if (!own || !text) return undefined;
  // Simplified Chinese by its script, not by the country it is written in.
  const named = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(
    own === 'zh-CN' ? 'zh-Hans' : own,
  );
  return { text, lang: own, label: t('font.letters', { language: named ?? own }) };
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
    mine: t('font.mine'),
    library: t('font.library'),
    system: t('font.system'),
  });
  const sample = useSample(useDeck((s) => s.deck.meta.lang));
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
            <span
              dir="auto"
              className={cx('min-w-0 flex-1 truncate text-start', mixed && 'text-ui-fg-muted')}
            >
              {shown}
            </span>
            <Icon icon={ChevronDown} className="-me-0.5 opacity-70" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-font-picker! max-w-[calc(100vw-4*var(--spacing))] p-3!"
      >
        <FontPicker
          groups={groups}
          sample={sample}
          recent={recent}
          value={mixed ? null : (value ?? fallback ?? null)}
          labels={{
            search: t('font.search'),
            recent: t('font.recent'),
            all: t('font.all'),
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
