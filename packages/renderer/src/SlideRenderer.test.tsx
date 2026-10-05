// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  createDeckStore,
  createElement,
  createSlide,
  richText,
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
import { setFrameScriptNonce } from './markup';
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

  it('writes the number of the slide in a slide-number text, of the layout or of the slide', () => {
    const number = (id: string, text: string) =>
      createElement.text({
        id,
        role: 'slideNumber',
        frame: { x: 96, y: 960, w: 120, h: 40 },
        content: richText(text, { styleRef: 'caption', marks: { weight: 700 } }),
      });
    const deck = createDeck({
      lang: 'he',
      slides: ['s_a', 's_b', 's_c'].map((id) =>
        createSlide({
          id,
          layoutId: 'l_plain',
          elements: id === 's_c' ? [number('e_own', '#')] : [],
        }),
      ),
    });
    deck.layouts = [
      {
        id: 'l_plain',
        name: 'Plain',
        archetype: 'cards',
        placeholders: [],
        decorations: [number('d_number', '1')],
      },
    ];
    const shown = (selector: string) => container.querySelector(selector)?.textContent;
    render(<SlideRenderer deck={deck} slide={deck.slides[1]!} />);
    expect(shown('[data-decoration-id="d_number"]')).toBe('2');
    // The number keeps the marks it was drawn with.
    expect(
      container.querySelector<HTMLElement>('[data-decoration-id="d_number"] span')?.style
        .fontWeight,
    ).toBe('700');
    render(<SlideRenderer deck={deck} slide={deck.slides[2]!} />);
    expect(shown('[data-decoration-id="d_number"]')).toBe('3');
    expect(shown('[data-element-id="e_own"]')).toBe('3');
    // A slide the deck does not hold (a preview, a cover) shows what the element holds.
    render(<SlideRenderer deck={deck} slide={{ ...deck.slides[2]!, id: 's_preview' }} />);
    expect(shown('[data-element-id="e_own"]')).toBe('#');
  });

  it("draws the layout's footer on every slide, except where the slide has a footer of its own", () => {
    const footer = (id: string, text: string) =>
      createElement.text({
        id,
        role: 'footer',
        frame: { x: 96, y: 960, w: 900, h: 40 },
        content: richText(text, { styleRef: 'caption' }),
      });
    const deck = createDeck({
      lang: 'en',
      slides: [
        createSlide({ id: 's_plain', layoutId: 'l_plain', elements: [] }),
        // What a slide made from a layout holds until someone writes in it: an empty footer.
        createSlide({ id: 's_empty', layoutId: 'l_plain', elements: [footer('e_empty', '')] }),
        createSlide({ id: 's_own', layoutId: 'l_plain', elements: [footer('e_own', 'Appendix')] }),
      ],
    });
    deck.layouts = [
      {
        id: 'l_plain',
        name: 'Plain',
        archetype: 'cards',
        placeholders: [],
        decorations: [footer('d_footer', 'ACME · 2026')],
      },
    ];
    const drawn = () => container.querySelector('[data-decoration-id="d_footer"]')?.textContent;
    render(<SlideRenderer deck={deck} slide={deck.slides[0]!} />);
    expect(drawn()).toBe('ACME · 2026');
    render(<SlideRenderer deck={deck} slide={deck.slides[1]!} />);
    expect(drawn()).toBe('ACME · 2026');
    render(<SlideRenderer deck={deck} slide={deck.slides[2]!} />);
    expect(drawn()).toBeUndefined();
    expect(container.querySelector('[data-element-id="e_own"]')?.textContent).toBe('Appendix');
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

  it('gives the scripts of a frame the nonce of the page, and none to an export', () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    const scripts = () => {
      const srcdoc =
        container
          .querySelector('[data-element-id="e_html_script"] iframe')
          ?.getAttribute('srcdoc') ?? '';
      const frame = new DOMParser().parseFromString(srcdoc, 'text/html');
      return Array.from(frame.querySelectorAll('script'), (s) => s.getAttribute('nonce'));
    };
    // A page without a content policy has no nonce, and its frames carry none.
    render(<SlideRenderer deck={deck} slide={slide} />);
    expect(scripts().length).toBeGreaterThan(0);
    expect(scripts().every((nonce) => nonce === null)).toBe(true);
    try {
      setFrameScriptNonce('n-1234');
      render(<SlideRenderer deck={deck} slide={slide} mode="present" />);
      expect(scripts().every((nonce) => nonce === 'n-1234')).toBe(true);
      // What an export draws goes into a file: the nonce of this load stays out of it.
      render(<SlideRenderer deck={deck} slide={slide} mode="present" scriptNonce="" />);
      expect(scripts().every((nonce) => nonce === null)).toBe(true);
    } finally {
      setFrameScriptNonce(undefined);
    }
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

  it('draws a link of text to an address as an anchor, and a link to a slide for the runtime', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    const linked: Element = {
      ...(slide.elements.find((e) => e.id === 'e_text') as Element),
      id: 'e_links',
      content: {
        paragraphs: [
          {
            dir: 'auto',
            align: 'start',
            runs: [
              { text: 'page', marks: { link: 'https://example.com/a', underline: true } },
              { text: ' and ' },
              { text: 'slide', marks: { link: '#slide=s_other', weight: 700 } },
            ],
          },
        ],
      },
    } as Element;
    render(<SlideRenderer deck={deck} slide={{ ...slide, elements: [linked] }} />);
    const [page, other] = Array.from(container.querySelectorAll('[data-element-id="e_links"] a'));
    expect(page?.getAttribute('href')).toBe('https://example.com/a');
    expect(page?.getAttribute('target')).toBe('_blank');
    expect(page?.hasAttribute('data-link-kind')).toBe(false);
    // No address to open: the runtime follows these two attributes on a click.
    expect(other?.hasAttribute('href')).toBe(false);
    expect(other?.getAttribute('data-link-kind')).toBe('slide');
    expect(other?.getAttribute('data-link-target')).toBe('s_other');
    expect(other?.textContent).toBe('slide');
    expect((other as HTMLElement).style.fontWeight).toBe('700');
  });

  it('in a show, makes the links of a slide stops of the keyboard, and opens only safe addresses', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    const text = slide.elements.find((e) => e.id === 'e_text') as Element;
    const linked: Element = {
      ...text,
      id: 'e_links',
      content: {
        paragraphs: [
          {
            dir: 'auto',
            align: 'start',
            runs: [
              { text: 'slide', marks: { link: '#slide=s_other' } },
              { text: ' and ' },
              { text: 'script', marks: { link: 'javascript:alert(1)' } },
              { text: ' and ' },
              { text: 'file', marks: { link: 'file:///C:/secret.txt' } },
            ],
          },
        ],
      },
    } as Element;
    const card = { ...text, id: 'e_card', link: { kind: 'slide', target: 's_other' } } as Element;
    const draw = (mode: 'edit' | 'present') =>
      render(
        <SlideRenderer deck={deck} slide={{ ...slide, elements: [linked, card] }} mode={mode} />,
      );

    draw('present');
    const toSlide = container.querySelector('[data-element-id="e_links"] [data-link-kind="slide"]');
    expect(toSlide?.getAttribute('tabindex')).toBe('0');
    expect(toSlide?.getAttribute('role')).toBe('link');
    const box = container.querySelector('[data-element-id="e_card"]');
    expect(box?.getAttribute('tabindex')).toBe('0');
    expect(box?.getAttribute('role')).toBe('link');
    // An address a slide may not open is drawn as its text, with no address to follow.
    const anchors = Array.from(container.querySelectorAll('[data-element-id="e_links"] a'));
    expect(anchors.map((a) => a.textContent)).toEqual(['slide']);
    expect(container.querySelector('[data-element-id="e_links"]')?.textContent).toBe(
      'slide and script and file',
    );

    // On the Stage and in a thumbnail the slide takes no stops of the keyboard of its own.
    draw('edit');
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
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
