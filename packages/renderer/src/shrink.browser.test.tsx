import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type Deck,
  type Slide,
  type TextElement,
} from '@slidr/model';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { measureSlide } from './measure';
import { settle } from './settle';
import { SlideRenderer } from './SlideRenderer';

// Text that shrinks to fit (TXT-07) is fitted to its box, so it has to be fitted again when the
// box changes. The model keeps the identity of what a change did not touch (ADR-007): after a
// resize the element has a new frame and the same `content` object, and a fit that looked only
// at the text kept the scale of the old box. A slide drawn afresh (a show, an export) had the
// right one, so the Stage showed something else than the deck would look like (RND-01).

const content = richText(
  'Shrink keeps a long text inside its box: the letters and the spacing get smaller together, until all of it is in. This sentence is long enough to need it.',
  { dir: 'ltr' },
);

// One deck, as the editor has one: a change gives the element a new object and leaves the theme,
// the assets and the text as the objects they were.
const base = createDeck({
  lang: 'en',
  slides: [
    createSlide({
      id: 's_1',
      elements: [
        createElement.text({
          id: 'e_text',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          autoFit: 'shrink',
          content,
        }),
      ],
    }),
  ],
});

function deckWith(patch: Partial<TextElement>): { deck: Deck; slide: Slide } {
  const first = base.slides[0]!;
  const slide: Slide = {
    ...first,
    elements: first.elements.map((e) => ({ ...(e as TextElement), ...patch })),
  };
  return { deck: { ...base, slides: [slide] }, slide };
}

const SMALL = { x: 100, y: 100, w: 420, h: 120 };
const LARGE = { x: 100, y: 100, w: 1600, h: 800 };

async function mounted(patch: Partial<TextElement>) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;';
  document.body.append(container);
  const root = createRoot(container);
  const render = (next: Partial<TextElement>) => {
    const { deck, slide } = deckWith(next);
    flushSync(() => root.render(<SlideRenderer deck={deck} slide={slide} />));
  };
  render(patch);
  await settle();
  const slideRoot = container.querySelector<HTMLElement>('[data-slide-id]')!;
  const read = async () => (await measureSlide(slideRoot)).elements.e_text!.text!;
  /** The scale the text has at this very moment, straight from where `shrink` writes it. */
  const scaleNow = () => {
    const zoomed = slideRoot.querySelector('[data-slidr-text]')?.firstElementChild
      ?.firstElementChild as HTMLElement | null;
    return parseFloat(zoomed?.style.zoom || '1');
  };
  return {
    render,
    read,
    scaleNow,
    dispose: () => {
      root.unmount();
      container.remove();
    },
  };
}

/** What a slide drawn afresh with this element shows. */
async function fresh(patch: Partial<TextElement>) {
  const drawn = await mounted(patch);
  const text = await drawn.read();
  drawn.dispose();
  return text;
}

test('a shrunken text box that is made larger is fitted again', async () => {
  const wanted = await fresh({ frame: LARGE });
  expect(wanted.scale).toBe(1);

  const live = await mounted({ frame: SMALL });
  expect((await live.read()).scale).toBeLessThan(1);
  // The user drags the box larger: `element.update` with a new frame, the same content.
  live.render({ frame: LARGE });
  // Fitted with the render itself, before any frame is drawn: lint after an agent's write reads
  // the slide in a window that may get no frames at all.
  const atOnce = live.scaleNow();
  await settle();
  const after = await live.read();
  live.dispose();
  expect(atOnce).toBe(wanted.scale);
  expect(after.scale).toBe(wanted.scale);
});

test('a text box that is made smaller is shrunk to fit', async () => {
  const wanted = await fresh({ frame: SMALL });
  expect(wanted.scale).toBeLessThan(1);
  expect(wanted.overflow.y).toBe(0);

  const live = await mounted({ frame: LARGE });
  expect((await live.read()).scale).toBe(1);
  live.render({ frame: SMALL });
  await settle();
  const after = await live.read();
  live.dispose();
  expect(after.overflow.y).toBe(0);
  expect(after.scale).toBeCloseTo(wanted.scale, 2);
});

test('a box that something other than its frame made smaller is fitted again too', async () => {
  // The element's own CSS takes room from the inside of the box; the frame stays as it was.
  const css = { 'padding-top': '770px' };
  const wanted = await fresh({ frame: LARGE, css });
  expect(wanted.scale).toBeLessThan(1);

  const live = await mounted({ frame: LARGE });
  expect((await live.read()).scale).toBe(1);
  live.render({ frame: LARGE, css });
  await settle();
  const after = await live.read();
  live.dispose();
  expect(after.overflow.y).toBe(0);
  expect(after.scale).toBeCloseTo(wanted.scale, 2);
});
