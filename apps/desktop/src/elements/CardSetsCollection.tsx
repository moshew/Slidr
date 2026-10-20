import { useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GroupElement } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import { useLanguage } from '../i18n';
import { searchTags } from '../media/icons/library';
import { searchIcons, withTags, wordsOf, type SearchWords } from '../media/icons/search';
import { tell, useDeck, useEditor, useElementSize } from '../shell';
import {
  cardPicture,
  cardSetsIn,
  newCardSet,
  readingIn,
  type CardSetId,
  type Reading,
} from './cardSets';
import { useLoaded } from './collections';
import { insertCardSet } from './insert';

/** The room around a drawn card or set, in slide pixels: its shadow falls there. */
const PAD = 44;

/**
 * A card, or a whole set, as the renderer draws it on a slide, `width` wide with the room its
 * shadow takes. In the words and the reading direction it was drawn in (`reading`).
 */
export function CardPicture({
  element,
  reading,
  width,
}: {
  element: GroupElement;
  reading: Reading;
  width: number;
}) {
  const theme = useDeck((s) => s.deck.theme);
  const { deck, slide, size } = useMemo(
    () =>
      cardPicture(
        element,
        { lang: reading.he ? 'he' : 'en', dir: reading.rtl ? 'rtl' : 'ltr' },
        theme,
        PAD,
      ),
    [element, reading, theme],
  );
  const scale = width / size.w;
  return (
    // The slide is scaled from its left corner, in a panel that may read from the right.
    <div
      aria-hidden
      dir="ltr"
      className="relative overflow-hidden"
      style={{ width, height: size.h * scale }}
    >
      <div className="absolute start-0 top-0 origin-top-left" style={{ scale }}>
        <SlideRenderer deck={deck} slide={slide} mode="thumbnail" />
      </div>
    </div>
  );
}

/** A card set as the search of Elements finds it. */
export interface FoundCardSet extends SearchWords {
  id: CardSetId;
}

const cardTags = () => searchTags('cards');

/**
 * The card sets an interface in the UI language offers, with the words they are found by: their
 * names in Hebrew and English, and the library's tags (`tags/cards.json`). Undefined while the
 * tags are read.
 */
export function useCardSetIndex(): readonly FoundCardSet[] | undefined {
  const { t } = useTranslation('elements');
  const lang = useLanguage();
  const tags = useLoaded(cardTags);
  return useMemo(() => {
    if (tags === undefined) return undefined;
    return cardSetsIn(lang).map((id) => {
      const nameHebrew = wordsOf(t(`cards.name.${id}`, { lng: 'he' }));
      const words: FoundCardSet = {
        id,
        filled: false,
        nameWords: wordsOf(t(`cards.name.${id}`, { lng: 'en' })),
        tagWords: [],
        nameTerms: [nameHebrew.join(' ')],
        nameHebrew,
        tagTerms: [],
        tagHebrew: [],
      };
      return withTags(words, tags === 'failed' ? undefined : tags[id]);
    });
  }, [tags, t, lang]);
}

/** The card sets that match every word of a query, best first. */
export function searchCardSets(index: readonly FoundCardSet[], query: string) {
  return searchIcons(index, query, { count: index.length }).map(({ id }) => id);
}

/**
 * The card sets: a click puts a set on the current slide, in one undo step. Each is shown as it
 * will be drawn, since a set is looked at as a small design, not as a shape: in the UI language,
 * whatever the deck is in. An interface in a language the sets are not written in offers none
 * (`cardSetsIn`), and Elements does not show the collection.
 */
export function CardSetsCollection() {
  const { t } = useTranslation('elements');
  const lang = useLanguage();
  const ids = cardSetsIn(lang);

  if (ids.length === 0) {
    // The cards are read from the media library: without it there are none to offer.
    return (
      <p className="py-8 text-center text-sm text-ui-fg-muted" data-testid="elements-cards">
        {t('loadFailed')}
      </p>
    );
  }

  return (
    <CardSetList ids={ids} testId="elements-cards">
      <p className="text-xs leading-relaxed text-ui-fg-muted">{t('cards.hint')}</p>
    </CardSetList>
  );
}

/** Card sets, each as it will be drawn, under whatever comes first (`children`). */
export function CardSetList({
  ids,
  testId,
  children,
}: {
  ids: readonly CardSetId[];
  testId?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const lang = useLanguage();
  const reading = useMemo(() => readingIn(lang), [lang]);
  const sets = useMemo(
    () => ids.map((id) => ({ id, element: newCardSet(id, reading) })),
    [ids, reading],
  );
  const list = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(list);
  const pictureWidth = Math.max(0, Math.floor(width - 18));

  return (
    <div ref={list} className="flex flex-col gap-3" data-testid={testId}>
      {children}
      {sets.map(({ id, element }) => (
        <button
          key={id}
          type="button"
          data-card-set={id}
          aria-label={t('cards.insert', { name: t(`cards.name.${id}`) })}
          className="group flex cursor-default flex-col gap-1 rounded-panel border border-ui-line bg-ui-field p-2 text-start transition-[background-color,border-color,box-shadow] hover:border-ui-accent hover:bg-ui-hover hover:shadow-floating focus-visible:outline-2 focus-visible:outline-ui-accent"
          onClick={() => {
            if (!insertCardSet(editor, id, reading)) void tell(t('media:noSlide'));
          }}
        >
          <span className="block min-h-16">
            {pictureWidth > 0 && (
              <CardPicture element={element} reading={reading} width={pictureWidth} />
            )}
          </span>
          <span className="px-1 pb-0.5 text-sm font-semibold text-ui-fg">
            {t(`cards.name.${id}`)}
          </span>
        </button>
      ))}
    </div>
  );
}
