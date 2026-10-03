import { createDeck, createElement, createSlide, type Deck, type HtmlElement } from '@slidr/model';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import type { HtmlEditing } from './context';
import { SlideRenderer } from './SlideRenderer';

// The contract of `htmlSlot` (HTM-03): the host gets the content of an `html` element with the
// markup it was made from, the renderer leaves the content alone while it shows what the host
// wrote, and builds it again for any other markup.

const MARKUP = '<p onclick="alert(1)">One <b>two</b></p><script>window.ran = true</script>';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
});

function deckWith(markup: string): { deck: Deck; element: HtmlElement } {
  const element = createElement.html({
    id: 'e_html',
    frame: { x: 0, y: 0, w: 600, h: 300 },
    markup,
  });
  return {
    deck: createDeck({ lang: 'en', slides: [createSlide({ elements: [element] })] }),
    element,
  };
}

function render(markup: string, editing: HtmlEditing | undefined) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  const { deck } = deckWith(markup);
  flushSync(() =>
    root!.render(
      <SlideRenderer
        deck={deck}
        slide={deck.slides[0]!}
        htmlSlot={editing ? () => editing : undefined}
      />,
    ),
  );
  return container.querySelector('[data-slidr-html="shadow"]')!.shadowRoot!;
}

/** A host that records what it is given, and says it wrote `written`. */
function host() {
  const calls: { root: ShadowRoot; source: DocumentFragment; rebuild: () => void }[] = [];
  const state = { written: undefined as string | undefined, detached: 0 };
  let sourceOf: (node: Node) => Node | undefined = () => undefined;
  const editing: HtmlEditing = {
    shows: (markup) => markup === state.written,
    attach(shadow, source, map, rebuild) {
      calls.push({ root: shadow, source, rebuild });
      sourceOf = map;
      return () => {
        state.detached++;
      };
    },
  };
  return { editing, calls, state, sourceOf: (node: Node) => sourceOf(node) };
}

test('the host gets the content, and the markup it was made from with every node paired', () => {
  const h = host();
  const shadow = render(MARKUP, h.editing);
  expect(h.calls).toHaveLength(1);
  const { source } = h.calls[0]!;
  // The content was cleaned; the source is the markup as it was written.
  expect(shadow.querySelector('script')).toBeNull();
  expect(shadow.querySelector('p')!.hasAttribute('onclick')).toBe(false);
  expect(source.querySelector('script')!.textContent).toBe('window.ran = true');
  expect(source.querySelector('p')!.getAttribute('onclick')).toBe('alert(1)');
  // Node for node: the <b> of the content came from the <b> of the source, and so its text.
  const bold = shadow.querySelector('b')!;
  expect(h.sourceOf(bold)).toBe(source.querySelector('b'));
  expect(h.sourceOf(bold.firstChild!)).toBe(source.querySelector('b')!.firstChild);
  // While it is edited the pointer reaches the content.
  const box = container!.querySelector<HTMLElement>('[data-slidr-html="shadow"]')!;
  expect(getComputedStyle(box).pointerEvents).toBe('auto');
});

test('the content is left alone while it shows what the host wrote, and rebuilt otherwise', () => {
  const h = host();
  const shadow = render('<p>One</p>', h.editing);
  const paragraph = shadow.querySelector('p')!;
  // The host types into the content and writes the markup of it to the model.
  paragraph.firstChild!.textContent = 'One more';
  h.state.written = '<p>One more</p>';
  render('<p>One more</p>', h.editing);
  expect(shadow.querySelector('p')).toBe(paragraph);
  expect(h.calls).toHaveLength(1);
  expect(h.state.detached).toBe(0);

  // Markup the host did not write (an undo): built afresh and handed over again.
  render('<p>One</p>', h.editing);
  expect(shadow.querySelector('p')).not.toBe(paragraph);
  expect(shadow.querySelector('p')!.textContent).toBe('One');
  expect(h.calls).toHaveLength(2);
  expect(h.state.detached).toBe(1);
});

test('rebuild builds the content again from the markup the model has now', () => {
  const h = host();
  const shadow = render('<p>One</p>', h.editing);
  h.state.written = '<p>Two</p>';
  shadow.querySelector('p')!.textContent = 'Two';
  render('<p>Two</p>', h.editing);
  // The host spoils the content and asks for it back.
  shadow.querySelector('p')!.remove();
  h.calls[0]!.rebuild();
  expect(shadow.querySelector('p')!.textContent).toBe('Two');
  expect(h.calls).toHaveLength(2);
});

test('when the editing ends the content is the model again, and out of reach of the pointer', () => {
  const h = host();
  const shadow = render('<p>One</p>', h.editing);
  shadow.querySelector('p')!.textContent = 'Left behind';
  render('<p>One</p>', undefined);
  expect(shadow.querySelector('p')!.textContent).toBe('One');
  expect(h.state.detached).toBe(1);
  const box = container!.querySelector<HTMLElement>('[data-slidr-html="shadow"]')!;
  expect(getComputedStyle(box).pointerEvents).toBe('none');
});
