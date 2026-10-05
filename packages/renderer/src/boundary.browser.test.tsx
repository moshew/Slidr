import {
  createDeck,
  createElement,
  createSlide,
  type Deck,
  type Element as SlideElement,
  type Slide,
} from '@slidr/model';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderMode } from './context';
import { reachesOutside } from './picture';
import { sanitizeMarkup } from './sanitize';
import { SlideRenderer } from './SlideRenderer';

/*
 * The boundary between a deck and the page that draws it (SEC-03, SEC-06), tried from the deck's
 * side: free markup of a deck (an `svg` element, an `html` element without scripts) and its
 * free CSS are drawn, and that is all they do. They run nothing, they style nothing but their
 * own slide or element, and a picture asks nothing of the network.
 *
 * This page has no content policy, unlike the app's: whatever the cleaning lets through here
 * really runs, and really leaves. The markup below is attack markup, on purpose. Addresses are
 * on this page's own origin, so nothing leaves the machine.
 */

declare global {
  interface Window {
    boundaryRan?: string[];
  }
}

const ran = (name: string) => `(window.boundaryRan ??= []).push('${name}')`;

/** Markup that tries to run code. Each is tried as an `svg` element and as an `html` element. */
const SCRIPTS: Record<string, string> = {
  // The plain forms.
  script: `<svg viewBox="0 0 10 10"><script>${ran('script')}</script><rect width="10" height="10"/></svg>`,
  handlerOnRoot: `<svg viewBox="0 0 10 10" onload="${ran('handlerOnRoot')}"><rect width="10" height="10"/></svg>`,
  handlerOnImage: `<svg viewBox="0 0 10 10"><image href="data:," onerror="${ran('handlerOnImage')}"/></svg>`,
  htmlImage: `<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg><img src="data:," onerror="${ran('htmlImage')}">`,
  foreignObject: `<svg viewBox="0 0 10 10"><foreignObject width="10" height="10"><img src="data:," onerror="${ran('foreignObject')}"></foreignObject></svg>`,
  titleIsHtml: `<svg viewBox="0 0 10 10"><title><img src="data:," onerror="${ran('titleIsHtml')}"></title></svg>`,
  frame: `<svg viewBox="0 0 10 10"><foreignObject><iframe srcdoc="<script>parent.${ran('frame')}</script>"></iframe></foreignObject></svg>`,
  // Case and entities: the parser gives the same names and values as for the plain forms.
  upperCase: `<SVG VIEWBOX="0 0 10 10" ONLOAD="${ran('upperCase')}"><SCRIPT>${ran('upperCase')}</SCRIPT></SVG>`,
  entityInHandler: `<svg viewBox="0 0 10 10" onload="&#40;window.boundaryRan ??= []).push('entityInHandler')"></svg>`,
  autofocus: `<svg viewBox="0 0 10 10"><foreignObject><input autofocus onfocus="${ran('autofocus')}"></foreignObject></svg>`,
  // An animation writes the attribute after the cleaning has looked.
  setHandler: `<svg viewBox="0 0 10 10"><rect width="10" height="10"><set attributeName="onmouseover" to="${ran('setHandler')}"/></rect></svg>`,
  // Markup whose second parse is another tree than its first (found by the bug hunt).
  formMath: `<form><math><mtext></form><form><mglyph><style></math><img src="data:," onerror="${ran('formMath')}">`,
  svgStyleText: `<svg><style>&lt;img src="data:," onerror="${ran('svgStyleText')}"&gt;</style></svg>`,
  svgStyleAttribute: `<svg></p><style><a id="</style><img src='data:,' onerror='${ran('svgStyleAttribute').replaceAll("'", '`')}'>">`,
  mathTable: `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src='data:,' onerror='${ran('mathTable').replaceAll("'", '`')}'&gt;">`,
  noscript: `<noscript><p title="</noscript><img src='data:,' onerror='${ran('noscript').replaceAll("'", '`')}'>"></noscript>`,
  comment: `<svg><desc><!--</desc><img title="--><img src='data:,' onerror='${ran('comment').replaceAll("'", '`')}'>">`,
  // A template is not drawn, and a file reader makes its content live.
  shadowTemplate: `<div><template shadowrootmode="open"><img src="data:," onerror="${ran('shadowTemplate')}"></template></div>`,
};

