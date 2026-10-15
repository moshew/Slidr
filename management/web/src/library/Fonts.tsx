import { useMemo } from 'react';
import { registerLibraryFonts } from '../fonts';
import { manifest, mediaJson, size } from './media';
import { ItemOverlay, stepper } from './Overlay';
import { matches, useRead, type LibraryRoute } from './shared';

interface FontCatalog {
  families: { family: string; scripts: string[] }[];
  faces: { family: string; style: string; weight: string; path: string; unicodeRange?: string }[];
}

interface Notice {
  name: string;
  version?: string;
  license?: string;
  author?: string;
  homepage?: string;
  text?: string;
}

const HE = 'שפה ברורה, אות אחר אות: כך נראית המצגת שלכם';
const EN = 'Clear type, letter by letter: this is how your deck reads';

/** The weights a face covers: each hundred of a variable range, or its one weight. */
function weightsOf(weight: string): number[] {
  const [from, to] = weight.split(/\s+/).map(Number);
  if (!from) return [];
  if (!to) return [from];
  const all: number[] = [];
  for (let w = Math.ceil(from / 100) * 100; w <= to; w += 100) all.push(w);
  return all;
}

function familyWeights(catalog: FontCatalog, family: string) {
  const normal = new Set<number>();
  let italic = false;
  for (const face of catalog.faces) {
    if (face.family !== family) continue;
    if (face.style === 'italic') italic = true;
    else for (const w of weightsOf(face.weight)) normal.add(w);
  }
  return { weights: [...normal].sort((a, b) => a - b), italic };
}

/** The folder of a family in the library, from where its faces are. */
const folderOf = (catalog: FontCatalog, family: string) =>
  catalog.faces.find((face) => face.family === family)?.path.split('/')[1];

const fonts = () =>
  Promise.all([mediaJson<FontCatalog>('fonts/catalog.json'), registerLibraryFonts()]).then(
    ([catalog]) => catalog,
  );

function FontDetail({
  catalog,
  family,
  onClose,
  onStep,
}: {
  catalog: FontCatalog;
  family: string;
  onClose: () => void;
  onStep?: (by: -1 | 1) => void;
}) {
  const entry = catalog.families.find((f) => f.family === family);
  const folder = folderOf(catalog, family);
  const notice = useRead(
    () => mediaJson<Notice>(`fonts/${folder}/${folder}.notice.json`),
    [folder],
  );
  const files = useRead(manifest, []);
  const faces = catalog.faces.filter((face) => face.family === family);
  const { weights, italic } = familyWeights(catalog, family);
  const hebrew = entry?.scripts.includes('he');
  const bytes = faces.reduce((sum, face) => sum + (files.value?.files[face.path]?.size ?? 0), 0);

  return (
    <ItemOverlay
      title={<span dir="ltr">{family}</span>}
      subtitle={
        <>
          {hebrew ? 'עברית ולטינית' : 'לטינית בלבד'} · {faces.length} קבצים · {size(bytes)}
        </>
      }
      onClose={onClose}
      onStep={onStep}
      side={
        <>
          <section>
            <h3>רישיון</h3>
            {notice.error && <p className="error-text">{notice.error}</p>}
            {notice.value && (
              <>
                <dl className="facts" dir="ltr">
                  <dt>package</dt>
                  <dd>
                    {notice.value.name} {notice.value.version}
                  </dd>
                  <dt>license</dt>
                  <dd>{notice.value.license}</dd>
                  <dt>author</dt>
                  <dd>{notice.value.author}</dd>
                  {notice.value.homepage && (
                    <>
                      <dt>home</dt>
                      <dd>
                        <a href={notice.value.homepage} target="_blank" rel="noreferrer">
                          {notice.value.homepage}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                <details>
                  <summary>נוסח הרישיון</summary>
                  <pre className="file-text small" dir="ltr">
                    {notice.value.text}
                  </pre>
                </details>
              </>
            )}
          </section>
          <section>
            <h3>קבצים</h3>
            <ul className="plain-list" dir="ltr">
              {faces.map((face) => (
                <li key={face.path} title={face.unicodeRange}>
                  {face.path.split('/').at(-1)} · {face.style} {face.weight}
                  {files.value?.files[face.path] &&
                    ` · ${size(files.value.files[face.path]!.size)}`}
                </li>
              ))}
            </ul>
          </section>
        </>
      }
    >
      <div className="font-waterfall" style={{ fontFamily: JSON.stringify(family) }}>
        {weights.map((weight) => (
          <div key={weight} className="font-weight-row">
            <span className="tag" dir="ltr">
              {weight}
            </span>
            <div>
              {hebrew && (
                <p dir="rtl" style={{ fontWeight: weight }}>
                  {HE}
                </p>
              )}
              <p dir="ltr" style={{ fontWeight: weight }}>
                {EN}
              </p>
            </div>
          </div>
        ))}
        {italic && (
          <div className="font-weight-row">
            <span className="tag">italic</span>
            <p dir="ltr" style={{ fontStyle: 'italic' }}>
              {EN}
            </p>
          </div>
        )}
        <p className="font-glyphs" dir="ltr">
          {hebrew && 'אבגדהוזחטיכךלמםנןסעפףצץקרשת '}
          ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 ₪$€%&@#?!
        </p>
      </div>
    </ItemOverlay>
  );
}

/** The fonts of decks: a sample of each family, and its faces and licence up close. */
export function Fonts({
  route,
  go,
  query,
}: {
  route: LibraryRoute;
  go: (route: LibraryRoute) => void;
  query: string;
}) {
  const read = useRead(fonts, []);
  const catalog = read.value;
  const shown = useMemo(
    () => (catalog?.families ?? []).filter((f) => matches(query, f.family)).map((f) => f.family),
    [catalog, query],
  );
  if (read.error) return <p className="error-text">{read.error}</p>;
  if (!catalog) return <p className="muted">טוען…</p>;
  const open = (family: string) => go({ section: 'fonts', item: family });

  return (
    <>
      <div className="font-grid">
        {shown.map((family) => {
          const entry = catalog.families.find((f) => f.family === family)!;
          const hebrew = entry.scripts.includes('he');
          const { weights } = familyWeights(catalog, family);
          return (
            <button
              type="button"
              key={family}
              className="font-card"
              onClick={() => open(family)}
              style={{ fontFamily: JSON.stringify(family) }}
            >
              <span className="font-card-name">
                <bdi>{family}</bdi>
              </span>
              <span className="font-card-sample">
                {hebrew ? 'אבג דהו · Abc' : <bdi dir="ltr">Abc Def · 123</bdi>}
              </span>
              <span className="font-card-meta">
                {hebrew ? 'עברית + לטינית' : 'לטינית'} · {weights.length} משקלים
              </span>
            </button>
          );
        })}
      </div>
      {route.item && catalog.families.some((f) => f.family === route.item) && (
        <FontDetail
          key={route.item}
          catalog={catalog}
          family={route.item}
          onClose={() => go({ section: 'fonts' })}
          onStep={stepper(shown, route.item, open)}
        />
      )}
    </>
  );
}
