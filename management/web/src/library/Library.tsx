import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import type { DisplayLang as Lang, Variant } from '../api';
import { FileFacts, FilePreview, Files } from './Files';
import { Fonts } from './Fonts';
import { WhenSeen } from './Lazy';
import { manifest, MEDIA_LIBRARY_URL, mediaUrl, size, type Manifest } from './media';
import { ItemOverlay } from './Overlay';
import { inSection, sectionOf, SECTIONS, type Section } from './sections';
import { useRead, type LibraryRoute } from './shared';

// Each part is loaded when it is opened: the app's readers it takes read their catalogs as they
// are imported, and none of them should hold up another part, or the studio.
const Designs = lazy(() => import('./Designs').then((m) => ({ default: m.Designs })));
const Templates = lazy(() => import('./Templates').then((m) => ({ default: m.Templates })));
const Cards = lazy(() => import('./Cards').then((m) => ({ default: m.Cards })));
const Frames = lazy(() => import('./Frames').then((m) => ({ default: m.Frames })));
const Shapes = lazy(() => import('./Shapes').then((m) => ({ default: m.Shapes })));
const Stickers = lazy(() => import('./Stickers').then((m) => ({ default: m.Stickers })));
const Art = lazy(() => import('./Art').then((m) => ({ default: m.Art })));
const Icons = lazy(() => import('./Icons').then((m) => ({ default: m.Icons })));
const ArtPeek = lazy(() => import('./Art').then((m) => ({ default: m.ArtPeek })));
const CardsPeek = lazy(() => import('./Cards').then((m) => ({ default: m.CardsPeek })));
const ShapesPeek = lazy(() => import('./Shapes').then((m) => ({ default: m.ShapesPeek })));
const IconsPeek = lazy(() => import('./Icons').then((m) => ({ default: m.IconsPeek })));

export type { LibraryRoute };

const OVERVIEW = 'overview';

function totals(read: Manifest | undefined, section: Section) {
  let count = 0;
  let bytes = 0;
  for (const [path, file] of Object.entries(read?.files ?? {})) {
    if (!inSection(section, path)) continue;
    count += 1;
    bytes += file.size;
  }
  return { count, bytes };
}

/** A few pictures the library publishes for a section, to show what is in it. */
function pictures(read: Manifest | undefined, folder: string, count: number): string[] {
  return Object.keys(read?.files ?? {})
    .filter(
      (path) => path.startsWith(folder) && path.endsWith('.webp') && !path.endsWith('-bg.webp'),
    )
    .filter((_, i, all) => i % Math.max(1, Math.floor(all.length / count)) === 0)
    .slice(0, count);
}

/** What each part looks like, drawn from the library itself. */
const PEEKS: Record<string, () => ReactNode> = {
  cards: () => <CardsPeek />,
  shapes: () => <ShapesPeek />,
  // The illustrated graphics draw from this set, among others.
  graphics: () => <ArtPeek set="streamline-stickies-color" />,
  emoji: () => (
    <ArtPeek
      set="twemoji"
      names={[
        'grinning-face',
        'party-popper',
        'red-heart',
        'thumbs-up',
        'rocket',
        'star-struck',
        'sparkles',
        'light-bulb',
      ]}
    />
  ),
  art: () => <ArtPeek set="noto" />,
  icons: () => <IconsPeek />,
  fonts: () => (
    <span className="peek">
      <span className="peek-glyph fonts">
        <span style={{ fontFamily: 'Heebo' }}>אב</span>
        <span style={{ fontFamily: 'Frank Ruhl Libre' }}>גד</span>
        <span style={{ fontFamily: 'Karantina' }}>הו</span>
        <span style={{ fontFamily: 'Playfair Display' }}>Aa</span>
        <span style={{ fontFamily: 'JetBrains Mono' }}>{'{}'}</span>
      </span>
    </span>
  ),
  files: () => (
    <span className="peek">
      <span className="peek-glyph mono" dir="ltr">
        manifest.json
      </span>
    </span>
  ),
};

/** The folder of pictures a part shows a few of. */
const PICTURES: Record<string, string> = {
  designs: 'images/designs/',
  templates: 'images/templates/',
  frames: 'images/frames/he/',
};

function Peek({ section, read }: { section: Section; read?: Manifest }) {
  const folder = PICTURES[section.id];
  if (!folder) {
    return <Suspense fallback={<span className="peek" />}>{PEEKS[section.id]?.()}</Suspense>;
  }
  return (
    <span className="peek photos">
      {pictures(read, folder, 4).map((path) => (
        <img key={path} src={mediaUrl(path)} alt="" loading="lazy" />
      ))}
    </span>
  );
}

const files = (count: number) => (count === 1 ? 'קובץ אחד' : `${count} קבצים`);

