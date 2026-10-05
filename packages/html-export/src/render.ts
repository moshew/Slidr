import { walkElements, type Deck, type Paragraph, type Slide } from '@slidr/model';
import { chartsSettled, SlideRenderer, type AssetResolver } from '@slidr/renderer';
import { CLIP_VOLUME, type AnimationStep, type Transition } from '@slidr/runtime';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/**
 * The slides of a deck as live DOM (WG9-T07). An export serialises the DOM the renderer drew
 * rather than a string of markup, because part of a slide exists only after layout: the zoom of
 * text that shrinks to fit, and the shadow roots of `html` elements (ADR-009).
 */
export interface RenderedSlides {
  /** Holds one `<section class="slide">` per slide. */
  host: HTMLElement;
  /** Unmounts the slides and removes the host. */
  dispose: () => void;
}

const frame = (doc: Document): Promise<void> =>
  new Promise((resolve) => {
    const view = doc.defaultView;
    if (!view) return resolve();
    // A window in the background gets no frames: do not wait for one forever.
    const timer = view.setTimeout(resolve, 100);
    view.requestAnimationFrame(() => {
      view.clearTimeout(timer);
      resolve();
    });
  });

/** Every element under a root, into the open shadow roots of `html` elements too. */
export function* everyElement(root: ParentNode): Generator<Element> {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    yield element;
    if (element.shadowRoot) yield* everyElement(element.shadowRoot);
  }
}

/**
 * Resolves once the slides show what they will show: fonts in, text measured again after them.
 * Not the renderer's `settle`: that one waits for every frame of the document to load, and an
 * export writes a frame's `srcdoc` out without needing it loaded.
 */
async function settle(host: HTMLElement): Promise<void> {
  const doc = host.ownerDocument;
  // A chart is drawn after its library and its fonts have loaded: the file gets its picture.
  await chartsSettled();
  await doc.fonts.ready;
  const images = Array.from(everyElement(host)).filter(
    (el): el is HTMLImageElement => el instanceof HTMLImageElement && Boolean(el.src),
  );
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  // Text that shrinks to fit is measured again after the last font; that takes a render.
  await frame(doc);
  await frame(doc);
  await doc.fonts.ready;
  await frame(doc);
}

/** The attributes the runtime reads a slide's animations from (see `readSlides` in the runtime). */
function sectionProps(
  slide: Slide,
  index: number,
  animations: boolean,
): Record<string, string | undefined> {
  // Without animations a slide carries neither: it is shown whole, and left on a click or a key.
  const transition: Transition | undefined = animations ? slide.transition : undefined;
  const timeline: readonly AnimationStep[] = animations ? slide.timeline : [];
  return {
    className: 'slide',
    'data-slide': slide.id,
    'data-hidden': slide.hidden ? '' : undefined,
    'data-transition': transition ? JSON.stringify(transition) : undefined,
    'data-timeline': timeline.length ? JSON.stringify(timeline) : undefined,
    'aria-roledescription': 'slide',
    'aria-label': slide.name ?? String(index + 1),
  };
}

export async function renderSlides(
  doc: Document,
  deck: Deck,
  slides: readonly Slide[],
  resolveAsset: AssetResolver,
  animations = true,
): Promise<RenderedSlides> {
  const host = doc.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Laid out at full size and never seen. Not `display: none`: text has to be measured.
  host.style.cssText = `position:fixed;left:0;top:0;width:${deck.size.w}px;height:${deck.size.h}px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1`;
  doc.body.append(host);
  let failure: unknown;
  const root = createRoot(host, {
    // Ids of SVG definitions stay apart from those of slides the page already shows.
    identifierPrefix: 'x',
    onUncaughtError: (error) => (failure = error),
  });
  const dispose = () => {
    root.unmount();
    host.remove();
  };
  try {
    flushSync(() =>
      root.render(
        slides.map((slide, i) =>
          createElement(
            'section',
            { key: slide.id, ...sectionProps(slide, i, animations) },
            // Without the page's script nonce: a file has no policy that asks for one.
            createElement(SlideRenderer, {
              deck,
              slide,
              mode: 'present',
              resolveAsset,
              scriptNonce: '',
            }),
          ),
        ),
      ),
    );
    await settle(host);
  } catch (error) {
    failure = error;
  }
  if (failure !== undefined) {
    dispose();
    throw failure instanceof Error ? failure : new Error('the slides could not be drawn');
  }
  return { host, dispose };
}

