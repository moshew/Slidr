// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  createElement,
  createSelectionStore,
  createSlide,
  findElementInDeck,
  richText,
  type Deck,
  type Element,
} from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import { registries } from '../../shell/registry';
import { applyStyle, changeMarks, formatOf, toggleBold } from '../actions';
import { isMixed, patchMarks } from '../format';
import '../register';
import { formatContext, resolveTarget } from './shared';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

/*
 * What the text tools act on when the selection holds groups. A card of a converted slide is a
 * group (ADR-073): its box, then the texts on it. Selected, its text is formatted as the text of
 * several selected text boxes is.
 */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const words = (id: string, y: number, text: string, marks = {}) =>
  createElement.text({ id, frame: box(40, y, 420, 60), content: richText(text, { marks }) });

/**
 * A card: the box, a heading in bold, a line under it, and a number in a circle that sits in a
 * group of its own; beside it a text box, a picture, and a card that holds no text at all.
 */
function deck(): Deck {
  const card = createElement.group({
    id: 'e_card',
    frame: box(96, 300, 500, 300),
    children: [
      createElement.shape({ id: 'e_box', frame: box(0, 0, 500, 300) }),
      words('e_heading', 40, 'Faster onboarding', { weight: 700, size: 40 }),
      words('e_line', 120, 'Two days in place of ten'),
      createElement.group({
        id: 'e_badge',
        frame: box(400, 40, 56, 56),
        children: [
          createElement.shape({ id: 'e_number', frame: box(0, 0, 56, 56), content: richText('1') }),
        ],
      }),
    ],
  });
  const bare = createElement.group({
    id: 'e_bare',
    frame: box(700, 300, 500, 300),
    children: [createElement.shape({ id: 'e_bare_box', frame: box(0, 0, 500, 300) })],
  });
  const elements: Element[] = [
    card,
    bare,
    { ...words('e_note', 700, 'A note under the cards'), frame: box(96, 700, 900, 60) },
    createElement.image({ id: 'e_photo', frame: box(1300, 300, 400, 300) }),
  ];
  return createDeck({ lang: 'en', slides: [createSlide({ id: 's_1', elements })] });
}

function setup(...selected: string[]) {
  const start = deck();
  const bus = new CommandBus(start, { validate: true });
  const selection = createSelectionStore(bus);
  selection.getState().setCurrentSlide('s_1');
  selection.getState().selectElements(selected);
  const editor = { bus, selection };
  const target = () => resolveTarget(editor);
  const ids = () => {
    const at = target();
    return at?.kind === 'elements' ? at.elements.map((element) => element.id) : at;
  };
  const marks = (id: string) => {
    const { element } = findElementInDeck(bus.deck, id)!;
    const content = element.type === 'text' || element.type === 'shape' ? element.content : null;
    return content?.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.marks ?? {}));
  };
  return { start, bus, editor, target, ids, marks };
}

describe('the target of the text tools on a selection with groups', () => {
  it('is every text inside a selected group, at any depth, and not its box', () => {
    expect(setup('e_card').ids()).toEqual(['e_heading', 'e_line', 'e_number']);
    // A group inside the card, selected alone, is its own texts.
    expect(setup('e_badge').ids()).toEqual(['e_number']);
  });

  it('is the texts of a group and of the text boxes selected with it, in their order', () => {
    expect(setup('e_note', 'e_card').ids()).toEqual(['e_note', 'e_heading', 'e_line', 'e_number']);
  });

  it('is nothing when a member of the selection has no text the tools would change', () => {
    expect(setup('e_bare').ids()).toBeNull();
    expect(setup('e_card', 'e_bare').ids()).toBeNull();
    expect(setup('e_card', 'e_photo').ids()).toBeNull();
    // As it was: several text boxes are a target, and one text box is the element itself.
    expect(setup('e_note', 'e_heading').ids()).toEqual(['e_note', 'e_heading']);
    expect(setup('e_note').target()).toMatchObject({ kind: 'element', element: { id: 'e_note' } });
  });

  it('reads a value the texts of a card do not share as mixed', () => {
    const { editor, target } = setup('e_card');
    const format = formatOf(target()!, formatContext(editor, target()));
    // The heading is bold and set at 40; the line and the number are neither.
    expect(isMixed(format.size)).toBe(true);
    expect(isMixed(format.weight)).toBe(true);
    expect(format.bold).toBe(false);
    expect(format.italic).toBe(false);
  });

  it('formats every text of the card as one step, and leaves the rest of the slide', () => {
    const { start, bus, editor, target, marks } = setup('e_card');
    const ctx = formatContext(editor, target());
    // Not all of it is bold, so bold turns on for all of it.
    toggleBold(target()!, ctx, { label: 'Format' });
    for (const id of ['e_heading', 'e_line', 'e_number']) {
      expect(marks(id), id).toEqual([expect.objectContaining({ weight: 700 })]);
    }
    expect(formatOf(target()!, ctx).bold).toBe(true);
    expect(marks('e_note')).toEqual([{}]);
    expect(bus.undoStack).toHaveLength(1);

    // Size and colour reach them the same way, and a text style its paragraphs.
    changeMarks(target()!, patchMarks({ size: 28, color: { token: 'primary' } }));
    applyStyle(target()!, 'caption');
    for (const id of ['e_heading', 'e_line', 'e_number']) {
      const { element } = findElementInDeck(bus.deck, id)!;
      expect(element, id).toMatchObject({ content: { paragraphs: [{ styleRef: 'caption' }] } });
    }
    expect(formatOf(target()!, ctx)).toMatchObject({ styleRef: 'caption' });
    expect(bus.undoStack).toHaveLength(3);
    expect(findElementInDeck(bus.deck, 'e_box')!.element).toEqual(
      findElementInDeck(start, 'e_box')!.element,
    );
    bus.undo();
    bus.undo();
    bus.undo();
    expect(bus.deck).toEqual(start);
  });

  it('has the text tools of several elements in the row of a group', () => {
    const tools = registries.contextTools.getState().items;
    const ofKind = (kind: 'group' | 'multiple') =>
      tools
        .filter((tool) => tool.id.startsWith('text.several') && tool.kinds.includes(kind))
        .map((tool) => tool.id);
    expect(ofKind('multiple')).toHaveLength(11);
    expect(ofKind('group')).toEqual(ofKind('multiple'));
  });
});