function Overview({ go }: { go: (route: LibraryRoute) => void }) {
  const read = useRead(manifest, []);
  return (
    <div className="lib-grid overview">
      {SECTIONS.map((section) => {
        const { count, bytes } = totals(read.value, section);
        return (
          <button
            type="button"
            key={section.id}
            className="lib-card section-card"
            onClick={() => go({ section: section.id })}
          >
            <WhenSeen ratio="5 / 2">
              <Peek section={section} read={read.value} />
            </WhenSeen>
            <span className="lib-card-body">
              <span className="lib-card-title">{section.name}</span>
              <span className="muted small">{section.about}</span>
              <span className="lib-card-meta small muted">
                {read.value ? `${files(count)} · ${size(bytes)}` : '…'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const published = (when?: string) =>
  when
    ? new Date(when).toLocaleString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'לא ידוע';

/**
 * The media library as it is published: each of its parts, drawn as the app draws it, and every
 * file of it. Read-only: publishing goes through the publishing panel.
 */
export function Library({
  route,
  go,
  lang,
  variants,
  serverUrl,
  onOpenVariant,
}: {
  route: LibraryRoute;
  go: (route: LibraryRoute) => void;
  lang: Lang;
  variants: Record<string, Variant>;
  /** The library the server publishes to (`SLIDR_MEDIA_URL`). */
  serverUrl?: string;
  onOpenVariant: (variant: Variant) => void;
}) {
  const read = useRead(manifest, []);
  const section = sectionOf(route.section);
  // What was searched for, in the part it was typed in: another part starts without it.
  const [search, setSearch] = useState({ section: route.section, text: '' });
  const query = search.section === route.section ? search.text : '';
  const totalBytes = useMemo(
    () => Object.values(read.value?.files ?? {}).reduce((sum, file) => sum + file.size, 0),
    [read.value],
  );
  const other =
    serverUrl && serverUrl.replace(/\/?$/, '/') !== MEDIA_LIBRARY_URL ? serverUrl : undefined;

  const props = { route, go, query, lang };
  let content: ReactNode;
  switch (section?.id) {
    case 'designs':
      content = <Designs {...props} variants={variants} onOpenVariant={onOpenVariant} />;
      break;
    case 'templates':
      content = <Templates {...props} />;
      break;
    case 'cards':
      content = <Cards {...props} />;
      break;
    case 'frames':
      content = <Frames {...props} />;
      break;
    case 'shapes':
      content = <Shapes {...props} />;
      break;
    case 'graphics':
      content = <Stickers kind="graphics" {...props} />;
      break;
    case 'emoji':
      content = <Stickers kind="emoji" {...props} />;
      break;
    case 'art':
      content = <Art {...props} />;
      break;
    case 'icons':
      content = <Icons {...props} />;
      break;
    case 'fonts':
      content = <Fonts {...props} />;
      break;
    case 'files':
      content = <Files {...props} />;
      break;
    default:
      content = <Overview go={go} />;
  }

  return (
    <div className="library">
      <aside className="lib-nav" aria-label="חלקי הספרייה">
        <div className="lib-nav-head">
          <h2>ספריית המדיה</h2>
          <p className="muted small">
            פורסמה: {published(read.value?.published)}
            <br />
            {read.value
              ? `${Object.keys(read.value.files).length} קבצים · ${size(totalBytes)}`
              : '…'}
          </p>
          <a className="small" href={MEDIA_LIBRARY_URL} target="_blank" rel="noreferrer" dir="ltr">
            {MEDIA_LIBRARY_URL.replace(/^https:\/\//, '')}
          </a>
          {other && (
            <p className="warn small">
              השרת מפרסם ל-<span dir="ltr">{other}</span>; כאן מוצגת הספרייה שהאפליקציה קוראת.
            </p>
          )}
        </div>
        <nav className="lib-sections">
          <button
            type="button"
            aria-current={!section ? 'page' : undefined}
            onClick={() => go({ section: OVERVIEW })}
          >
            סקירה
          </button>
          {SECTIONS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              aria-current={section?.id === entry.id ? 'page' : undefined}
              onClick={() => go({ section: entry.id })}
            >
              {entry.name}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="ghost small"
          onClick={() => location.reload()}
          title="קורא שוב את הספרייה כפי שהיא מפורסמת עכשיו"
        >
          ↻ רענון
        </button>
      </aside>

      <div className="lib-main">
        <header className="lib-head">
          <div>
            <h2>{section?.name ?? 'סקירה'}</h2>
            <p className="muted small">
              {section?.about ??
                'מה שהאפליקציה קוראת מהספרייה, חלק אחר חלק, מצויר במנוע ובקוד של האפליקציה עצמה.'}
            </p>
          </div>
          {section && (
            <input
              type="search"
              className="lib-search"
              value={query}
              onChange={(event) => setSearch({ section: route.section, text: event.target.value })}
              placeholder={section.id === 'files' ? 'חיפוש לפי נתיב…' : 'חיפוש בעברית או באנגלית…'}
              aria-label="חיפוש"
            />
          )}
        </header>
        {read.error && <p className="error-text">לא ניתן לקרוא את הספרייה: {read.error}</p>}
        <Suspense fallback={<p className="muted">טוען…</p>}>{content}</Suspense>
      </div>

      {section?.id === 'files' && route.item && (
        <ItemOverlay
          key={route.item}
          title={<span dir="ltr">{route.item.split('/').at(-1)}</span>}
          subtitle={<span dir="ltr">{route.item}</span>}
          onClose={() => go({ ...route, item: undefined })}
          side={<FileFacts path={route.item} file={read.value?.files[route.item]} />}
        >
          <FilePreview path={route.item} file={read.value?.files[route.item]} />
        </ItemOverlay>
      )}
    </div>
  );
}
