import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  type Layout,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { switchLayoutCommands } from './layout';

const layout = (id: string, title: { x: number; y: number }): Layout => ({
  id,
  name: id,
  archetype: 'textImage',
  decorations: [],
  placeholders: [
    { id: `${id}_title`, role: 'title', frame: { ...title, w: 1600, h: 200 } },
    { id: `${id}_body`, role: 'body', frame: { x: 160, y: 400, w: 1600, h: 500 } },
  ],
});

function setup() {
  const bus = new CommandBus(
    createDeck({
      layouts: [layout('l_top', { x: 160, y: 120 }), layout('l_low', { x: 160, y: 700 })],
      slides: [
        createSlide({
          id: 's_1',
          layoutId: 'l_top',
          elements: [
            createElement.text({
              id: 'e_title',
              role: 'title',
              frame: { x: 160, y: 120, w: 1600, h: 200 },
              content: richText('Goals'),
            }),
            // Moved by hand: it has a frame of its own, and keeps it.
            createElement.text({
              id: 'e_body',
              role: 'body',
              frame: { x: 300, y: 450, w: 900, h: 300 },
              content: richText('Three of them'),
            }),
          ],
        }),
        createSlide({ id: 's_html' }),
      ],
    }),
    { validate: true },
  );
  return bus;
}

describe('switching the layout of a slide', () => {
  it('moves what sat on the old layout, leaves what was moved by hand, as one undo step', () => {
    const bus = setup();
    const before = bus.deck.slides[0]!;
    bus.batch(switchLayoutCommands(bus.deck, 's_1', 'l_low'), { label: 'Layout' });

    const after = bus.deck.slides[0]!;
    expect(after.layoutId).toBe('l_low');
    expect(after.elements[0]!.frame).toEqual({ x: 160, y: 700, w: 1600, h: 200 });
    expect(after.elements[1]!.frame).toEqual({ x: 300, y: 450, w: 900, h: 300 });
    expect(bus.undoStack).toHaveLength(1);

    bus.undo();
    expect(bus.deck.slides[0]).toEqual(before);
    bus.redo();
    expect(bus.deck.slides[0]).toEqual(after);
  });

  it('has nothing to do for the same layout, an unknown one, or a slide without a layout', () => {
    const { deck } = setup();
    expect(switchLayoutCommands(deck, 's_1', 'l_top')).toEqual([]);
    expect(switchLayoutCommands(deck, 's_1', 'l_none')).toEqual([]);
    expect(switchLayoutCommands(deck, 's_html', 'l_low')).toEqual([]);
    expect(switchLayoutCommands(deck, 's_gone', 'l_low')).toEqual([]);
  });
});