/** Links that would run code, or take the window elsewhere, when clicked. */
const LINKS: Record<string, string> = {
  href: `<svg viewBox="0 0 10 10"><a href="javascript:${ran('href')}"><rect width="10" height="10"/></a></svg>`,
  xlink: `<svg viewBox="0 0 10 10"><a xlink:href="javascript:${ran('xlink')}"><rect width="10" height="10"/></a></svg>`,
  entity: `<svg viewBox="0 0 10 10"><a href="&#106;avascript&colon;${ran('entity')}"><rect width="10" height="10"/></a></svg>`,
  whitespace: `<svg viewBox="0 0 10 10"><a href=" &#9;java&#10;script:${ran('whitespace')}"><rect width="10" height="10"/></a></svg>`,
  mixedCase: `<svg viewBox="0 0 10 10"><a href="JaVaScRiPt:${ran('mixedCase')}"><rect width="10" height="10"/></a></svg>`,
  animated: `<svg viewBox="0 0 10 10"><a href="#"><set attributeName="href" to="javascript:${ran('animated')}"/><animate attributeName="xlink:href" values="javascript:${ran('animated')}" dur="1s" repeatCount="indefinite"/><rect width="10" height="10"/></a></svg>`,
};

/** Every element under a root, into shadow roots and the content of templates. */
function everything(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('*')).flatMap((el) => [
    el,
    ...(el.shadowRoot ? everything(el.shadowRoot) : []),
    ...(el instanceof HTMLTemplateElement ? everything(el.content) : []),
  ]);
}

/** What is in the drawn tree that could run or that starts a document of its own. */
const dangerous = (root: ParentNode): string[] =>
  everything(root).flatMap((el) => [
    ...(['script', 'iframe', 'object', 'embed', 'meta', 'base', 'template', 'noscript'].includes(
      el.localName.toLowerCase(),
    )
      ? [`<${el.localName}>`]
      : []),
    ...Array.from(el.attributes)
      .filter(
        (a) =>
          a.name.toLowerCase().startsWith('on') ||
          /^\s*javascript:/i.test(a.value.replace(/[\t\n\r]/g, '')),
      )
      .map((a) => `<${el.localName} ${a.name}>`),
  ]);

const frame = (i: number) => ({
  x: 40 + (i % 8) * 220,
  y: 40 + Math.floor(i / 8) * 220,
  w: 200,
  h: 200,
});

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose();
  delete window.boundaryRan;
});

function draw(deck: Deck, slide: Slide, mode: RenderMode = 'edit'): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => root.render(<SlideRenderer deck={deck} slide={slide} mode={mode} />));
  mounted.push(() => {
    root.unmount();
    container.remove();
  });
  return container;
}

function deckOf(elements: SlideElement[], css?: string): { deck: Deck; slide: Slide } {
  const slide = createSlide({ id: 's_boundary', elements, ...(css ? { css } : {}) });
  return { deck: createDeck({ lang: 'en', slides: [slide] }), slide };
}

const asSvg = (markups: Record<string, string>) =>
  Object.entries(markups).map(([name, markup], i) =>
    createElement.svg({ id: `e_svg_${name}`, frame: frame(i), markup }),
  );
const asHtml = (markups: Record<string, string>) =>
  Object.entries(markups).map(([name, markup], i) =>
    createElement.html({ id: `e_html_${name}`, frame: frame(i), markup, hasScripts: false }),
  );

const moment = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

