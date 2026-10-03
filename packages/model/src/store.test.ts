import { describe, expect, it } from 'vitest';
import { CommandBus } from './bus';
import { updateElement } from './commands';
import { createDeck } from './factories';
import { allElementsDeck, hebrewDeck } from './fixtures';
import { createDeckStore, createSelectionStore } from './store';

describe('DeckStore', () => {
  it('mirrors the bus and exposes no setter', () => {
    const bus = new CommandBus(hebrewDeck());
    const store = createDeckStore(bus);
    expect('setState' in store).toBe(false);
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false, revision: 0 });

    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.revision));
    bus.dispatch({ type: 'deck.setMeta', patch: { title: 'x' } });
    expect(store.getState().deck).toBe(bus.deck);
    expect(store.getState()).toMatchObject({ canUndo: true, revision: 1 });
    bus.undo();
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true, revision: 2 });
    expect(seen).toEqual([1, 2]);
  });
});

describe('SelectionStore (CMD-05)', () => {
  it('starts on the first slide', () => {
    const selection = createSelectionStore(new CommandBus(hebrewDeck()));
    expect(selection.getState()).toMatchObject({
      currentSlideId: 's_he_hero',
      selectedSlideIds: ['s_he_hero'],
      selectedElementIds: [],
    });
    expect(createSelectionStore(new CommandBus(createDeck())).getState().currentSlideId).toBeNull();
  });

  it('is not part of the document or of undo', () => {
    const bus = new CommandBus(hebrewDeck());
    const selection = createSelectionStore(bus);
    selection.getState().setCurrentSlide('s_he_goals');
    selection.getState().selectElements(['e_he_goals_title']);
    expect(bus.canUndo).toBe(false);
  });

  it('selects only elements of the current slide', () => {
    const selection = createSelectionStore(new CommandBus(hebrewDeck()));
    selection.getState().selectElements(['e_he_hero_title', 'e_he_goals_title', 'nope']);
    expect(selection.getState().selectedElementIds).toEqual(['e_he_hero_title']);
    selection.getState().toggleElement('e_he_hero_subtitle');
    selection.getState().toggleElement('e_he_hero_title');
    expect(selection.getState().selectedElementIds).toEqual(['e_he_hero_subtitle']);
  });

  it('clears the element selection when moving to another slide', () => {
    const selection = createSelectionStore(new CommandBus(hebrewDeck()));
    selection.getState().selectElements(['e_he_hero_title']);
    selection.getState().setCurrentSlide('s_he_goals');
    expect(selection.getState()).toMatchObject({
      currentSlideId: 's_he_goals',
      selectedSlideIds: ['s_he_goals'],
      selectedElementIds: [],
    });
  });

  it('drops a selected element that a change removed, and stops editing it', () => {
    const bus = new CommandBus(allElementsDeck());
    const selection = createSelectionStore(bus);
    selection.getState().startEditing('e_text');
    expect(selection.getState().editingElementId).toBe('e_text');
    bus.dispatch({ type: 'element.remove', slideId: 's_all', elementIds: ['e_text'] });
    expect(selection.getState()).toMatchObject({ selectedElementIds: [], editingElementId: null });
  });

  it('keeps the selection through a change that leaves it valid', () => {
    const bus = new CommandBus(allElementsDeck());
    const selection = createSelectionStore(bus);
    selection.getState().selectElements(['e_text', 'e_image']);
    const before = selection.getState();
    bus.dispatch(updateElement('s_all', 'e_text', { opacity: 0.3 }));
    expect(selection.getState()).toBe(before);
  });

  it('moves to the neighbouring slide when the current one is removed', () => {
    const bus = new CommandBus(hebrewDeck());
    const selection = createSelectionStore(bus);
    selection.getState().setCurrentSlide('s_he_goals');
    bus.dispatch({ type: 'slide.remove', slideIds: ['s_he_goals'] });
    expect(selection.getState().currentSlideId).toBe('s_he_number');
    bus.dispatch({ type: 'slide.remove', slideIds: ['s_he_number'] });
    expect(selection.getState().currentSlideId).toBe('s_he_hero');
    bus.dispatch({ type: 'slide.remove', slideIds: ['s_he_hero'] });
    expect(selection.getState()).toMatchObject({ currentSlideId: null, selectedSlideIds: [] });
    bus.undo();
    expect(selection.getState().currentSlideId).toBe('s_he_hero');
  });

  it('selects several slides, keeping one current', () => {
    const selection = createSelectionStore(new CommandBus(hebrewDeck()));
    selection.getState().selectSlides(['s_he_hero', 's_he_number']);
    expect(selection.getState()).toMatchObject({
      currentSlideId: 's_he_number',
      selectedSlideIds: ['s_he_hero', 's_he_number'],
    });
  });

  it('starts over when the deck is replaced', () => {
    const bus = new CommandBus(hebrewDeck());
    const selection = createSelectionStore(bus);
    selection.getState().setCurrentSlide('s_he_goals');
    bus.reset(allElementsDeck());
    expect(selection.getState().currentSlideId).toBe('s_all');
  });
});
