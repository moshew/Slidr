// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElement,
  type HtmlElement,
} from '@slidr/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeOf, codePatch, createCodeWriter, markupHasScripts, type CodePart } from './htmlCode';

function setup(part: CodePart = 'markup') {
  const element = createElement.html({
    id: 'h1',
    frame: { x: 100, y: 100, w: 600, h: 300 },
    markup: '<p>Before</p>',
    hasScripts: false,
  });
  const bus = new CommandBus(
    createDeck({ slides: [createSlide({ id: 's1', elements: [element] })] }),
    { validate: true },
  );
  const now = () => findElement(bus.deck.slides[0]!, 'h1') as HtmlElement | undefined;
  const writer = createCodeWriter({
    bus,
    slideId: 's1',
    elementId: 'h1',
    part,
    element: now,
    label: 'Code',
  });
  return { bus, writer, now };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('what the code editor writes', () => {
  it('says whether markup carries a script', () => {
    expect(markupHasScripts('<p>Text</p>')).toBe(false);
    expect(markupHasScripts('<p>The word <code>&lt;script&gt;</code> in text</p>')).toBe(false);
    expect(markupHasScripts('<canvas id="c"></canvas><script>draw()</script>')).toBe(true);
    expect(markupHasScripts('<SCRIPT src="x.js"></SCRIPT>')).toBe(true);
  });

  it('writes markup, and the scripts flag only when it changes', () => {
    const { now } = setup();
    expect(codePatch(now()!, 'markup', '<p>After</p>')).toEqual({ markup: '<p>After</p>' });
    expect(codePatch(now()!, 'markup', '<script>1</script>')).toEqual({
      markup: '<script>1</script>',
      hasScripts: true,
    });
  });

  it('takes an empty stylesheet for no stylesheet', () => {
    const { now } = setup();
    expect(codePatch(now()!, 'styles', 'p { color: red }')).toEqual({ styles: 'p { color: red }' });
    expect(codePatch(now()!, 'styles', '  \n')).toEqual({ styles: null });
    expect(codeOf(now()!, 'styles')).toBe('');
  });
});

describe('the code writer', () => {
  it('writes what was typed after a moment, and a burst of typing is one undo step', () => {
    const { bus, writer, now } = setup();
    writer.type('<p>A</p>');
    expect(now()!.markup).toBe('<p>Before</p>');
    vi.advanceTimersByTime(200);
    expect(now()!.markup).toBe('<p>A</p>');
    expect(writer.own('<p>A</p>')).toBe(true);

    writer.type('<p>Af</p>');
    vi.advanceTimersByTime(200);
    writer.type('<p>After</p>');
    vi.advanceTimersByTime(200);
    expect(now()!.markup).toBe('<p>After</p>');
    expect(bus.undoStack).toHaveLength(1);

    bus.undo();
    expect(now()!.markup).toBe('<p>Before</p>');
    bus.redo();
    expect(now()!.markup).toBe('<p>After</p>');
  });

  it('starts a new undo step after a pause', () => {
    const { bus, writer, now } = setup();
    writer.type('<p>One</p>');
    vi.advanceTimersByTime(200);
    vi.advanceTimersByTime(1000);
    writer.type('<p>Two</p>');
    vi.advanceTimersByTime(200);
    expect(bus.undoStack).toHaveLength(2);
    bus.undo();
    expect(now()!.markup).toBe('<p>One</p>');
  });

  it('undoes through the deck, with what was still waiting written first', () => {
    const { bus, writer, now } = setup();
    writer.type('<p>Typed</p>');
    writer.undo();
    // The text was written and then undone: redo brings it back.
    expect(now()!.markup).toBe('<p>Before</p>');
    expect(bus.redoStack).toHaveLength(1);
    writer.redo();
    expect(now()!.markup).toBe('<p>Typed</p>');
    // The editor showed the undone text in between, so what redo brought back is news to it.
    expect(writer.own('<p>Typed</p>')).toBe(false);
  });

  it('turns the element into one that runs scripts when a script is typed, and back', () => {
    const { writer, now } = setup();
    writer.type('<p>Before</p><script>document.title = "x"</script>');
    writer.flush();
    expect(now()!.hasScripts).toBe(true);
    writer.type('<p>Before</p>');
    writer.flush();
    expect(now()!.hasScripts).toBe(false);
  });

  it('writes the stylesheet, and removes it when it is emptied', () => {
    const { bus, writer, now } = setup('styles');
    writer.type('p { color: teal }');
    writer.flush();
    expect(now()!.styles).toBe('p { color: teal }');
    writer.type('');
    writer.flush();
    expect(now()!.styles).toBeUndefined();
    bus.undo();
    expect(now()!.styles).toBeUndefined();
    expect(now()!.markup).toBe('<p>Before</p>');
  });

  it('drops what was typed over a text that changed from elsewhere', () => {
    const { bus, writer, now } = setup();
    writer.type('<p>Typed</p>');
    bus.dispatch({
      type: 'element.update',
      slideId: 's1',
      elementId: 'h1',
      patch: { markup: '<p>Agent</p>' },
    });
    expect(writer.own(now()!.markup)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(now()!.markup).toBe('<p>Agent</p>');
  });

  it('writes nothing for text that is what the element holds, or for an element that is gone', () => {
    const { bus, writer } = setup();
    writer.type('<p>Before</p>');
    writer.flush();
    expect(bus.undoStack).toHaveLength(0);
    bus.dispatch({ type: 'element.remove', slideId: 's1', elementIds: ['h1'] });
    writer.type('<p>Late</p>');
    writer.flush();
    expect(bus.undoStack).toHaveLength(1);
  });
});
