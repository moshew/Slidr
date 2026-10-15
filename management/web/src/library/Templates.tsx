import { mediaFiles, mediaUrl } from '@slidr/media-library';
import {
  createDeck,
  createElement,
  createSlide as blankSlide,
  richText,
  type AssetMeta,
  type Deck,
  type Slide,
} from '@slidr/model';
import { loadCharts } from '@slidr/renderer';
import {
  createSlide,
  deckFromTemplate,
  withStandardLayouts,
  type Template,
} from '@slidr/templates';
import { pictures } from '@slidr/templates/builtin/pictures';
import { useEffect, useMemo, useState } from 'react';
import type { DisplayLang as Lang } from '../api';
import { messages, named, samplesModule, templatesModule } from './app';
import { DeckSlide } from './Lazy';
import { ItemOverlay, stepper } from './Overlay';
import { matches, useRead, type LibraryRoute } from './shared';

const dirOf = (lang: Lang) => (lang === 'he' ? 'rtl' : 'ltr');

/** The templates as the app's library holds them: in the published order, standard layouts in. */
const load = async () => {
  const [{ builtIn }, files] = await Promise.all([templatesModule(), mediaFiles()]);
  return { templates: builtIn.map((template) => withStandardLayouts(template)), files };
};

const nameOf = (template: Template, lang: Lang) =>
  named(messages.templates, lang, 'name', template.theme.id) ?? template.theme.name;
const taglineOf = (template: Template, lang: Lang) =>
  named(messages.templates, lang, 'tagline', template.theme.id);

/**
 * The photograph on the cover of each built-in template that opens with one: the one the opening
 * slide of its sample shows (as `apps/desktop/src/templates/covers.ts` has them).
 */
const COVERS: Record<string, AssetMeta | undefined> = {
  shvil: pictures.shvilRidge,
  tzuk: pictures.tzukWarehouse,
  lavan: pictures.lavanChair1,
  nof: pictures.nofView2,
  defus: pictures.defusStreet1,
  shidur: pictures.migdalTeam2,
  mifgash: pictures.mifgashCall,
};

/**
 * A template's cover as the app's gallery draws it (`coverOf` in `covers.ts`): its opening layout
 * with its name, and the photograph of a template that opens with one.
 */
function coverOf(
  template: Template,
  lang: Lang,
  files: ReadonlySet<string>,
): { deck: Deck; slide: Slide; resolve: (asset: AssetMeta) => string | undefined } {
  const deck = deckFromTemplate(template, { lang, dir: dirOf(lang) });
  const picture = COVERS[template.theme.id];
  const path = picture ? `images/templates/${picture.name}` : undefined;
  const url = path && files.has(path) ? mediaUrl(path) : undefined;
  const resolve = (asset: AssetMeta) => (asset.id === picture?.id ? url : undefined);
  const first = deck.layouts[0];
  if (!first) {
    // A template without layouts: its name in its own display style.
    const plain = createDeck({ lang, dir: dirOf(lang), theme: template.theme });
    const slide = blankSlide({
      elements: [
        createElement.text({
          frame: { x: 160, y: 380, w: 1600, h: 320 },
          vAlign: 'middle',
          content: richText(nameOf(template, lang), { align: 'center', styleRef: 'display' }),
        }),
      ],
    });
    return { deck: plain, slide, resolve };
  }
  const has = (role: string) => first.placeholders.some((p) => p.role === role);
  const withPicture = has('image') && picture && url;
  if (withPicture) deck.assets[picture.id] = picture;
  const { slide } = createSlide(deck, {
    layoutId: first.id,
    content: {
      ...(has('title') ? { title: richText(nameOf(template, lang), { dir: 'auto' }) } : {}),
      ...(withPicture ? { image: { assetId: picture.id } } : {}),
    },
  });
  return { deck, slide, resolve };
}

function Cover({
  template,
  lang,
  files,
}: {
  template: Template;
  lang: Lang;
  files: ReadonlySet<string>;
}) {
  const cover = useMemo(() => coverOf(template, lang, files), [template, lang, files]);
  return <DeckSlide deck={cover.deck} slide={cover.slide} resolveAsset={cover.resolve} lazy />;
}

const sampleDecks = new Map<
  string,
  Promise<{ deck?: Deck; resolve: (a: AssetMeta) => string | undefined }>
>();

/** The sample deck of a template in a language, as the app's library shows it under the card. */
function sampleOf(template: Template, lang: Lang) {
  const key = `${template.theme.id}:${lang}`;
  let pending = sampleDecks.get(key);
  if (!pending) {
    pending = samplesModule().then(async ({ builtInSampleDeck, pictureUrl }) => ({
      deck: await builtInSampleDeck(template, createDeck({ lang, dir: dirOf(lang) })),
      resolve: pictureUrl,
    }));
    pending.catch(() => sampleDecks.delete(key));
    sampleDecks.set(key, pending);
  }
  return pending;
}

function Swatches({ template }: { template: Template }) {
  const colors = template.theme.colors as unknown as Record<string, string>;
  return (
    <div className="swatches">
      {Object.entries(colors).map(([token, value]) => (
        <span key={token} className="swatch" title={`${token}: ${value}`}>
          <span className="swatch-color" style={{ background: value }} />
          <span dir="ltr">{token}</span>
        </span>
      ))}
    </div>
  );
}

