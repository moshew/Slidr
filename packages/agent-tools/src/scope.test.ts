import { createElement, findSlide, type Command } from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { availableIn, checkWrite, type SessionScope } from './scope';
import { failed, ok, setup } from './testing';

const slideScope: SessionScope = { kind: 'slide', slideId: 's_he_goals' };

describe('scope guard: slide session', () => {
  it('reads anywhere and writes to its own slide', async () => {
    const { call } = setup(hebrewDeck(), {}, slideScope);
    await ok(call('slide_get', { slideId: 's_he_hero' }));
    await ok(call('deck_get_outline'));
    await ok(call('text_set', { elementId: 'e_he_goals_title', markdown: 'מטרות' }));
    await ok(call('slide_update', { slideId: 's_he_goals', name: 'מטרות' }));
  });

  it('refuses a write to another slide and leaves the deck as it was', async () => {
    const { call, bus } = setup(hebrewDeck(), {}, slideScope);
    const before = bus.deck;
    const error = await failed(call('text_set', { elementId: 'e_he_hero_title', markdown: 'x' }));
    expect(error.code).toBe('out_of_scope');
    expect(error.message).toBe(
      'This would change slide "s_he_hero", which is outside a slide session, limited to slide "s_he_goals".',
    );
    expect(bus.deck).toBe(before);
    expect(bus.canUndo).toBe(false);
  });

  it('refuses deck tools before running them', async () => {
    const { call } = setup(hebrewDeck(), {}, slideScope);
    const error = await failed(call('slide_delete', { slideIds: ['s_he_goals'] }));
    expect(error).toEqual({
      code: 'out_of_scope',
      message:
        'slide_delete is not available in a slide session, limited to slide "s_he_goals"; it works in deck sessions.',
    });
  });

  it('checks every command of a batch', async () => {
    const { call, bus } = setup(hebrewDeck(), {}, slideScope);
    const before = bus.deck;
    const error = await failed(
      call('deck_apply_ops', {
        ops: [
          { type: 'slide.update', slideId: 's_he_goals', patch: { hidden: true } },
          { type: 'theme.update', patch: { radius: 0 } },
        ],
      }),
    );
    expect(error.message).toMatch(/theme.update changes the whole deck/);
    expect(bus.deck).toBe(before);
    await ok(
      call('deck_apply_ops', {
        ops: [{ type: 'slide.update', slideId: 's_he_goals', patch: { hidden: true } }],
      }),
    );
  });
});

describe('scope guard: object session', () => {
  const objectScope: SessionScope = {
    kind: 'object',
    slideId: 's_all',
    elementIds: ['e_text', 'e_group'],
  };

  it('changes its elements and what is inside them', async () => {
    const { call } = setup(allElementsDeck(), {}, objectScope);
    await ok(call('element_update', { elementId: 'e_text', patch: { opacity: 0.5 } }));
    await ok(call('text_set', { elementId: 'e_group_text', markdown: 'Inside' }));
  });

  it('refuses other elements of the same slide, and element-level tools it does not have', async () => {
    const { call } = setup(allElementsDeck(), {}, objectScope);
    const other = await failed(
      call('element_update', { elementId: 'e_image', patch: { opacity: 0.5 } }),
    );
    expect(other.code).toBe('out_of_scope');
    expect(other.message).toMatch(/element "e_image", which is outside an object session/);
    expect((await failed(call('element_delete', { elementIds: ['e_text'] }))).code).toBe(
      'out_of_scope',
    );
    expect((await failed(call('slide_update', { slideId: 's_all', name: 'x' }))).code).toBe(
      'out_of_scope',
    );
  });

  it('sets the animation of its own elements only', async () => {
    const { call, bus } = setup(allElementsDeck(), {}, objectScope);
    // Without elementIds, an object session replaces the steps of its own elements.
    await ok(
      call('animation_set', { slideId: 's_all', steps: [{ elementId: 'e_text', preset: 'zoom' }] }),
    );
    expect(findSlide(bus.deck, 's_all')!.timeline.map((s) => [s.elementId, s.preset])).toEqual([
      ['e_text', 'zoom'],
    ]);
    const error = await failed(
      call('animation_set', {
        slideId: 's_all',
        elementIds: ['e_image'],
        steps: [{ elementId: 'e_image', preset: 'fade' }],
      }),
    );
    expect(error.message).toMatch(/animation steps of other elements/);
  });
});

describe('scope guard: rules', () => {
  const deck = allElementsDeck();
  const asset = deck.assets[Object.keys(deck.assets)[0]!]!;

  it('lets deck and import sessions do anything', () => {
    const theme: Command = { type: 'theme.update', patch: { radius: 1 } };
    expect(checkWrite({ kind: 'deck' }, [theme], deck)).toBeUndefined();
    expect(checkWrite({ kind: 'import', file: 'x.html' }, [theme], deck)).toBeUndefined();
  });

  it('allows registering an asset in any scope', () => {
    const add: Command = { type: 'asset.add', asset };
    expect(checkWrite({ kind: 'slide', slideId: 's_empty' }, [add], deck)).toBeUndefined();
    expect(
      checkWrite({ kind: 'object', slideId: 's_all', elementIds: ['e_text'] }, [add], deck),
    ).toBeUndefined();
  });

  it('keeps slide-level commands out of an object session', () => {
    const scope: SessionScope = { kind: 'object', slideId: 's_all', elementIds: ['e_text'] };
    const commands: Command[] = [
      { type: 'element.add', slideId: 's_all', element: findSlide(deck, 's_all')!.elements[1]! },
      { type: 'element.reorder', slideId: 's_all', elementIds: ['e_text'], to: 'front' },
      { type: 'slide.add', slide: { id: 's_new', elements: [], timeline: [] } },
    ];
    for (const command of commands) expect(checkWrite(scope, [command], deck)).toBeDefined();
  });

  it('lets an object session replace its element in place, under the same id', () => {
    const scope: SessionScope = { kind: 'object', slideId: 's_all', elementIds: ['e_html'] };
    const slide = findSlide(deck, 's_all')!;
    const index = slide.elements.findIndex((e) => e.id === 'e_html');
    const remove: Command = { type: 'element.remove', slideId: 's_all', elementIds: ['e_html'] };
    const frame = { x: 0, y: 0, w: 10, h: 10 };
    const sameId = createElement.shape({ id: 'e_html', frame });
    const add = (element = sameId, at = index): Command => ({
      type: 'element.add',
      slideId: 's_all',
      element,
      index: at,
    });

    expect(checkWrite(scope, [remove, add()], deck)).toBeUndefined();
    // Deleting it, adding something else, or putting it elsewhere is not a replacement.
    expect(checkWrite(scope, [remove], deck)).toMatch(/may be replaced .* not deleted/);
    expect(checkWrite(scope, [add()], deck)).toMatch(/only in place of one of its own/);
    expect(
      checkWrite(scope, [remove, add(createElement.shape({ id: 'e_other', frame }))], deck),
    ).toBeDefined();
    expect(checkWrite(scope, [remove, add(sameId, 0)], deck)).toBeDefined();
    expect(
      checkWrite(
        scope,
        [{ type: 'element.remove', slideId: 's_all', elementIds: ['e_text'] }, add()],
        deck,
      ),
    ).toMatch(/remove element "e_text", which is outside/);
  });

  it('gives an import session every deck tool', () => {
    expect(availableIn(['deck'], 'import')).toBe(true);
    expect(availableIn(['slide', 'object'], 'import')).toBe(false);
    expect(availableIn(['import'], 'deck')).toBe(false);
  });
});