describe('markup of a deck runs nothing in the page that draws it', () => {
  for (const mode of ['edit', 'thumbnail', 'present'] as const) {
    it(`an svg element, in ${mode} mode`, async () => {
      const { deck, slide } = deckOf(asSvg({ ...SCRIPTS, ...LINKS }));
      const container = draw(deck, slide, mode);
      await moment();
      expect(dangerous(container)).toEqual([]);
      expect(window.boundaryRan ?? []).toEqual([]);
    });

    it(`an html element without scripts, in ${mode} mode`, async () => {
      const { deck, slide } = deckOf(asHtml({ ...SCRIPTS, ...LINKS }));
      const container = draw(deck, slide, mode);
      await moment();
      expect(dangerous(container)).toEqual([]);
      expect(window.boundaryRan ?? []).toEqual([]);
    });
  }

  it('a link in an html element opens beside the window, never in it', () => {
    const { deck, slide } = deckOf(
      asHtml({
        html: '<a href="https://example.com/a">a</a><map><area href="https://example.com/b"></map>',
        svg: '<svg viewBox="0 0 10 10"><a href="https://example.com/c"><rect width="10" height="10"/></a><a xlink:href="https://example.com/d"><rect width="10" height="10"/></a></svg>',
      }),
    );
    const links = everything(draw(deck, slide, 'present')).filter((el) =>
      ['a', 'area'].includes(el.localName),
    );
    expect(links).toHaveLength(4);
    for (const link of links) expect(link.getAttribute('target')).toBe('_blank');
  });

  it('a picture holds no link at all, and keeps what the link was around', () => {
    const { deck, slide } = deckOf(asSvg(LINKS));
    const container = draw(deck, slide, 'present');
    const drawn = everything(container);
    expect(drawn.filter((el) => el.localName === 'a')).toEqual([]);
    expect(drawn.filter((el) => el.localName === 'rect')).toHaveLength(Object.keys(LINKS).length);
  });

  it('sanitizeMarkup answers with a string that is clean when it is parsed again', () => {
    for (const [name, markup] of Object.entries({ ...SCRIPTS, ...LINKS })) {
      const again = document.createElement('div');
      again.innerHTML = sanitizeMarkup(markup);
      expect(dangerous(again), name).toEqual([]);
    }
  });
});

