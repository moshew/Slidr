import { createDeck, type GroupElement } from '@slidr/model';
import { useMemo, useState } from 'react';
import type { DisplayLang as Lang } from '../api';
import { useWidth } from '../SlideView';
import { cardSetsModule, messages, named } from './app';
import { ElementPicture } from './Lazy';
import { mediaUrl } from './media';
import { ItemOverlay, stepper } from './Overlay';
import { matches, useRead, type LibraryRoute } from './shared';

type CardSets = Awaited<ReturnType<typeof cardSetsModule>>;
type CardSetId = CardSets['CARD_SETS'][number];

/** The room around a drawn set, in slide pixels: its shadow falls there (`CardSetsCollection`). */
const PAD = 44;
/** The theme a set is drawn in here: a new deck's, as no deck is open. */
const THEME = createDeck().theme;

const metaOf = (lang: Lang) => ({ lang, dir: lang === 'he' ? ('rtl' as const) : ('ltr' as const) });
const nameOf = (id: string, lang: Lang) =>
  named(messages.elements, lang, 'cards', 'name', id) ?? id;

function CardPicture({
  cards,
  element,
  lang,
  width: fixed,
}: {
  cards: CardSets;
  element: GroupElement;
  lang: Lang;
  width?: number;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const width = fixed ?? measured;
  const { deck, slide, size } = useMemo(
    () => cards.cardPicture(element, metaOf(lang), THEME, PAD),
    [cards, element, lang],
  );
  return (
    <div ref={ref} className="card-picture-box" style={fixed ? { width: fixed } : undefined}>
      {width > 0 && <ElementPicture deck={deck} slide={slide} size={size} width={width} />}
    </div>
  );
}

/** A set of `count` cards, the kinds in turn, as the toolbar would grow or shrink a new one. */
function setOf(cards: CardSets, id: CardSetId, count: number, lang: Lang): GroupElement {
  const reading = cards.readingOf(metaOf(lang));
  let set = cards.newCardSet(id, reading);
  for (let guard = 0; guard < 12 && cards.cardsOf(set).length > count; guard++) {
    const last = cards.cardsOf(set).at(-1)!;
    set = cards.withoutCard(set, last.id, reading) ?? set;
  }
  for (let guard = 0; guard < 12 && cards.cardsOf(set).length < count; guard++) {
    const kind = cards.cardsOf(set).length % cards.cardKinds(id);
    set = cards.withCard(set, kind, reading) ?? set;
  }
  return set;
}

function CardDetail({
  cards,
  id,
  lang: initial,
  onClose,
  onStep,
}: {
  cards: CardSets;
  id: CardSetId;
  lang: Lang;
  onClose: () => void;
  onStep?: (by: -1 | 1) => void;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  const most = cards.mostCards(id);
  const kinds = cards.cardKinds(id);
  const reading = useMemo(() => cards.readingOf(metaOf(lang)), [cards, lang]);
  const whole = useMemo(() => cards.newCardSet(id, reading), [cards, id, reading]);
  const counts = useMemo(
    () =>
      Array.from({ length: most }, (_, i) => ({
        count: i + 1,
        set: setOf(cards, id, i + 1, lang),
      })),
    [cards, id, most, lang],
  );
  const samples = useMemo(
    () => Array.from({ length: kinds }, (_, kind) => cards.sampleCard(id, kind, reading)),
    [cards, id, kinds, reading],
  );

  return (
    <ItemOverlay
      title={
        <>
          {nameOf(id, 'he')} <span className="muted">·</span>{' '}
          <span className="muted" dir="ltr">
            {nameOf(id, 'en')}
          </span>
        </>
      }
      subtitle={
        <>
          <span dir="ltr">{id}</span> · {kinds} סוגי כרטיסים · עד {most} כרטיסים בכרטסת
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
        <section>
          <h3>פרטים</h3>
          <dl className="facts">
            <dt>מזהה</dt>
            <dd dir="ltr">{id}</dd>
            <dt>כרטסת חדשה</dt>
            <dd>{cards.cardsOf(whole).length} כרטיסים</dd>
            <dt>סוגים</dt>
            <dd>{kinds}</dd>
            <dt>הכי הרבה</dt>
            <dd>{most}</dd>
            <dt>קובץ</dt>
            <dd dir="ltr">
              <a href={mediaUrl('elements/cards/catalog.json')} target="_blank" rel="noreferrer">
                elements/cards/catalog.json
              </a>
            </dd>
          </dl>
          <p className="muted small">
            הכרטסת מצוירת בערכת הנושא של מצגת חדשה. בשקף היא מקבלת את הצבעים והגופנים של המצגת.
          </p>
        </section>
      }
    >
      <h3>כרטסת חדשה, כפי שהיא נכנסת לשקף</h3>
      <CardPicture cards={cards} element={whole} lang={lang} />
      <h3>סוגי הכרטיסים</h3>
      <div className="thumbs">
        {samples.map((card, kind) => (
          <figure key={kind}>
            <CardPicture cards={cards} element={card} lang={lang} width={260} />
            <figcaption>סוג {kind + 1}</figcaption>
          </figure>
        ))}
      </div>
      <h3>בכל מספר כרטיסים</h3>
      <div className="lib-grid">
        {counts.map(({ count, set }) => (
          <figure key={count} className="count-figure">
            <CardPicture cards={cards} element={set} lang={lang} />
            <figcaption>{count} כרטיסים</figcaption>
          </figure>
        ))}
      </div>
    </ItemOverlay>
  );
}

/** The card sets of Elements, each drawn as a new set goes onto a slide. */
export function Cards({
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
  const read = useRead(cardSetsModule, []);
  const cards = read.value;
  const shown = useMemo(
    () =>
      (cards?.CARD_SETS ?? []).filter((id) =>
        matches(query, id, nameOf(id, 'he'), nameOf(id, 'en')),
      ),
    [cards, query],
  );
  const sets = useMemo(() => {
    if (!cards) return [];
    const reading = cards.readingOf(metaOf(lang));
    return shown.map((id) => ({ id, element: cards.newCardSet(id, reading) }));
  }, [cards, shown, lang]);
  if (read.error) return <p className="error-text">{read.error}</p>;
  if (!cards) return <p className="muted">טוען את הכרטסות…</p>;
  if (cards.CARD_SETS.length === 0) return <p className="muted">בספרייה אין כרטסות.</p>;
  const open = (id: string) => go({ section: 'cards', item: id });
  const opened = cards.CARD_SETS.find((id) => id === route.item);

  return (
    <>
      <div className="lib-grid wide">
        {sets.map(({ id, element }) => (
          <button type="button" key={id} className="lib-card" onClick={() => open(id)}>
            <span className="card-stage">
              <CardPicture cards={cards} element={element} lang={lang} />
            </span>
            <span className="lib-card-body">
              <span className="lib-card-title">{nameOf(id, lang)}</span>
              <span className="lib-card-meta small muted">
                <span dir="ltr">{id}</span> · {cards.cardKinds(id)} סוגים · עד {cards.mostCards(id)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {opened && (
        <CardDetail
          key={opened}
          cards={cards}
          id={opened}
          lang={lang}
          onClose={() => go({ section: 'cards' })}
          onStep={stepper(shown, opened, open)}
        />
      )}
    </>
  );
}

/** A set of the library as a new one goes onto a slide: for the overview. */
export function CardsPeek() {
  const read = useRead(cardSetsModule, []);
  const cards = read.value;
  const element = useMemo(() => {
    const id = cards?.CARD_SETS.includes('stats') ? 'stats' : cards?.CARD_SETS[0];
    return cards && id ? cards.newCardSet(id, cards.readingOf(metaOf('he'))) : undefined;
  }, [cards]);
  return (
    <span className="peek cards">
      {cards && element && <CardPicture cards={cards} element={element} lang="he" />}
    </span>
  );
}
