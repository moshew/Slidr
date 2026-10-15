import type { AssetMeta } from '@slidr/model';
import { useMemo, useState } from 'react';
import type { DisplayLang as Lang, Variant } from '../api';
import { designAssetsModule, designsModule, messages, named } from './app';
import { DeckSlide } from './Lazy';
import { manifest, mediaUrl, size } from './media';
import { ItemOverlay, stepper } from './Overlay';
import { matches, useRead, type LibraryRoute } from './shared';

type Designs = Awaited<ReturnType<typeof designsModule>>;
type Assets = Awaited<ReturnType<typeof designAssetsModule>>;

const THUMB = 384;
const load = () => Promise.all([designsModule(), designAssetsModule()]);

type Source = 'all' | 'authored' | 'managed';

/** The app's names first, then the ones `managed.json` gives, then the id (`DesignsCollection`). */
const nameOf = (designs: Designs, id: string, lang: Lang) =>
  named(messages.elements, lang, 'designs', 'name', id) ?? designs.designName(id, lang) ?? id;
const groupNameOf = (designs: Designs, group: string, lang: Lang) =>
  named(messages.elements, lang, 'designs', 'group', group) ??
  designs.designGroupName(group, lang) ??
  group;

const previews = new Map<string, ReturnType<Designs['designPreview']>>();

/** A design as the gallery draws it, in a language: kept, since a slide is costly to build. */
function previewOf(designs: Designs, id: string, lang: Lang) {
  const key = `${id}:${lang}`;
  let preview = previews.get(key);
  if (!preview) {
    preview = designs.designPreview(id, lang);
    previews.set(key, preview);
  }
  return preview;
}

function DesignView({
  designs,
  id,
  lang,
  width,
  lazy,
}: {
  designs: Designs;
  id: string;
  lang: Lang;
  width?: number;
  lazy?: boolean;
}) {
  const { deck, slide, resolveAsset } = previewOf(designs, id, lang);
  return (
    <DeckSlide deck={deck} slide={slide} resolveAsset={resolveAsset} width={width} lazy={lazy} />
  );
}

function Picture({ asset, label }: { asset: AssetMeta; label: string }) {
  const files = useRead(manifest, []);
  const path = `images/designs/${asset.file}`;
  const file = files.value?.files[path];
  return (
    <figure className="picture-fact">
      <a href={mediaUrl(path)} target="_blank" rel="noreferrer" className="checker">
        <img src={mediaUrl(path)} alt={label} loading="lazy" />
      </a>
      <figcaption dir="ltr">
        {label}: {asset.file}
        <span className="muted">
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'no size'}
          {file && ` · ${size(file.size)}`}
        </span>
      </figcaption>
    </figure>
  );
}