function TemplateDetail({
  template,
  lang: initial,
  slide: chosen,
  onSlide,
  onClose,
  onStep,
}: {
  template: Template;
  lang: Lang;
  slide: number;
  onSlide: (index: number) => void;
  onClose: () => void;
  onStep?: (by: -1 | 1) => void;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  const sample = useRead(() => sampleOf(template, lang), [template, lang]);
  const deck = sample.value?.deck;
  const index = deck ? Math.min(chosen, deck.slides.length - 1) : 0;
  const current = deck?.slides[index];
  useEffect(() => {
    void loadCharts().catch(() => undefined);
  }, []);
  const { fonts } = template.theme;

  return (
    <ItemOverlay
      title={
        <>
          {nameOf(template, 'he')} <span className="muted">·</span>{' '}
          <span className="muted" dir="ltr">
            {nameOf(template, 'en')}
          </span>
        </>
      }
      subtitle={taglineOf(template, 'he') ?? template.description}
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
          <section>
            <h3>פרטים</h3>
            <dl className="facts">
              <dt>מזהה</dt>
              <dd dir="ltr">{template.theme.id}</dd>
              <dt>כיוון</dt>
              <dd dir="ltr">{template.dir}</dd>
              <dt>layouts</dt>
              <dd>{template.layouts.length}</dd>
              <dt>שקפי דוגמה</dt>
              <dd>{deck ? deck.slides.length : '…'}</dd>
              <dt>גופן כותרות</dt>
              <dd dir="ltr">
                {fonts.heading.he} / {fonts.heading.latin}
              </dd>
              <dt>גופן גוף</dt>
              <dd dir="ltr">
                {fonts.body.he} / {fonts.body.latin}
              </dd>
              <dt>פינות</dt>
              <dd dir="ltr">{template.theme.radius}px</dd>
            </dl>
            <p className="muted small" dir="ltr">
              {template.description}
            </p>
          </section>
          <section>
            <h3>צבעים</h3>
            <Swatches template={template} />
          </section>
          <section>
            <h3>Layouts</h3>
            <ul className="plain-list" dir="ltr">
              {template.layouts.map((layout) => (
                <li key={layout.id}>
                  {layout.name} · {layout.archetype}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>קבצים</h3>
            <ul className="plain-list" dir="ltr">
              <li>
                <a
                  href={mediaUrl(`templates/${template.theme.id}/template.json`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  templates/{template.theme.id}/template.json
                </a>
              </li>
              <li>templates/catalog.json · samples.{template.theme.id}</li>
            </ul>
          </section>
        </>
      }
    >
      {sample.error && <p className="error-text">{sample.error}</p>}
      {!sample.value && !sample.error && <div className="slide-empty working big" />}
      {sample.value && !deck && <p className="muted">לתבנית אין מצגת דוגמה בשפה הזו.</p>}
      {deck && current && (
        <>
          <DeckSlide deck={deck} slide={current} resolveAsset={sample.value?.resolve} />
          <p className="muted small">
            שקף {index + 1} מתוך {deck.slides.length}
            {current.name && ` · ${current.name}`}
          </p>
          <div className="filmstrip">
            {deck.slides.map((slide, i) => (
              <button
                type="button"
                key={slide.id}
                className="film"
                aria-current={i === index ? 'true' : undefined}
                onClick={() => onSlide(i)}
                title={slide.name}
              >
                <DeckSlide deck={deck} slide={slide} resolveAsset={sample.value?.resolve} lazy />
                <span className="film-number">{i + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </ItemOverlay>
  );
}

/** The built-in templates: a cover of each, and its whole sample deck up close. */
export function Templates({
  route,
  go,
  query,
  lang,
}: {
  route: LibraryRoute;
  go: (route: LibraryRoute) => void;
  query: string;
  lang: Lang;
}) {
  const read = useRead(load, []);
  const shown = useMemo(
    () =>
      (read.value?.templates ?? []).filter((template) =>
        matches(
          query,
          template.theme.id,
          nameOf(template, 'he'),
          nameOf(template, 'en'),
          taglineOf(template, 'he'),
          template.description,
        ),
      ),
    [read.value, query],
  );
  if (read.error) return <p className="error-text">{read.error}</p>;
  if (!read.value) return <p className="muted">טוען את התבניות…</p>;
  const { templates, files } = read.value;
  const ids = shown.map((template) => template.theme.id);
  const open = (id: string) => go({ section: 'templates', item: id });
  const opened = templates.find((template) => template.theme.id === route.item);

  return (
    <>
      {shown.length === 0 && <p className="muted">אין תבניות שמתאימות לחיפוש.</p>}
      <div className="lib-grid wide">
        {shown.map((template) => (
          <button
            type="button"
            key={template.theme.id}
            className="lib-card"
            onClick={() => open(template.theme.id)}
          >
            <Cover template={template} lang={lang} files={files} />
            <span className="lib-card-body">
              <span className="lib-card-title">
                {nameOf(template, lang)}{' '}
                <span className="muted" dir="ltr">
                  {template.theme.id}
                </span>
              </span>
              <span className="muted small clamp">
                {taglineOf(template, lang) ?? template.description}
              </span>
              <span className="lib-card-meta small muted">{template.layouts.length} layouts</span>
            </span>
          </button>
        ))}
      </div>
      {opened && (
        <TemplateDetail
          key={opened.theme.id}
          template={opened}
          lang={lang}
          slide={route.slide ?? 0}
          onSlide={(index) => go({ ...route, slide: index })}
          onClose={() => go({ section: 'templates' })}
          onStep={stepper(ids, opened.theme.id, open)}
        />
      )}
    </>
  );
}
