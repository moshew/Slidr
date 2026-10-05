import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, ScrollArea } from '@slidr/ui';
import { ChevronDown, ChevronUp, Trash2, Upload } from '@slidr/ui/icons';
import { pickFiles } from '../objects/insert';
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

type Source = 'mine' | 'deck' | 'library' | 'system';

/** One of the places fonts come from: its name, how many families, and the list when opened. */
function SourceList({
  source,
  count,
  open,
  onToggle,
  children,
}: {
  source: Source;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('fonts');
  return (
    <div data-font-source={source} data-count={count} className="flex flex-col gap-1">
      {/* Wider than the section by the button's own padding, so its words start where the
          section's do. */}
      <div className="-mx-2.5 flex">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          iconEnd={open ? ChevronUp : ChevronDown}
          className="min-w-0 flex-1"
          onClick={onToggle}
        >
          <span className="min-w-0 flex-1 truncate text-start">{t(`source.${source}`)}</span>
          <span className="font-normal text-ui-fg-muted">{count}</span>
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-1.5 pb-1">
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
    <ul className="flex flex-col">
      {names.map((name) => (
        <li key={name} className="truncate py-0.5 text-sm">
          <bdi>{name}</bdi>
        </li>
      ))}
    </ul>
  );
  return names.length > LONG ? <ScrollArea className="h-48">{list}</ScrollArea> : list;
}

const unique = (names: readonly string[]) =>
  [...new Map(names.map((name) => [name.toLowerCase(), name])).values()].sort((a, b) =>
    a.localeCompare(b),
  );

export function FontsSection() {
  const { t } = useTranslation('fonts');
  const mine = useUserFonts();
  const assets = useDeck((s) => s.deck.assets);
  const installed = useSystemFonts();
  const [open, setOpen] = useState<Source | null>('mine');
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
  const library = useMemo(() => builtinFamilies.map(({ family }) => family), []);
  const system = useMemo(() => installed.map(({ family }) => family), [installed]);
  const toggle = (source: Source) => () => setOpen((now) => (now === source ? null : source));

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
    setOpen('mine');
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
    <div className="flex flex-col gap-3" data-testid="settings-fonts">
      <p className="text-xs text-ui-fg-muted">{t('about')}</p>
      <div className="flex flex-col items-start gap-1.5">
        <Button icon={Upload} loading={adding} data-testid="font-add" onClick={() => void add()}>
          {t('add')}
        </Button>
        <p className="text-xs text-ui-fg-muted">{t('formats')}</p>
        {problems.map((problem) => (
          <p key={problem} role="alert" className="text-xs text-ui-danger-fg">
            {problem}
          </p>
        ))}
      </div>
      <div className="flex flex-col">
        <SourceList
          source="mine"
          count={unique(mine.map((font) => font.family)).length}
          open={open === 'mine'}
          onToggle={toggle('mine')}
        >
          {mine.length === 0 ? (
            <p className="text-sm text-ui-fg-muted">{t('none.mine')}</p>
          ) : (
            <ul className="flex flex-col">
              {mine.map((font) => (
                <li
                  key={font.id}
                  data-user-font={font.family}
                  data-weight={font.weight}
                  className="flex items-center gap-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col py-0.5">
                    <span className="truncate text-sm">
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
        </SourceList>
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
      </div>
    </div>
  );
}
