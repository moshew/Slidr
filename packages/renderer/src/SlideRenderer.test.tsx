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
import { referenceAssets, referenceDeck } from './fixtures/referenceDeck';
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
    // A footer of its own is one wherever the slide keeps it: in a group, or in a shape.
    const grouped = createSlide({
      id: 's_grouped',
      layoutId: 'l_plain',
      elements: [
        createElement.group({
          id: 'e_group',
          frame: { x: 0, y: 900, w: 1920, h: 180 },
          children: [footer('e_inside', 'Inside a group')],
        }),
      ],
    });
    render(<SlideRenderer deck={deck} slide={grouped} />);
    expect(drawn()).toBeUndefined();
    const boxed = createSlide({
      id: 's_boxed',
      layoutId: 'l_plain',
      elements: [
        createElement.shape({
          id: 'e_boxed',
          role: 'footer',
          frame: { x: 96, y: 960, w: 900, h: 40 },
          content: richText('In a shape'),
        }),
      ],
    });
    render(<SlideRenderer deck={deck} slide={boxed} />);
    expect(drawn()).toBeUndefined();
    // And a group that is hidden hides the footer in it: the deck's is drawn again.
    render(
      <SlideRenderer
        deck={deck}
        slide={{ ...grouped, elements: [{ ...grouped.elements[0]!, hidden: true }] }}
      />,
    );
    expect(drawn()).toBe('ACME · 2026');
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

  it('resolves the assets the CSS of an html element names, in its stylesheet and inline', () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    const card = slide.elements.find((e) => e.id === 'e_html_card')!;
    const photo = referenceAssets.landscape;
    // A picture under a gradient, a mask: what `data-asset` (one background picture) cannot say.
    const styled = {
      ...slide,
      elements: [
        {
          ...card,
          markup: `<div class="hero" style="mask-image: url('slidr-asset:${photo}')"><i style="background: url(slidr-asset:no-such-asset)"></i></div>`,
          styles: `.hero { background: linear-gradient(#0000, #0008), url("slidr-asset:${photo}") center / cover; }`,
        },
      ],
    };
    render(<SlideRenderer deck={deck} slide={styled} resolveAsset={(a) => `asset://${a.file}`} />);
    const shadow = container.querySelector('[data-slidr-html="shadow"]')?.shadowRoot;
    expect(shadow?.querySelector('style')?.textContent).toBe(
      '.hero { background: linear-gradient(#0000, #0008), url("asset://landscape.jpg") center / cover; }',
    );
    expect(shadow?.querySelector('.hero')?.getAttribute('style')).toContain(
      'url("asset://landscape.jpg")',
    );
    // An id the deck does not have is left as it was written: it draws nothing.
    expect(shadow?.querySelector('i')?.getAttribute('style')).toContain(
      'slidr-asset:no-such-asset',
    );
    // The model keeps the reference, not the address.
    expect(JSON.stringify(styled)).not.toContain('asset://');
  });

  it("resolves the assets a slide's own stylesheet names: a face of a font the deck keeps", () => {
    const deck = referenceDeck();
    const slide = deck.slides.find((s) => s.id === 's_ref_html')!;
    // A font file is one asset with one record; a second face of the same file is a rule of
    // the slide that points at the asset.
    const css = `@font-face { font-family: "Brand Sans"; font-weight: 700; src: url("slidr-asset:${referenceAssets.landscape}"); }\n.note { color: red; }`;
    render(
      <SlideRenderer
        deck={deck}
        slide={{ ...slide, css }}
        resolveAsset={(a) => `asset://${a.file}`}
      />,
    );
    const sheet = Array.from(container.querySelectorAll('style'), (s) => s.textContent ?? '').find(
      (text) => text.includes('Brand Sans'),
    );
    // The face is for the whole document; the slide's own rules stay inside the slide.
    expect(sheet).toContain('src: url("asset://landscape.jpg"); }');
    expect(sheet).toMatch(/@scope \(\[data-slide-id="s_ref_html"\]\) \{\s*\.note/);
    expect(sheet).not.toContain('slidr-asset:');
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

  it('draws as a link only what its host follows, and a host cannot make it follow more', () => {
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
              { text: 'page', marks: { link: 'https://example.com/a' } },
              { text: ' and ' },
              { text: 'mail', marks: { link: 'mailto:dana@example.com' } },
              { text: ' and ' },
              { text: 'phone', marks: { link: 'tel:+97231234567' } },
              { text: ' and ' },
              { text: 'script', marks: { link: 'javascript:alert(1)' } },
            ],
          },
        ],
      },
    } as Element;
    const box = (id: string, target: string) =>
      ({ ...text, id, link: { kind: 'url', target } }) as Element;
    const elements = [
      linked,
      box('e_web', 'https://example.com/b'),
      box('e_mail', 'mailto:dana@example.com'),
      box('e_script', 'javascript:alert(1)'),
      { ...text, id: 'e_slide', link: { kind: 'slide', target: 's_other' } } as Element,
    ];
    const draw = (opensLink?: (address: string) => boolean) => {
      render(
        <SlideRenderer
          deck={deck}
          slide={{ ...slide, elements }}
          mode="present"
          {...(opensLink ? { opensLink } : {})}
        />,
      );
      return {
        anchors: Array.from(container.querySelectorAll('[data-element-id="e_links"] a'), (a) =>
          a.getAttribute('href'),
        ),
        boxes: elements
          .filter((e) => container.querySelector(`[data-element-id="${e.id}"][role="link"]`))
          .map((e) => e.id),
        marked: Array.from(container.querySelectorAll('[data-link-target]'), (el) =>
          el.getAttribute('data-link-target'),
        ),
      };
    };

    // Where nothing says otherwise: the web, a mail address and a phone number.
    expect(draw()).toEqual({
      anchors: ['https://example.com/a', 'mailto:dana@example.com', 'tel:+97231234567'],
      boxes: ['e_web', 'e_mail', 'e_slide'],
      marked: ['https://example.com/b', 'mailto:dana@example.com', 's_other'],
    });
    // A host that hands only web addresses on: a mail link would do nothing there, so it is
    // text, and its element is not a link (a click on it is a click on the slide).
    const web = (address: string) => /^https?:/.test(address);
    expect(draw(web)).toEqual({
      anchors: ['https://example.com/a'],
      boxes: ['e_web', 'e_slide'],
      marked: ['https://example.com/b', 's_other'],
    });
    expect(container.querySelector('[data-element-id="e_links"]')?.textContent).toBe(
      'page and mail and phone and script',
    );
    // A host that says yes to everything gets no more than the addresses a slide may open.
    expect(draw(() => true).anchors).toHaveLength(3);
    expect(draw(() => true).boxes).toEqual(['e_web', 'e_mail', 'e_slide']);
  });

  it('draws the accent of a shape as a stripe its corners cut, or as the border of its box', () => {
    const accent = { side: 'left', size: 10, fill: { kind: 'solid', color: { value: '#0891b2' } } };
    const box = (id: string, more: object) =>
      createElement.shape({
        id,
        frame: { x: 100, y: 100, w: 400, h: 200 },
        fill: { kind: 'solid', color: { value: '#ffffff' } },
        stroke: { color: { value: '#e2e8f0' }, width: 2 },
        effects: { radius: 18 },
        ...more,
      });
    const deck = createDeck({ lang: 'en' });
    const slide = createSlide({
      id: 's_accent',
      elements: [
        box('e_cut', { accent }),
        box('e_follow', { accent: { ...accent, corners: 'follow' } }),
        box('e_plain', {}),
        box('e_fine', { stroke: { color: { value: '#e2e8f0' }, width: 1.5 } }),
      ],
    });
    render(<SlideRenderer deck={{ ...deck, slides: [slide] }} slide={slide} />);
    const layers = (id: string) =>
      Array.from(
        container.querySelectorAll<HTMLElement>(`[data-element-id="${id}"] > div div`),
      ).map((el) => el.style);
    // Cut: a stripe 10 wide along the left, in a box that starts inside the outline and has
    // the corners the outline leaves it.
    const stripe = layers('e_cut').find((style) => style.width === '10px')!;
    expect(stripe.left).toBe('0px');
    expect(stripe.backgroundColor).toMatch(/#0891b2|rgb\(8, 145, 178\)/);
    const clip = layers('e_cut').find(
      (style) => style.overflow === 'hidden' && style.inset === '2px',
    )!;
    expect(clip.borderRadius).toBe('16px');
    // Following the corners: the fill and all four sides are one box, as a page writes it.
    const bordered = layers('e_follow').find((style) => style.borderLeftWidth === '10px')!;
    expect(bordered.borderTopWidth).toBe('2px');
    expect(bordered.borderRadius).toBe('18px');
    expect(bordered.backgroundColor).not.toBe('');
    expect(layers('e_follow').some((style) => style.boxShadow.includes('inset'))).toBe(false);
    // Without an accent, an outline in whole pixels is the border of the box that holds the
    // fill, and nothing around that box cuts its corners a second time.
    const plain = layers('e_plain').find((style) => style.borderTopWidth === '2px')!;
    expect(plain.borderLeftWidth).toBe('2px');
    expect(plain.borderRadius).toBe('18px');
    expect(plain.backgroundColor).not.toBe('');
    expect(layers('e_plain').some((style) => style.boxShadow.includes('inset'))).toBe(false);
    expect(layers('e_plain').some((style) => style.width === '10px')).toBe(false);
    const around = container.querySelector<HTMLElement>('[data-element-id="e_plain"] > div')!;
    expect(around.style.overflow).toBe('');
    // A fraction of a pixel is not a width a border keeps: that outline is an inset shadow.
    expect(layers('e_fine').some((style) => style.boxShadow.includes('inset'))).toBe(true);
    expect(layers('e_fine').some((style) => style.borderTopWidth !== '')).toBe(false);
  });

  it('cuts a picture to an outline of its own, and draws the artwork of a frame over its opening', () => {
    const outline = { kind: 'path', d: 'M0 0L100 0L50 100Z', viewBox: { w: 100, h: 100 } } as const;
    const deck = createDeck({ lang: 'en' });
    const slide = createSlide({
      id: 's_frames',
      elements: [
        createElement.image({ id: 'e_cut', frame: { x: 0, y: 0, w: 400, h: 200 }, mask: outline }),
        createElement.image({
          id: 'e_framed',
          frame: { x: 500, y: 0, w: 800, h: 960 },
          mask: outline,
          flipH: true,
          smartFrame: {
            viewBox: { w: 400, h: 480 },
            opening: { x: 26, y: 26, w: 348, h: 348 },
            decorations: [
              createElement.shape({
                id: 'e_card',
                frame: { x: 0, y: 0, w: 400, h: 480 },
                geometry: {
                  kind: 'path',
                  d: 'M0 0L400 0L400 480L0 480Z',
                  viewBox: { w: 400, h: 480 },
                },
                fill: { kind: 'solid', color: { value: '#ffffff' } },
              }),
            ],
          },
        }),
      ],
    });
    render(<SlideRenderer deck={{ ...deck, slides: [slide] }} slide={slide} />);
    const inside = (id: string, selector: string) =>
      container.querySelector<HTMLElement>(`[data-element-id="${id}"] ${selector}`)!;
    // The outline is stretched from its own box to the picture's.
    expect(inside('e_cut', '> div').style.clipPath).toBe("path('M0 0 L400 0 L200 200 Z')");
    // Artwork drawn at twice its size: the opening is twice as far in and twice as large, and
    // the photograph is cut inside it, at the size of the opening.
    const opening = inside('e_framed', '[data-image-opening]');
    expect([opening.style.left, opening.style.top]).toEqual(['52px', '52px']);
    expect([opening.style.width, opening.style.height]).toEqual(['696px', '696px']);
    const photograph = opening.firstElementChild as HTMLElement;
    expect(photograph.style.clipPath).toBe("path('M0 0 L696 0 L348 696 Z')");
    // The artwork is laid out in its own box and scaled with the picture. It is over the
    // photograph, and it is not content of the slide.
    const artwork = inside('e_framed', '[data-frame-artwork]');
    expect(artwork.style.transform).toBe('scale(2, 2)');
    expect(artwork.querySelector('[data-decoration-id="e_card"]')).not.toBeNull();
    expect(container.querySelector('[data-element-id="e_card"]')).toBeNull();
    expect(
      opening.compareDocumentPosition(artwork) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // A mirrored picture is turned over whole, once: not the photograph again inside it.
    expect(inside('e_framed', '[data-smart-image-frame]').style.transform).toBe('scale(-1, 1)');
    expect(photograph.style.transform).toBe('');
  });

  it('leaves the room a shape asks for around its text, and its usual room when it asks for none', () => {
    const label = (id: string, more: object) =>
      createElement.shape({
        id,
        frame: { x: 100, y: 100, w: 60, h: 60 },
        geometry: { kind: 'preset', preset: 'ellipse' },
        content: richText('7'),
        ...more,
      });
    const deck = createDeck({ lang: 'en' });
    const slide = createSlide({
      id: 's_label',
      elements: [
        label('e_tight', { padding: { top: 2, right: 0, bottom: 4, left: 0 } }),
        label('e_usual', {}),
      ],
    });
    render(<SlideRenderer deck={{ ...deck, slides: [slide] }} slide={slide} />);
    const room = (id: string) => {
      const text = container.querySelector<HTMLElement>(
        `[data-element-id="${id}"] [data-slidr-text]`,
      )!;
      return [
        text.style.paddingTop,
        text.style.paddingRight,
        text.style.paddingBottom,
        text.style.paddingLeft,
      ];
    };
    expect(room('e_tight')).toEqual(['2px', '0px', '4px', '0px']);
    expect(room('e_usual')).toEqual(['8px', '16px', '8px', '16px']);
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