describe('an svg element draws its picture', () => {
  const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20 L20 4"/><rect class="dot" width="4" height="4" fill="#ff0000"/></svg>';

  const picture = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-element-id="${id}"] [data-slidr-svg]`)?.shadowRoot;

  it('in a shadow root of its own, at the size of its frame, in the colours it is given', () => {
    const element = createElement.svg({
      id: 'e_icon',
      frame: { x: 100, y: 100, w: 300, h: 200 },
      markup: ICON,
      colorOverrides: { '#ff0000': { token: 'primary' }, currentColor: { value: '#00ff00' } },
    });
    const { deck, slide } = deckOf([element]);
    const container = draw(deck, slide);
    const root = picture(container, 'e_icon');
    const svg = root?.querySelector('svg');
    expect(svg).toBeTruthy();
    // Nothing of the picture is in the page's own tree.
    expect(container.querySelector('svg, path, rect')).toBeNull();
    const box = svg!.getBoundingClientRect();
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([300, 200]);
    // The theme's variables and the colour to draw in reach into the picture.
    const primary = getComputedStyle(container.querySelector('[data-slide-id]')!)
      .getPropertyValue('--color-primary')
      .trim();
    const probe = document.createElement('i');
    probe.style.color = primary;
    container.append(probe);
    expect(getComputedStyle(root!.querySelector('rect')!).fill).toBe(getComputedStyle(probe).color);
    expect(getComputedStyle(root!.querySelector('path')!).stroke).toBe('rgb(0, 255, 0)');
  });

  it('again when its markup or its colours change, and the same root is kept', () => {
    const base = createElement.svg({ id: 'e_icon', frame: frame(0), markup: ICON });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      root.unmount();
      container.remove();
    });
    const show = (element: SlideElement) => {
      const { deck, slide } = deckOf([element]);
      flushSync(() => root.render(<SlideRenderer deck={deck} slide={slide} />));
    };
    show(base);
    const first = picture(container, 'e_icon');
    expect(first?.querySelectorAll('rect')).toHaveLength(1);
    show({ ...base, markup: ICON.replace('<rect', '<circle r="2"/><rect') });
    expect(picture(container, 'e_icon')).toBe(first);
    expect(first?.querySelectorAll('circle')).toHaveLength(1);
    show({ ...base, colorOverrides: { '#ff0000': { value: '#0000ff' } } });
    expect(getComputedStyle(first!.querySelector('rect')!).fill).toBe('rgb(0, 0, 255)');
  });

  it('only the first <svg> of its markup, and nothing when there is none', () => {
    const { deck, slide } = deckOf(
      asSvg({
        wrapped: '<p>before</p><div><svg viewBox="0 0 1 1"><rect/></svg></div><svg><circle/></svg>',
        none: '<p>not a picture</p>',
      }),
    );
    const container = draw(deck, slide);
    const wrapped = picture(container, 'e_svg_wrapped');
    expect(Array.from(wrapped?.children ?? [], (el) => el.localName)).toEqual(['svg']);
    expect(wrapped?.textContent).toBe('');
    expect(wrapped?.querySelector('circle')).toBeNull();
    expect(picture(container, 'e_svg_none')?.childNodes).toHaveLength(0);
  });

  it('two pictures that use one id each keep their own', () => {
    const gradient = (colour: string) =>
      `<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop stop-color="${colour}"/></linearGradient></defs><rect id="r" width="10" height="10" fill="url(#g)"/></svg>`;
    const { deck, slide } = deckOf(asSvg({ red: gradient('#ff0000'), blue: gradient('#0000ff') }));
    const container = draw(deck, slide);
    // An id inside a picture is not an id of the page.
    expect(document.getElementById('g')).toBeNull();
    expect(picture(container, 'e_svg_blue')?.getElementById('g')?.innerHTML).toContain('#0000ff');
  });
});

describe('CSS of a deck styles its own slide or element, and nothing else', () => {
  /** Something of the editor's own page, outside every slide. */
  function victim(): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-boundary-victim', '');
    el.className = 'victim';
    el.textContent = 'editor chrome';
    el.style.cssText = 'position:fixed;right:0;bottom:0;width:40px;height:20px';
    document.body.append(el);
    mounted.push(() => el.remove());
    return el;
  }
  const HIDE = '[data-boundary-victim], .victim, body > div, * { display: none !important }';
  const shown = (el: HTMLElement) => getComputedStyle(el).display !== 'none';

  it('a stylesheet in an svg element stays in its picture', async () => {
    const outside = victim();
    const { deck, slide } = deckOf(
      asSvg({
        plain: `<svg viewBox="0 0 10 10"><style>${HIDE}</style><rect width="10" height="10"/></svg>`,
        root: '<svg viewBox="0 0 10 10"><style>:root, html, body { display: none !important } :host { display: none }</style></svg>',
        cdata: `<svg viewBox="0 0 10 10"><style><![CDATA[${HIDE}]]></style></svg>`,
        media: `<svg viewBox="0 0 10 10"><style media="all">@media all { ${HIDE} }</style></svg>`,
        closed: `<svg viewBox="0 0 10 10"><style>} ${HIDE} x {</style></svg>`,
        inDefs: `<svg viewBox="0 0 10 10"><defs><style type="text/css">${HIDE}</style></defs></svg>`,
        htmlStyle: `<style>${HIDE}</style><svg viewBox="0 0 10 10"><rect/></svg>`,
        link: `<svg viewBox="0 0 10 10"><link xmlns="http://www.w3.org/1999/xhtml" rel="stylesheet" href="data:text/css,*{display:none}"/></svg>`,
      }),
    );
    const container = draw(deck, slide);
    await moment(200);
    expect(shown(outside)).toBe(true);
    expect(shown(container.querySelector('[data-slide-id]')!)).toBe(true);
    // The rules still style the picture they came with.
    const own = container
      .querySelector('[data-element-id="e_svg_plain"] [data-slidr-svg]')
      ?.shadowRoot?.querySelector('rect');
    expect(getComputedStyle(own!).display).toBe('none');
  });

  it('the stylesheet of an html element stays in its element', () => {
    const outside = victim();
    const { deck, slide } = deckOf([
      createElement.html({
        id: 'e_html',
        frame: frame(0),
        markup: `<style>${HIDE}</style><p>text</p>`,
        styles: `${HIDE} } ${HIDE}`,
        hasScripts: false,
      }),
    ]);
    const container = draw(deck, slide);
    expect(shown(outside)).toBe(true);
    expect(shown(container.querySelector('[data-slide-id]')!)).toBe(true);
  });

  const ESCAPES: Record<string, string> = {
    plain: HIDE,
    strayBrace: `} ${HIDE} x {`,
    twoBraces: `}} ${HIDE}`,
    closedMedia: `@media all { } } ${HIDE} @media all {`,
    openString: `a { content: "\n} ${HIDE} x { color: red }`,
    openComment: `a { color: red } /* } ${HIDE}`,
    commentInString: `a { content: "/*" } } ${HIDE} /* "*/ x {`,
    badUrl: `a { background: url(x y) } } ${HIDE} x {`,
    escapedBrace: `a\\} ${HIDE} x {`,
    closingTag: `a { content: "</style><style>${HIDE}</style>" } } ${HIDE}`,
    scopeEnd: `@scope (body) { ${HIDE} } } ${HIDE}`,
    rootSelectors: ':root, html, body, :scope ~ *, :scope + * { display: none !important }',
    importRule: `@import url("data:text/css,*{display:none !important}"); a { color: red }`,
    layerOrder: `@layer a { ${HIDE} }`,
  };

  for (const [name, css] of Object.entries(ESCAPES)) {
    it(`the css of a slide cannot leave its slide (${name})`, async () => {
      const outside = victim();
      const { deck, slide } = deckOf([], css);
      const container = draw(deck, slide);
      await moment(50);
      expect(shown(outside)).toBe(true);
      // The slide's own root is not something the rules above may hide either: `*` inside a
      // scope means what is under the root.
      expect(container.querySelector('[data-slide-id]')).toBeTruthy();
    });
  }

  it('the css of a slide styles what is on the slide', () => {
    const { deck, slide } = deckOf(
      [createElement.shape({ id: 'e_box', frame: frame(0) })],
      '@media all { [data-element-id="e_box"] { outline: 3px solid rgb(255, 0, 0) } } @keyframes own { to { opacity: 0.5 } } [data-element-id="e_box"] { animation: own 1s paused }',
    );
    const container = draw(deck, slide);
    const box = container.querySelector<HTMLElement>('[data-element-id="e_box"]')!;
    expect(getComputedStyle(box).outlineColor).toBe('rgb(255, 0, 0)');
    expect(box.getAnimations()).toHaveLength(1);
  });

  it('and not the same element of another slide on the page', () => {
    const one = deckOf([createElement.shape({ id: 'e_box', frame: frame(0) })]);
    const other = createSlide({
      id: 's_other',
      css: '[data-element-id="e_box"] { outline: 3px solid rgb(255, 0, 0) }',
      elements: [createElement.shape({ id: 'e_box', frame: frame(0) })],
    });
    const first = draw(one.deck, one.slide);
    const second = draw(createDeck({ slides: [other] }), other);
    const outline = (root: HTMLElement) =>
      getComputedStyle(root.querySelector('[data-element-id="e_box"]')!).outlineStyle;
    expect(outline(second)).toBe('solid');
    expect(outline(first)).toBe('none');
  });

  it("a name the css of a slide defines does not replace the page's own", async () => {
    // What the editor's page defines for itself, outside any cascade layer.
    const page = document.createElement('style');
    page.textContent = `
      @keyframes page-spin { from { opacity: 0.25 } to { opacity: 0.25 } }
      @property --page-width { syntax: "<length>"; inherits: false; initial-value: 40px }
      @counter-style page-marks { system: cyclic; symbols: "A"; suffix: "" }`;
    document.head.append(page);
    mounted.push(() => page.remove());
    const outside = victim();
    outside.style.cssText += ';animation: page-spin 100s linear; width: var(--page-width)';
    const { deck, slide } = deckOf(
      [],
      `@keyframes page-spin { from { opacity: 0.75 } to { opacity: 0.75 } }
       @property --page-width { syntax: "<length>"; inherits: false; initial-value: 400px }
       @counter-style page-marks { system: cyclic; symbols: "B"; suffix: "" }
       @keyframes slide-only { to { opacity: 0 } }`,
    );
    draw(deck, slide);
    await moment(50);
    expect(getComputedStyle(outside).opacity).toBe('0.25');
    expect(getComputedStyle(outside).width).toBe('40px');
    // A name only the slide defines is there for the slide to use.
    const user = document.createElement('div');
    user.style.animation = 'slide-only 1s paused';
    document.body.append(user);
    mounted.push(() => user.remove());
    expect(user.getAnimations()).toHaveLength(1);
  });
});

