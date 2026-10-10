import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GroupElement } from '@slidr/model';
import { SlideRenderer } from '@slidr/renderer';
import { tell, useDeck, useEditor, useElementSize } from '../shell';
import { CARD_SETS, cardPicture, newCardSet, readingOf } from './cardSets';
import { insertCardSet } from './insert';

/** The room around a drawn card or set, in slide pixels: its shadow falls there. */
const PAD = 44;

/**
 * A card, or a whole set, as the renderer draws it on a slide, `width` wide with the room its
 * shadow takes. In the language and the reading direction of the deck, as it will go onto it.
 */
export function CardPicture({ element, width }: { element: GroupElement; width: number }) {
  const theme = useDeck((s) => s.deck.theme);
  const meta = useDeck((s) => s.deck.meta);
  const { deck, slide, size } = useMemo(
    () => cardPicture(element, meta, theme, PAD),
    [element, meta, theme],
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

/**
 * The card sets: a click puts a set on the current slide, in one undo step. Each is shown as it
 * will be drawn, since a set is looked at as a small design, not as a shape.
 */
export function CardSetsCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const meta = useDeck((s) => s.deck.meta);
  const sets = useMemo(() => {
    const reading = readingOf(meta);
    return CARD_SETS.map((id) => ({ id, element: newCardSet(id, reading) }));
  }, [meta]);
  const list = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(list);
  const pictureWidth = Math.max(0, Math.floor(width - 18));

  return (
    <div ref={list} className="flex flex-col gap-3" data-testid="elements-cards">
      <p className="text-xs leading-relaxed text-ui-fg-muted">{t('cards.hint')}</p>
      {sets.map(({ id, element }) => (
        <button
          key={id}
          type="button"
          data-card-set={id}
          aria-label={t('cards.insert', { name: t(`cards.name.${id}`) })}
          className="group flex cursor-default flex-col gap-1 rounded-panel border border-ui-line bg-ui-field p-2 text-start transition-[background-color,border-color,box-shadow] hover:border-ui-accent hover:bg-ui-hover hover:shadow-floating focus-visible:outline-2 focus-visible:outline-ui-accent"
          onClick={() => {
            if (!insertCardSet(editor, id)) void tell(t('media:noSlide'));
          }}
        >
          <span className="block min-h-16">
            {pictureWidth > 0 && <CardPicture element={element} width={pictureWidth} />}
          </span>
          <span className="px-1 pb-0.5 text-sm font-semibold text-ui-fg">
            {t(`cards.name.${id}`)}
          </span>
        </button>
      ))}
    </div>
  );
}
