import { useMemo } from 'react';
import type { DisplayLang as Lang } from '../api';
import { iconSearchModule, iconsModule } from './app';
import { mediaUrl } from './media';
import { ItemOverlay, stepper } from './Overlay';
import { DrawingStage, Markup, Paged } from './Svg';
import { useRead, type LibraryRoute } from './shared';

type IconsMod = Awaited<ReturnType<typeof iconsModule>>;
type SearchMod = Awaited<ReturnType<typeof iconSearchModule>>;
type IconEntry = Awaited<ReturnType<IconsMod['iconIndex']>>[number];

const load = async () => {
  const [icons, search] = await Promise.all([iconsModule(), iconSearchModule()]);
  const [index, hebrew] = await Promise.all([icons.iconIndex(), icons.hebrewTags()]);
  return { icons, search, index, hebrew };
};

/** The sets as the icon panel offers them: two line sets, and Tabler's filled icons. */
const SETS = [
  { id: 'lucide', name: 'Lucide', of: (icon: IconEntry) => icon.set === 'lucide' },
  { id: 'tabler', name: 'Tabler', of: (icon: IconEntry) => icon.set === 'tabler' && !icon.filled },
  { id: 'tabler-filled', name: 'Tabler מלא', of: (icon: IconEntry) => icon.filled },
];

const FILES: Record<string, string[]> = {
  lucide: ['icons/lucide/icon-nodes.json', 'icons/lucide/tags.json'],
  tabler: ['icons/tabler/tabler-nodes-outline.json', 'icons/tabler/icons.json'],
  'tabler-filled': ['icons/tabler/tabler-nodes-filled.json', 'icons/tabler/icons.json'],
};

function IconTile({
  icons,
  icon,
  onOpen,
}: {
  icons: IconsMod;
  icon: IconEntry;
  onOpen: () => void;
}) {
  const svg = useRead(() => icons.iconMarkup(icon.id), [icons, icon.id]);
  return (
    <button type="button" className="tile" onClick={onOpen} title={icon.id}>
      <Markup svg={svg.value} className="tile-icon" />
      <span className="tile-label" dir="ltr">
        {icon.name}
      </span>
    </button>
  );
}

function IconDetail({
  icons,
  icon,
  hebrew,
  onClose,
  onStep,
}: {
  icons: IconsMod;
  icon: IconEntry;
  hebrew: Readonly<Record<string, readonly string[]>>;
  onClose: () => void;
  onStep?: (by: -1 | 1) => void;
}) {
  const svg = useRead(() => icons.iconMarkup(icon.id), [icons, icon.id]);
  const set = SETS.find((s) => s.of(icon));
  // The dictionary's Hebrew for the icon's words, as people type them.
  const words = [...icon.nameWords, ...icon.tagWords];
  const inHebrew = [...new Set(words.flatMap((word) => hebrew[word] ?? []))];
  return (
    <ItemOverlay
      title={<span dir="ltr">{icon.name}</span>}
      subtitle={
        <>
          <span dir="ltr">{icon.id}</span> · {set?.name}
        </>
      }
      onClose={onClose}
      onStep={onStep}
      side={
        <>
          <section>
            <h3>פרטים</h3>
            <dl className="facts">
              <dt>data-icon</dt>
              <dd dir="ltr">
                <code>{icon.id}</code>
              </dd>
              <dt>סגנון</dt>
              <dd>{icon.filled ? 'מלא' : 'קווי'}</dd>
              <dt>שם</dt>
              <dd dir="ltr">{icon.nameWords.join(' ')}</dd>
              <dt>תגיות</dt>
              <dd dir="ltr">{icon.tagWords.join(', ') || '—'}</dd>
              <dt>בעברית</dt>
              <dd>{inHebrew.join(', ') || '—'}</dd>
              <dt>קבצים</dt>
              <dd dir="ltr">
                {(FILES[set?.id ?? ''] ?? []).map((path) => (
                  <a
                    key={path}
                    href={mediaUrl(path)}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {path}
                  </a>
                ))}
              </dd>
            </dl>
          </section>
        </>
      }
    >
      <DrawingStage svg={svg.value} sizes={[192, 96, 48, 24]} />
    </ItemOverlay>
  );
}

function search(mod: SearchMod, list: readonly IconEntry[], query: string, filled: boolean) {
  return mod.searchIcons(list, query, { count: list.length, style: filled ? 'filled' : 'line' });
}

/** The icon sets, with the app's search in Hebrew and English. */
export function Icons({
  route,
  go,
  query,
}: {
  route: LibraryRoute;
  go: (route: LibraryRoute) => void;
  query: string;
  lang: Lang;
}) {
  const read = useRead(load, []);
  const set = SETS.find((s) => s.id === route.group);
  const found = useMemo(() => {
    if (!read.value) return [];
    const { index, search: mod } = read.value;
    const sets = set ? [set] : SETS;
    if (!query.trim()) return index.filter((icon) => sets.some((s) => s.of(icon)));
    // The search compares an icon of one style at a time, as the panel does.
    return sets.flatMap((s) => search(mod, index.filter(s.of), query, s.id === 'tabler-filled'));
  }, [read.value, set, query]);

  if (read.error) return <p className="error-text">{read.error}</p>;
  if (!read.value) return <p className="muted">טוען את האייקונים…</p>;
  const { icons, index, hebrew } = read.value;
  const ids = found.map((icon) => icon.id);
  const open = (id: string) => go({ ...route, item: id });
  const opened = index.find((icon) => icon.id === route.item);

  return (
    <>
      <div className="lib-filters">
        <div className="chips" role="group" aria-label="ערכה">
          <button
            type="button"
            className="chip"
            aria-pressed={!route.group}
            onClick={() => go({ section: 'icons' })}
          >
            הכול <span className="muted">{index.length}</span>
          </button>
          {SETS.map((s) => (
            <button
              type="button"
              key={s.id}
              className="chip"
              aria-pressed={route.group === s.id}
              onClick={() => go({ section: 'icons', group: s.id })}
            >
              {s.name} <span className="muted">{index.filter(s.of).length}</span>
            </button>
          ))}
        </div>
      </div>
      {found.length === 0 && <p className="muted">אין אייקונים שמתאימים לחיפוש.</p>}
      <Paged
        key={`${route.group}:${query}`}
        items={found}
        render={(icon) => (
          <IconTile key={icon.id} icons={icons} icon={icon} onOpen={() => open(icon.id)} />
        )}
      />
      {opened && (
        <IconDetail
          key={opened.id}
          icons={icons}
          icon={opened}
          hebrew={hebrew}
          onClose={() => go({ ...route, item: undefined })}
          onStep={stepper(ids, opened.id, open)}
        />
      )}
    </>
  );
}

/** The icon panel's first icons, drawn from the library: for the overview. */
export function IconsPeek() {
  const read = useRead(
    () =>
      iconsModule().then((icons) =>
        Promise.all(icons.STARTERS.slice(0, 8).map((name) => icons.iconMarkup(`lucide:${name}`))),
      ),
    [],
  );
  return (
    <span className="peek">
      {(read.value ?? []).map((svg, i) => (
        <Markup key={i} svg={svg} className="peek-art icon" />
      ))}
    </span>
  );
}
