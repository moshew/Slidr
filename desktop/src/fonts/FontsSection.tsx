import { familyForDeck } from '@slidr/model';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx, Icon, IconButton, ScrollArea } from '@slidr/ui';
import {
  ChevronDown,
  HardDrive,
  Library,
  Presentation,
  Trash2,
  Upload,
  type LucideIcon,
} from '@slidr/ui/icons';
import { pickFiles } from '../objects/insert';
import { SettingsCard, SettingsGroup } from '../settings';
import { useDeck } from '../shell';
import { builtinFamilies } from './builtinFonts.generated';
import { useSystemFonts } from './systemFonts';
import {
  addUserFont,
  removeUserFont,
  UserFontError,
  useUserFonts,
  type UserFont,
} from './userFonts';

/*
 * The fonts' part of the settings screen (SPEC 4.2): which fonts the font picker offers and
 * where each comes from, and the one thing to do here: adding a font file of the user's own
 * (SPEC 5.7). There is no other management: a font is added, and can be taken out again.
 */

/** The files the dialog offers: the three kinds a font can be added as. */
const FONT_FILES = '.woff2,.ttf,.otf';

/** A list longer than this scrolls inside its own height. */
const LONG = 8;

/** Where fonts come from, but the user's own files, which have a card of their own. */
type Elsewhere = 'deck' | 'library' | 'system';

const sourceIcons: Record<Elsewhere, LucideIcon> = {
  deck: Presentation,
  library: Library,
  system: HardDrive,
};

/**
 * One of the places fonts come from: its name and how many families, a row of the card that
 * opens to say what being from there means, and to list them.
 */
