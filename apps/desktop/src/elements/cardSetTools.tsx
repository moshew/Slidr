import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { locateElement, type GroupElement } from '@slidr/model';
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { SquareMinus, SquarePlus } from '@slidr/ui/icons';
import { useCurrentSlide } from '../objects/target';
import {
  focusStage,
  useDeck,
  useEditor,
  useElementSize,
  useSelection,
  type Editor,
} from '../shell';
import {
  cardKinds,
  cardSetOf,
  cardsOf,
  mostCards,
  readingOf,
  roomOn,
  sampleCard,
  withCard,
  withoutCard,
  type CardSetId,
  type Room,
} from './cardSets';
import { CardPicture } from './CardSetsCollection';

/*
 * Row B for a card set (ADR-085): one more card of any of the set's kinds, and the selected card
 * out of it. The set lays its cards out again either way, as one undo step. The tools show for
 * the set itself and for a card of it that is selected; a card also has the tools of its box.
 */

interface Selected {
  slideId: string;
  id: CardSetId;
  set: GroupElement;
  /** The selected card of the set, when a card is what is selected. */
  card?: GroupElement;
}

/** The card set the selection is, or is a card of. */
function useCardSet(): Selected | undefined {
  const slide = useCurrentSlide();
  const ids = useSelection((s) => s.selectedElementIds);
  const elementId = ids.length === 1 ? ids[0] : undefined;
  return useMemo(() => {
    const found = slide && elementId ? locateElement(slide.elements, elementId) : undefined;
    if (!slide || found?.element.type !== 'group') return undefined;
    const own = cardSetOf(found.element);
    if (own) return { slideId: slide.id, id: own, set: found.element };
    const around = cardSetOf(found.parent);
    return around && found.parent
      ? { slideId: slide.id, id: around, set: found.parent, card: found.element }
      : undefined;
  }, [slide, elementId]);
}

/**
 * The set as it is on the slide now, and the room it has there: a second click comes before the
 * row is drawn again.
 */
function current(
  editor: Editor,
  { slideId, set }: Selected,
): { set: GroupElement; room: Room | undefined } | undefined {
  const { deck } = editor.bus;
  const slide = deck.slides.find((one) => one.id === slideId);
  const now = slide && locateElement(slide.elements, set.id)?.element;
  return slide && now?.type === 'group'
    ? { set: now, room: roomOn(slide, now, deck.size) }
    : undefined;
}

/** Puts a changed set in the place of the one on the slide, and leaves the set selected. */
function replace(editor: Editor, selected: Selected, next: GroupElement, label: string): void {
  editor.bus.dispatch(
    { type: 'element.replace', slideId: selected.slideId, elementId: next.id, elements: [next] },
    { label },
  );
  editor.selection.getState().selectElements([next.id]);
}

function AddCard({ selected }: { selected: Selected }) {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const meta = useDeck((s) => s.deck.meta);
  const { id, set } = selected;
  const kinds = useMemo(() => {
    const reading = readingOf(meta);
    return Array.from({ length: cardKinds(id) }, (_, kind) => sampleCard(id, kind, reading));
  }, [id, meta]);
  const count = cardsOf(set).length;
  const full = count >= mostCards(id);

  const add = (kind: number) => {
    const now = current(editor, selected);
    const next = now && withCard(now.set, kind, readingOf(editor.bus.deck.meta), now.room);
    if (next) replace(editor, selected, next, t('cards.history.add'));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" icon={SquarePlus} data-testid="cards-add">
          {t('cards.add')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('cards.kinds')}
        // The keyboard goes to the popover, and Tab to its cards: a card that had the focus from
        // the start would be marked before anything was chosen.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusStage();
        }}
        className="focus-visible:outline-none"
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ui-fg-muted" role="status">
            {full
              ? t('cards.full', { n: count })
              : t('cards.room', { n: count, most: mostCards(id) })}
          </p>
          {/* The gallery stays open: adding one card after another is what it is for. */}
          <Kinds cards={kinds} disabled={full} onPick={add} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The kinds of card a set can take, two in a row, each drawn as wide as its place. */
function Kinds({
  cards,
  disabled,
  onPick,
}: {
  cards: readonly GroupElement[];
  disabled: boolean;
  onPick: (kind: number) => void;
}) {
  const { t } = useTranslation('elements');
  const grid = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(grid);
  // Two in a row, 4px apart, each with 4px around its picture.
  const picture = Math.max(0, Math.floor((width - 4) / 2) - 8);
  return (
    <div ref={grid} role="group" aria-label={t('cards.kinds')} className="grid grid-cols-2 gap-1">
      {cards.map((card, kind) => (
        <button
          key={kind}
          type="button"
          data-card-kind={kind}
          disabled={disabled}
          aria-label={t('cards.kind', { number: kind + 1 })}
          className="flex min-h-10 cursor-default items-center justify-center rounded-control bg-ui-field p-1 transition-colors hover:bg-ui-hover active:bg-ui-pressed disabled:opacity-40"
          onClick={() => onPick(kind)}
        >
          {picture > 0 && <CardPicture element={card} width={picture} />}
        </button>
      ))}
    </div>
  );
}

function RemoveCard({ selected }: { selected: Selected }) {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const { set, card } = selected;
  if (!card) return null;
  return (
    <IconButton
      icon={SquareMinus}
      size="sm"
      label={t('cards.remove')}
      data-testid="cards-remove"
      disabled={cardsOf(set).length < 2}
      onClick={() => {
        const now = current(editor, selected);
        const next =
          now && withoutCard(now.set, card.id, readingOf(editor.bus.deck.meta), now.room);
        if (!next) return;
        replace(editor, selected, next, t('cards.history.remove'));
        focusStage();
      }}
    />
  );
}

/** Row B of a card set, and of a card of one. Draws nothing for any other group. */
export function CardSetTools() {
  const selected = useCardSet();
  if (!selected) return null;
  return (
    <>
      <AddCard selected={selected} />
      <RemoveCard selected={selected} />
    </>
  );
}
