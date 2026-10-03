// @vitest-environment happy-dom
import {
  CommandBus,
  createDeckStore,
  updateElement,
  walkElements,
  type Deck,
  type Element,
} from '@slidr/model';
import { allElementsDeck } from '@slidr/model/fixtures';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { referenceDeck } from './fixtures/referenceDeck';
import { SlideRenderer } from './SlideRenderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}

const ids = (selector: string) =>
  Array.from(container.querySelectorAll(selector)).map((el) =>
    el.getAttribute(selector.slice(1, -1)),
  );

describe('SlideRenderer', () => {
  it('renders every visible element, nested ones included, with its id and type', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    render(<SlideRenderer deck={deck} slide={slide} />);
    const expected = Array.from(walkElements(slide.elements)).map((e) => e.id);
    expect(ids('[data-element-id]')).toEqual(expected);
    const text = container.querySelector('[data-element-id="e_text"]');
    expect(text?.getAttribute('data-element-type')).toBe('text');
    expect(text?.textContent).toBe('כל סוגי האובייקטים');
  });

  it('puts the theme, direction and scoped slide css on the root', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    render(<SlideRenderer deck={deck} slide={slide} />);
    const root = container.querySelector<HTMLElement>('.slidr-slide')!;
    expect(root.dataset.slideId).toBe('s_all');
    expect(root.dir).toBe('rtl');
    expect(root.style.getPropertyValue('--color-primary')).toBe('#2f5bea');
    expect(root.style.width).toBe('1920px');
    expect(root.querySelector('style')?.textContent).toContain('@keyframes pulse');
  });

  it('registers the fonts the deck carries as assets', () => {
    const deck = allElementsDeck();
    render(
      <SlideRenderer
        deck={deck}
        slide={deck.slides[0]!}
        resolveAsset={(a) => `asset://${a.file}`}
      />,
    );
    const css = container.querySelector('style[data-slidr-fonts]')?.textContent ?? '';
    expect(css).toContain('font-family: "Example Sans"');
    expect(css).toContain(
      'url("asset://6666666666666666666666666666666666666666666666666666666666666666.woff2")',
    );
  });

  it('draws layout decorations under the content without an element id', () => {
    const deck = allElementsDeck();
    render(<SlideRenderer deck={deck} slide={deck.slides[0]!} />);
    expect(ids('[data-decoration-id]')).toEqual(['e_layout_bar']);
    expect(container.querySelector('[data-element-id="e_layout_bar"]')).toBeNull();
  });

  it('leaves hidden elements out', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    const hidden = {
      ...slide,
      elements: slide.elements.map((e) => (e.id === 'e_line' ? { ...e, hidden: true } : e)),
    };
    render(<SlideRenderer deck={deck} slide={hidden} />);
    expect(container.querySelector('[data-element-id="e_line"]')).toBeNull();
  });

  it('resolves assets through the resolver, in model fields and in html markup', () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    render(<SlideRenderer deck={deck} slide={slide} resolveAsset={(a) => `asset://${a.file}`} />);
    const svgImg = container.querySelector('[data-element-id="e_svg_asset"] img');
    expect(svgImg?.getAttribute('src')).toBe('asset://icon.svg');
    const shadow = container.querySelector(
      '[data-element-id="e_html_card"] [data-slidr-html="shadow"]',
    )?.shadowRoot;
    expect(shadow?.querySelector('img')?.getAttribute('src')).toBe('asset://landscape.jpg');
    expect(shadow?.querySelector('style')?.textContent).toContain('.card');
  });

  it('runs html with scripts in a sandboxed frame that never gets same-origin', () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    render(<SlideRenderer deck={deck} slide={slide} />);
    const frame = container.querySelector<HTMLIFrameElement>(
      '[data-element-id="e_html_script"] iframe',
    )!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('--color-primary: #2f5bea');
    render(<SlideRenderer deck={deck} slide={slide} mode="thumbnail" />);
    expect(
      container.querySelector('[data-element-id="e_html_script"] iframe')?.getAttribute('sandbox'),
    ).toBe('');
  });

  it('keeps html without scripts free of scripts and handlers', () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    const evil: Element = {
      ...(slide.elements.find((e) => e.id === 'e_html_card') as Element),
      id: 'e_evil',
      markup: '<p onclick="steal()">hi</p><script>steal()</script>',
    } as Element;
    render(<SlideRenderer deck={deck} slide={{ ...slide, elements: [evil] }} />);
    const shadow = container.querySelector('[data-slidr-html="shadow"]')?.shadowRoot;
    expect(shadow?.querySelector('script')).toBeNull();
    expect(shadow?.querySelector('p')?.hasAttribute('onclick')).toBe(false);
  });

  it('re-renders only the elements a change touched', () => {
    const bus = new CommandBus(allElementsDeck());
    const store = createDeckStore(bus);
    const renders = new Map<string, number>();
    const slot = (element: Element, rendered: ReactNode) => {
      renders.set(element.id, (renders.get(element.id) ?? 0) + 1);
      return rendered;
    };
    const show = (deck: Deck) =>
      render(<SlideRenderer deck={deck} slide={deck.slides[0]!} slot={slot} />);
    show(store.getState().deck);
    renders.clear();
    bus.dispatch(updateElement('s_all', 'e_shape', { rotation: 30 }));
    show(store.getState().deck);
    expect([...renders.keys()]).toEqual(['e_shape']);
  });
});