const HEADING: Partial<Record<NonNullable<Paragraph['styleRef']>, string>> = {
  display: 'h1',
  title: 'h1',
  heading: 'h2',
};

/**
 * Makes the titles of the slides real headings (EXP-03). The renderer draws every paragraph as a
 * `<p>` with all of its style inline, so the tag can change without the text moving.
 */
export function markHeadings(host: HTMLElement, slides: readonly Slide[]): void {
  const sections = Array.from(host.children);
  slides.forEach((slide, i) => {
    const section = sections[i];
    if (!section) return;
    const nodes = new Map<string, Element>();
    for (const el of Array.from(section.querySelectorAll('[data-element-id]'))) {
      nodes.set(el.getAttribute('data-element-id') ?? '', el);
    }
    for (const element of walkElements(slide.elements)) {
      if (element.type !== 'text' && element.type !== 'shape') continue;
      const paragraphs = element.content?.paragraphs;
      const box = nodes.get(element.id)?.querySelector('[data-slidr-text]');
      if (!paragraphs || !box) continue;
      // One `p` or `li` per paragraph, in order.
      Array.from(box.querySelectorAll('p, li')).forEach((node, n) => {
        const tag = HEADING[paragraphs[n]?.styleRef ?? 'body'];
        if (!tag || node.localName !== 'p') return;
        const heading = node.ownerDocument.createElement(tag);
        for (const attr of Array.from(node.attributes)) heading.setAttribute(attr.name, attr.value);
        heading.append(...Array.from(node.childNodes));
        node.replaceWith(heading);
      });
    }
  });
}

/** The rules a slide registers the deck's fonts with, at its root (`SlideRenderer`). */
const DECK_FONTS = ':scope > section > .slidr-slide > style[data-slidr-fonts]';

/**
 * Takes the font rules of the deck out of the drawn slides and returns them, each once.
 *
 * Every slide registers the fonts the deck carries as assets for itself (`deckFontFaces` of the
 * renderer): a slide is drawn alone on the Stage, in a thumbnail, in a capture. In a file all the
 * slides are one page and a rule holds its font as data, so a rule in every slide was a copy of
 * every font for every slide: three slides and one font of 20 KB were 60 KB of font. A
 * `@font-face` rule names its family for the whole document wherever it stands, so the rules
 * belong to the file: once, in its head, and every slide draws with them.
 *
 * It is called last, right before the slides are written, with nothing awaited in between: the
 * slides are still laid out, and a slide measured again without its fonts would be written with
 * another fit of its text.
 */
export function takeDeckFonts(host: HTMLElement): string {
  const rules = new Set<string>();
  for (const style of Array.from(host.querySelectorAll(DECK_FONTS))) {
    const css = style.textContent?.trim();
    // The slides of one deck all say the same; said differently, each saying is kept.
    if (css) rules.add(css);
    style.remove();
  }
  return Array.from(rules).join('\n');
}

/**
 * Writes down what media elements hold only as properties, which markup does not carry: React
 * sets `muted` and the volume on the element, not as attributes. The runtime reads the volume
 * back when it takes charge of the clip.
 */
export function persistMediaState(host: HTMLElement): void {
  for (const element of everyElement(host)) {
    if (!(element instanceof HTMLMediaElement)) continue;
    if (element.muted) element.setAttribute('muted', '');
    if (element.volume !== 1) element.setAttribute(CLIP_VOLUME, String(element.volume));
  }
}