describe('a picture asks nothing of the network', () => {
  const outsideUrl = (name: string) => `${location.origin}/boundary-outside-${name}-${Date.now()}`;

  /** Ways of naming an address in SVG. `u` is the address. */
  const REFERENCES: Record<string, (u: string) => string> = {
    image: (u) => `<image width="10" height="10" href="${u}"/>`,
    imageXlink: (u) => `<image width="10" height="10" xlink:href="${u}"/>`,
    imageSrc: (u) => `<image width="10" height="10" src="${u}"/>`,
    use: (u) => `<use href="${u}#a"/>`,
    feImage: (u) =>
      `<filter id="f"><feImage href="${u}"/></filter><rect width="10" height="10" filter="url(#f)"/>`,
    setHref: (u) =>
      `<image width="10" height="10" href="data:image/png;base64,iVBORw0KGgo="><set attributeName="href" to="${u}"/></image>`,
    animateHref: (u) =>
      `<image width="10" height="10"><animate attributeName="href" values="${u};${u}" dur="1s" repeatCount="indefinite"/></image>`,
    animateXlink: (u) =>
      `<image width="10" height="10"><animate attributeName="xlink:href" values="${u};${u}" dur="1s" repeatCount="indefinite"/></image>`,
    animateFill: (u) =>
      `<rect width="10" height="10"><animate attributeName="mask" values="url(${u});url(${u})" dur="1s" repeatCount="indefinite"/></rect>`,
    mask: (u) => `<rect width="10" height="10" mask="url(${u})"/>`,
    clipPath: (u) => `<rect width="10" height="10" clip-path="url(${u}#c)"/>`,
    marker: (u) => `<path d="M1 1 L9 9" stroke="#000" marker-start="url(${u}#m)"/>`,
    cursor: (u) => `<rect width="10" height="10" cursor="url(${u}), auto"/>`,
    fill: (u) => `<rect width="10" height="10" fill="url(${u}#g)"/>`,
    filter: (u) => `<rect width="10" height="10" filter="url('${u}#f')"/>`,
    upperCase: (u) => `<rect width="10" height="10" mask="URL(${u})"/>`,
    escaped: (u) => `<rect width="10" height="10" mask="u\\72 l(${u})"/>`,
    escapedOne: (u) => `<rect width="10" height="10" mask="\\75rl(${u})"/>`,
    spaced: (u) => `<rect width="10" height="10" mask="url(  '${u}'  )"/>`,
    style: (u) => `<rect width="10" height="10" style="mask-image: url(${u})"/>`,
    styleBackground: (u) => `<rect width="10" height="10" style="background: url(${u})"/>`,
    styleEscaped: (u) => `<rect width="10" height="10" style="mask-image: \\55RL(${u})"/>`,
    styleImageSet: (u) => `<rect width="10" height="10" style="mask-image: image-set('${u}' 1x)"/>`,
    styleVariable: (u) =>
      `<g style="--u: url(${u})"><rect width="10" height="10" style="mask-image: var(--u)"/></g>`,
    sheet: (u) => `<style>rect { mask-image: url(${u}) }</style><rect width="10" height="10"/>`,
    sheetImport: (u) => `<style>@import url(${u});</style><rect width="10" height="10"/>`,
    sheetImportString: (u) => `<style>@import "${u}";</style><rect width="10" height="10"/>`,
    sheetFont: (u) =>
      `<style>@font-face { font-family: Outside; src: url(${u}) } text { font-family: Outside }</style><text y="8">x</text>`,
    sheetNested: (u) =>
      `<style>@media all { @supports (display: block) { rect { mask-image: url(${u}) } } }</style><rect width="10" height="10"/>`,
    sheetKeyframes: (u) =>
      `<style>@keyframes k { from { mask-image: url(${u}) } to { mask-image: url(${u}) } } rect { animation: k 1s infinite }</style><rect width="10" height="10"/>`,
    foreignImage: (u) => `<foreignObject width="10" height="10"><img src="${u}"></foreignObject>`,
    foreignBackground: (u) =>
      `<foreignObject width="10" height="10"><div style="width:9px;height:9px;background:url(${u})"></div></foreignObject>`,
    foreignLink: (u) =>
      `<foreignObject width="10" height="10"><link rel="stylesheet" href="${u}"></foreignObject>`,
    titleImage: (u) => `<title><img src="${u}"></title>`,
    video: (u) =>
      `<foreignObject width="10" height="10"><video poster="${u}" src="${u}"></video></foreignObject>`,
    xmlBase: (u) => `<g xml:base="${u}/"><image width="10" height="10" href="relative.png"/></g>`,
    emptyHref: () => `<image width="10" height="10" href=""/>`,
  };

  it('whichever way the address is written', async () => {
    const urls = Object.fromEntries(
      Object.keys(REFERENCES).map((name) => [name, outsideUrl(name)]),
    );
    const { deck, slide } = deckOf(
      asSvg(
        Object.fromEntries(
          Object.entries(REFERENCES).map(([name, inside]) => [
            name,
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">${inside(urls[name]!)}</svg>`,
          ]),
        ),
      ),
    );
    const container = draw(deck, slide, 'present');
    // Time for an animation to start and for a request to be made.
    await moment(800);
    const asked = performance.getEntriesByType('resource').map((entry) => entry.name);
    const kept: string[] = [];
    const requested: string[] = [];
    for (const [name, url] of Object.entries(urls)) {
      const root = container.querySelector(
        `[data-element-id="e_svg_${name}"] [data-slidr-svg]`,
      )?.shadowRoot;
      expect(root?.querySelector('svg'), name).toBeTruthy();
      if (root?.innerHTML.includes(url)) kept.push(name);
      if (asked.some((entry) => entry.startsWith(url))) requested.push(name);
    }
    expect({ kept, requested }).toEqual({ kept: [], requested: [] });
    // Nothing relative either: this page's own address was not asked for as a picture.
    expect(asked.filter((entry) => entry.includes('relative.png'))).toEqual([]);
  });

  it('and keeps every reference that stays inside the picture', () => {
    const PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <style>.a { fill: url(#g); mask-image: url("${PIXEL}") } @keyframes k { to { opacity: 0 } }</style>
      <defs><linearGradient id="g"><stop stop-color="#f00"/></linearGradient><linearGradient id="h" href="#g"/>
      <clipPath id="c"><rect width="5" height="5"/></clipPath><symbol id="s"><rect width="1" height="1"/></symbol></defs>
      <rect class="a" width="10" height="10" clip-path="url(#c)" style="stroke: url('#h')"/>
      <use href="#s"/><use xlink:href="#s"/><image href="${PIXEL}" width="1" height="1"/>
      <rect width="1" height="1"><animate attributeName="opacity" values="0;1" dur="1s"/></rect>
    </svg>`;
    const { deck, slide } = deckOf(asSvg({ local: markup }));
    const root = draw(deck, slide).querySelector('[data-slidr-svg]')!.shadowRoot!;
    expect(root.querySelector('style')?.textContent).toContain('url("#g")');
    expect(root.querySelector('style')?.textContent).toContain(PIXEL);
    expect(root.querySelector('style')?.textContent).toContain('@keyframes k');
    expect(root.querySelector('#h')?.getAttribute('href')).toBe('#g');
    expect(root.querySelector('.a')?.getAttribute('clip-path')).toBe('url(#c)');
    expect(root.querySelector<SVGElement>('.a')?.style.stroke).toContain('#h');
    expect(root.querySelectorAll('use[href="#s"]')).toHaveLength(1);
    expect(root.querySelectorAll('use')).toHaveLength(2);
    expect(root.querySelector('image')?.getAttribute('href')).toBe(PIXEL);
    expect(root.querySelector('animate')).toBeTruthy();
  });

  it('reads an address in CSS however it is spelled', () => {
    for (const css of [
      'url(https://x.test/a)',
      'URL( "https://x.test/a" )',
      'u\\72l(https://x.test/a)',
      '\\000075rl(https://x.test/a)',
      'url()',
      'url(relative.png)',
      'url(data:image/svg+xml,<svg/>)',
      'url(data:text/html,x)',
      'image-set("https://x.test/a" 1x)',
      '-webkit-image-set(url(#a) 1x)',
      '@import "https://x.test/a.css"',
      '@\\69mport "a.css"',
      'url(#a) url(//x.test/a)',
    ]) {
      expect(reachesOutside(css), css).toBe(true);
    }
    for (const css of [
      'url(#a)',
      "url( '#a' )",
      'url("data:image/png;base64,AAAA")',
      'red',
      'M0 0 L10 10',
      'translate(10 20) rotate(45)',
      'linear-gradient(red, blue)',
    ]) {
      expect(reachesOutside(css), css).toBe(false);
    }
  });
});