function DesignDetail({
  designs,
  assets,
  id,
  lang: initial,
  variant,
  onOpenVariant,
  onClose,
  onStep,
}: {
  designs: Designs;
  assets: Assets;
  id: string;
  lang: Lang;
  variant?: Variant;
  onOpenVariant: (variant: Variant) => void;
  onClose: () => void;
  onStep?: (by: -1 | 1) => void;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  const managed = designs.MANAGED_DESIGN_IDS.has(id);
  const group = designs.DESIGN_GROUPS.find((g) => designs.designsOf(g).includes(id));
  const { slide } = previewOf(designs, id, lang);
  const subject = designs.DESIGN_SUBJECTS[id];
  const backdrop = assets.previewBackdrop(id);
  const languages = designs.designLanguages(id);

  return (
    <ItemOverlay
      title={
        <>
          {nameOf(designs, id, 'he')} <span className="muted">·</span>{' '}
          <span className="muted" dir="ltr">
            {nameOf(designs, id, 'en')}
          </span>
        </>
      }
      subtitle={
        <>
          <span dir="ltr">{id}</span> · {group ? groupNameOf(designs, group, 'he') : 'ללא קבוצה'} ·{' '}
          {managed ? 'פורסם מהסטודיו (managed.json)' : 'נכתב ביד (index.json)'}
        </>
      }
      actions={
        <div className="segmented" role="group" aria-label="שפה">
          <button type="button" aria-pressed={lang === 'he'} onClick={() => setLang('he')}>
            עברית
          </button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            English
          </button>
        </div>
      }
      onClose={onClose}
      onStep={onStep}
      side={
        <>
          {variant && (
            <section className="approve-box">
              <p className="small">העיצוב נוצר בסטודיו, ובקשת המקור עדיין פתוחה.</p>
              <button type="button" onClick={() => onOpenVariant(variant)}>
                פתח את ההצעה בסטודיו
              </button>
            </section>
          )}
          <section>
            <h3>פרטים</h3>
            <dl className="facts">
              <dt>מזהה</dt>
              <dd dir="ltr">{id}</dd>
              <dt>קבוצה</dt>
              <dd>
                {group ? `${groupNameOf(designs, group, 'he')} · ` : ''}
                <span dir="ltr">{group ?? '—'}</span>
              </dd>
              <dt>מקור</dt>
              <dd dir="ltr">elements/designs/{managed ? 'managed.json' : 'index.json'}</dd>
              <dt>שפות</dt>
              <dd dir="ltr">{languages.join(', ')}</dd>
              <dt>אלמנטים</dt>
              <dd>{slide.elements.length}</dd>
              <dt>נקודת הנושא</dt>
              <dd dir="ltr">{subject ? `${subject[0]}, ${subject[1]}` : '—'}</dd>
            </dl>
          </section>
          <section>
            <h3>תמונות</h3>
            <Picture asset={assets.previewAsset(id)} label="subject" />
            {backdrop && <Picture asset={backdrop} label="backdrop" />}
          </section>
        </>
      }
    >
      <DesignView designs={designs} id={id} lang={lang} />
      <h3>כך העיצוב נראה בגלריה ({THUMB} פיקסלים)</h3>
      <div className="thumbs">
        {(['he', 'en'] as const).map((side) => (
          <figure key={side}>
            <DesignView designs={designs} id={id} lang={side} width={THUMB} />
            <figcaption>{side === 'he' ? 'עברית' : 'English'}</figcaption>
          </figure>
        ))}
      </div>
    </ItemOverlay>
  );
}

/**
 * The ready-made slides of Elements, as the app lists them: the authored catalog, and after it
 * the designs the studio published, group by group. Each is drawn live by the app's renderer.
 */
export function Designs({
  route,
  go,
  query,
  lang,
  variants,
  onOpenVariant,
}: {
  route: LibraryRoute;
  go: (route: LibraryRoute) => void;
  query: string;
  lang: Lang;
  variants: Record<string, Variant>;
  onOpenVariant: (variant: Variant) => void;
}) {
  const read = useRead(load, []);
  const [source, setSource] = useState<Source>('all');
  const [designs, assets] = read.value ?? [];

  /** The studio's variant each published design came from, by design id. */
  const studioOf = useMemo(() => {
    const found = new Map<string, Variant>();
    for (const variant of Object.values(variants)) {
      if (variant.published) found.set(variant.designId, variant);
    }
    return found;
  }, [variants]);

  const groups = useMemo(() => {
    if (!designs) return [];
    return designs.DESIGN_GROUPS.filter((group) => !route.group || group === route.group).map(
      (group) => ({
        group,
        ids: designs.designsOf(group).filter((id) => {
          const managed = designs.MANAGED_DESIGN_IDS.has(id);
          if (source === 'managed' && !managed) return false;
          if (source === 'authored' && managed) return false;
          return matches(
            query,
            id,
            nameOf(designs, id, 'he'),
            nameOf(designs, id, 'en'),
            groupNameOf(designs, group, 'he'),
          );
        }),
      }),
    );
  }, [designs, route.group, source, query]);
  const listed = useMemo(() => groups.flatMap(({ ids }) => ids), [groups]);

  if (read.error) return <p className="error-text">{read.error}</p>;
  if (!designs || !assets) return <p className="muted">טוען את העיצובים…</p>;

  const managedCount = designs.MANAGED_DESIGN_IDS.size;
  const open = (id: string) => go({ ...route, item: id });

  return (
    <>
      <div className="lib-filters">
        <div className="segmented" role="group" aria-label="מקור">
          {(
            [
              ['all', `הכול · ${designs.DESIGN_IDS.length}`],
              ['authored', `נכתבו ביד · ${designs.DESIGN_IDS.length - managedCount}`],
              ['managed', `מהסטודיו · ${managedCount}`],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={source === value}
              onClick={() => setSource(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="קבוצה">
          <button
            type="button"
            className="chip"
            aria-pressed={!route.group}
            onClick={() => go({ section: 'designs' })}
          >
            כל הקבוצות
          </button>
          {designs.DESIGN_GROUPS.map((group) => (
            <button
              type="button"
              key={group}
              className="chip"
              aria-pressed={route.group === group}
              onClick={() => go({ section: 'designs', group })}
            >
              {groupNameOf(designs, group, 'he')}{' '}
              <span className="muted">{designs.designsOf(group).length}</span>
            </button>
          ))}
        </div>
      </div>

      {listed.length === 0 && <p className="muted">אין עיצובים שמתאימים לבחירה.</p>}
      {groups
        .filter(({ ids }) => ids.length > 0)
        .map(({ group, ids }) => (
          <section key={group} className="lib-group">
            <h3>
              {groupNameOf(designs, group, 'he')}{' '}
              <span className="muted small" dir="ltr">
                {group} · {ids.length}
              </span>
            </h3>
            <div className="lib-grid">
              {ids.map((id) => {
                const managed = designs.MANAGED_DESIGN_IDS.has(id);
                return (
                  <button
                    type="button"
                    key={id}
                    className="lib-card"
                    onClick={() => open(id)}
                    aria-label={`פתח את ${nameOf(designs, id, 'he')}`}
                  >
                    <DesignView designs={designs} id={id} lang={lang} lazy />
                    <span className="lib-card-body">
                      <span className="lib-card-title">{nameOf(designs, id, lang)}</span>
                      <span className="lib-card-meta">
                        <span dir="ltr" className="muted">
                          {id}
                        </span>
                        {managed && <span className="badge approved">סטודיו</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      {route.item && designs.DESIGN_IDS.includes(route.item) && (
        <DesignDetail
          key={route.item}
          designs={designs}
          assets={assets}
          id={route.item}
          lang={lang}
          variant={studioOf.get(route.item)}
          onOpenVariant={onOpenVariant}
          onClose={() => go({ ...route, item: undefined })}
          onStep={stepper(listed, route.item, open)}
        />
      )}
    </>
  );
}