function SourceList({
  source,
  count,
  open,
  onToggle,
  children,
}: {
  source: Elsewhere;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('fonts');
  return (
    <div data-font-source={source} data-count={count} className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-w-0 cursor-default items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-ui-hover focus-visible:-outline-offset-2 active:bg-ui-pressed"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-ui-field text-ui-fg-muted">
          <Icon icon={sourceIcons[source]} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">{t(`source.${source}`)}</span>
        <span className="rounded-full bg-ui-field px-2 text-xs font-medium text-ui-fg-muted tabular-nums">
          {count}
        </span>
        <Icon
          icon={ChevronDown}
          className={cx('text-ui-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-xs text-ui-fg-muted">{t(`from.${source}`)}</p>
          {children}
        </div>
      )}
    </div>
  );
}

/** Family names, one to a line; a long list scrolls. */
function Names({ names, empty }: { names: readonly string[]; empty?: string }) {
  if (names.length === 0) return empty ? <p className="text-sm text-ui-fg-muted">{empty}</p> : null;
  const list = (
    <ul className="flex flex-col px-2.5 py-1.5">
      {names.map((name) => (
        <li key={name} className="truncate py-0.5 text-sm">
          <bdi>{name}</bdi>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="overflow-hidden rounded-control bg-ui-field">
      {names.length > LONG ? <ScrollArea className="h-48">{list}</ScrollArea> : list}
    </div>
  );
}

const unique = (names: readonly string[]) =>
  [...new Map(names.map((name) => [name.toLowerCase(), name])).values()].sort((a, b) =>
    a.localeCompare(b),
  );

/** A sample of a font of the user's, drawn in it: Hebrew letters when it has them. */
function Sample({ font }: { font: UserFont }) {
  const face: CSSProperties = {
    fontFamily: `"${font.family}"`,
    fontWeight: font.weight.split(' ')[0],
    fontStyle: font.style,
  };
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-control bg-ui-tool-orange text-lg text-ui-tool-orange-fg"
      style={face}
    >
      {font.hebrew ? 'אב' : 'Aa'}
    </span>
  );
}

export function FontsSection() {
  const { t } = useTranslation('fonts');
  const mine = useUserFonts();
  const assets = useDeck((s) => s.deck.assets);
  const lang = useDeck((s) => s.deck.meta.lang);
  const installed = useSystemFonts();
  const [open, setOpen] = useState<Elsewhere | null>(null);
  const [adding, setAdding] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const carried = useMemo(
    () =>
      unique(
        Object.values(assets).flatMap((asset) =>
          asset.kind === 'font' && asset.font ? [asset.font.family] : [],
        ),
      ),
    [assets],
  );
  // As the font picker offers them to the open deck: its language's and English's.
  const library = useMemo(
    () => builtinFamilies.filter((entry) => familyForDeck(entry, lang)).map(({ family }) => family),
    [lang],
  );
  const system = useMemo(() => installed.map(({ family }) => family), [installed]);
  const toggle = (source: Elsewhere) => () => setOpen((now) => (now === source ? null : source));

  const add = async () => {
    const files = await pickFiles(FONT_FILES, true);
    if (files.length === 0) return;
    setAdding(true);
    const failed: Record<UserFontError['problem'], string[]> = { unreadable: [], storage: [] };
    for (const file of files) {
      try {
        await addUserFont(file);
      } catch (error) {
        failed[error instanceof UserFontError ? error.problem : 'storage'].push(file.name);
      }
    }
    setAdding(false);
    setProblems(
      (['unreadable', 'storage'] as const).flatMap((problem) =>
        failed[problem].length > 0 ? [t(problem, { files: failed[problem].join(', ') })] : [],
      ),
    );
  };

  /** What tells one file of a family from another: its weight, and italic when it is. */
  const face = (font: UserFont) =>
    [
      t('weight', { weight: font.weight.replace(' ', '–') }),
      ...(font.style === 'italic' ? [t('italic')] : []),
    ].join(' · ');

  return (
    <div className="flex flex-col gap-6" data-testid="settings-fonts">
      <div
        data-font-source="mine"
        data-count={unique(mine.map((font) => font.family)).length}
        className="flex flex-col gap-2"
      >
        <SettingsGroup title={t('source.mine')} note={t('about')}>
          {mine.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ui-fg-muted">{t('none.mine')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ui-line">
              {mine.map((font) => (
                <li
                  key={font.id}
                  data-user-font={font.family}
                  data-weight={font.weight}
                  className="flex items-center gap-3 py-2 ps-3 pe-2"
                >
                  <Sample font={font} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-ui-fg">
                      <bdi>{font.family}</bdi>
                    </span>
                    <span className="truncate text-xs text-ui-fg-muted">
                      {face(font)} · <bdi>{font.name}</bdi>
                    </span>
                  </span>
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={t('remove', { name: `${font.family} (${font.name})` })}
                    onClick={() => void removeUserFont(font.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col items-start gap-1.5 px-3 py-3">
            <Button
              icon={Upload}
              size="sm"
              loading={adding}
              data-testid="font-add"
              onClick={() => void add()}
            >
              {t('add')}
            </Button>
            <p className="text-xs text-ui-fg-muted">{t('formats')}</p>
          </div>
        </SettingsGroup>
        {problems.map((problem) => (
          <p key={problem} role="alert" className="px-1 text-xs text-ui-danger-fg">
            {problem}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="px-1 text-xs font-semibold text-ui-fg-muted">{t('elsewhere')}</h4>
        <SettingsCard>
          <SourceList
            source="deck"
            count={carried.length}
            open={open === 'deck'}
            onToggle={toggle('deck')}
          >
            <Names names={carried} empty={t('none.deck')} />
          </SourceList>
          <SourceList
            source="library"
            count={library.length}
            open={open === 'library'}
            onToggle={toggle('library')}
          >
            <Names names={library} />
          </SourceList>
          <SourceList
            source="system"
            count={system.length}
            open={open === 'system'}
            onToggle={toggle('system')}
          >
            <Names names={system} empty={t('none.system')} />
          </SourceList>
        </SettingsCard>
      </div>
    </div>
  );
}
