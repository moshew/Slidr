import {
  createDeck,
  createElement,
  createSlide,
  type Deck,
  type Element as SlideElement,
} from '@slidr/model';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { describe, expect, it } from 'vitest';
import { exportHtml, type ExportResult } from './exportHtml';
import { writeSlides } from './written';

/*
 * What an exported file holds is what was drawn (SEC-03, SEC-06), tried from the deck's side.
 * A file is parsed again by whoever opens it, with no content policy around it: markup of a deck
 * that comes back as another tree there is live in the reader's browser, outside the sandboxed
 * frame that scripts of a deck are kept in.
 *
 * Each file is opened here the way a reader opens it: as a document of its own, in a frame of
 * this page. The markup below is attack markup, on purpose; a handler that runs sets a flag on
 * the frame's window.
 */

const ran = (name: string) => `(window.fileRan ??= []).push('${name}')`;
const quoted = (name: string) => ran(name).replaceAll("'", '`');

interface Opened {
  result: ExportResult;
  ran: string[];
  /** What is in the file's document that could run, shadow roots included. */
  dangerous: string[];
  document: Document;
  /** The player took the slides over: the file works. */
  ready: boolean;
  close(): void;
}

function everything(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('*')).flatMap((el) => [
    el,
    ...(el.shadowRoot ? everything(el.shadowRoot) : []),
    ...(el instanceof HTMLTemplateElement ? everything(el.content) : []),
  ]);
}

async function open(deck: Deck): Promise<Opened> {
  const result = await exportHtml(deck, { loadAsset: () => Promise.resolve(undefined) });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:absolute;left:0;top:0;width:960px;height:540px';
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = result.html;
  document.body.append(frame);
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const page = frame.contentDocument!;
  const slides = page.querySelector('.slidr-stage')!;
  const dangerous = everything(slides).flatMap((el) => [
    // A frame is where a deck's scripts are meant to be, as long as it is the sandboxed kind.
    ...(el.localName === 'iframe' &&
    el.getAttribute('sandbox') === 'allow-scripts' &&
    !el.hasAttribute('src')
      ? []
      : ['script', 'iframe', 'object', 'embed', 'meta', 'base', 'template', 'noscript'].includes(
            el.localName,
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
  return {
    result,
    ran: (frame.contentWindow as unknown as { fileRan?: string[] }).fileRan ?? [],
    dangerous,
    document: page,
    ready: page.documentElement.classList.contains('slidr-ready'),
    close: () => frame.remove(),
  };
}

const frame = (i: number) => ({
  x: 40 + (i % 8) * 220,
  y: 40 + Math.floor(i / 8) * 220,
  w: 200,
  h: 200,
});

const deckOf = (elements: SlideElement[], css?: string): Deck =>
  createDeck({
    lang: 'en',
    slides: [
      createSlide({ id: 's_1', elements, ...(css ? { css } : {}) }),
      createSlide({
        id: 's_2',
        elements: [createElement.shape({ id: 'e_last', frame: frame(0) })],
      }),
    ],
  });

const asHtml = (markups: Record<string, string>, styles?: (name: string) => string) =>
  Object.entries(markups).map(([name, markup], i) =>
    createElement.html({
      id: `e_html_${name}`,
      name,
      frame: frame(i),
      markup,
      ...(styles ? { styles: styles(name) } : {}),
      hasScripts: false,
    }),
  );
const asSvg = (markups: Record<string, string>) =>
  Object.entries(markups).map(([name, markup], i) =>
    createElement.svg({ id: `e_svg_${name}`, name, frame: frame(i), markup }),
  );

/** The file is whole: both slides are sections of the stage, and the player started. */
function expectWhole(opened: Opened): void {
  const stage = opened.document.querySelector('.slidr-stage')!;
  expect(Array.from(stage.children, (el) => el.localName)).toEqual(['section', 'section']);
  expect(stage.querySelector('[data-element-id="e_last"]')).toBeTruthy();
  expect(opened.ready).toBe(true);
}

describe('CSS of a deck stays CSS in the file', () => {
  const BREAKOUTS: Record<string, (name: string) => string> = {
    closingTag: (n) => `p { color: red } </style><img src="data:," onerror="${ran(n)}">`,
    script: (n) => `p { color: red } </style><script>${ran(n)}</script>`,
    upperCase: (n) => `p { color: red } </STYLE><img src="data:," onerror="${ran(n)}">`,
    spaced: (n) => `p { color: red } </style\n><img src="data:," onerror="${ran(n)}">`,
    slash: (n) => `p { color: red } </style/><img src="data:," onerror="${ran(n)}">`,
    inString: (n) => `p::after { content: "</style><img src=data:, onerror=${quoted(n)}>" }`,
    inComment: (n) => `/* </style><img src="data:," onerror="${ran(n)}"> */ p { color: red }`,
    twice: (n) => `</style></style><img src="data:," onerror="${ran(n)}"><style>`,
  };

  it('the stylesheet of an html element (bug hunt, objects-media.md, finding 1)', async () => {
    const names = Object.keys(BREAKOUTS);
    const opened = await open(
      deckOf(
        asHtml(Object.fromEntries(names.map((name) => [name, '<p>A card</p>'])), (name) =>
          BREAKOUTS[name]!(name),
        ),
      ),
    );
    expect(opened.ran).toEqual([]);
    expect(opened.dangerous).toEqual([]);
    expectWhole(opened);
    // The CSS is still the CSS that was written: the rule before the closing tag applies.
    const card = opened.document
      .querySelector('[data-element-id="e_html_closingTag"] [data-slidr-html]')
      ?.shadowRoot?.querySelector('p');
    expect(getComputedStyle(card!).color).toBe('rgb(255, 0, 0)');
    opened.close();
  });

  it('a stylesheet inside the markup of an html element', async () => {
    // Text the parser itself never leaves in a <style>, put there by a second parse.
    const opened = await open(
      deckOf(
        asHtml({
          nested: `<svg><style><![CDATA[</style><img src="data:," onerror="${ran('nested')}">]]></style></svg>`,
          attribute: `<svg></p><style><a id="</style><img src='data:,' onerror='${quoted('attribute')}'>">`,
        }),
      ),
    );
    expect(opened.ran).toEqual([]);
    expect(opened.dangerous).toEqual([]);
    expectWhole(opened);
    opened.close();
  });

  for (const [name, css] of Object.entries(BREAKOUTS)) {
    it(`the css of a slide (${name})`, async () => {
      const opened = await open(deckOf([], css(name)));
      expect(opened.ran).toEqual([]);
      expect(opened.dangerous).toEqual([]);
      expectWhole(opened);
      opened.close();
    });
  }
});

describe('markup of a deck comes back from the file as it was drawn', () => {
  const MARKUP: Record<string, string> = {
    plain: `<p onclick="${ran('plain')}">x</p><img src="data:," onerror="${ran('plain')}"><script>${ran('plain')}</script>`,
    shadowTemplate: `<div><template shadowrootmode="open"><img src="data:," onerror="${ran('shadowTemplate')}"></template></div>`,
    shadowTemplateUpper: `<div><TEMPLATE SHADOWROOTMODE="open" shadowrootdelegatesfocus><img src="data:," onerror="${ran('shadowTemplateUpper')}"></TEMPLATE></div>`,
    templateInSvg: `<svg><foreignObject><div><template shadowrootmode="closed"><img src="data:," onerror="${ran('templateInSvg')}"></template></div></foreignObject></svg>`,
    templateInTemplate: `<template><div><template shadowrootmode="open"><img src="data:," onerror="${ran('templateInTemplate')}"></template></div></template>`,
    formMath: `<form><math><mtext></form><form><mglyph><style></math><img src="data:," onerror="${ran('formMath')}">`,
    svgStyleText: `<svg><style>&lt;img src="data:," onerror="${ran('svgStyleText')}"&gt;</style></svg>`,
    mathTable: `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src='data:,' onerror='${quoted('mathTable')}'&gt;">`,
    noscript: `<noscript><p title="</noscript><img src='data:,' onerror='${quoted('noscript')}'>"></noscript>`,
    comment: `<!--><img src="data:," onerror="${ran('comment')}">--><p>x</p><!---!><img src="data:," onerror="${ran('comment')}">-->`,
    xmp: `<xmp><img src="data:," onerror="${ran('xmp')}"></xmp><noembed><img src="data:," onerror="${ran('xmp')}"></noembed>`,
    selectTable: `<select><table><style></select><img src="data:," onerror="${ran('selectTable')}"></style></table></select>`,
    nestedTables: `<table><td><a><table><a><img src="data:," onerror="${ran('nestedTables')}"></table></td></table>`,
    titleInSvg: `<svg><title><style><img src="data:," onerror="${ran('titleInSvg')}"></style></title></svg>`,
    mathAnnotation: `<math><annotation-xml encoding="text/html"><style><img src="data:," onerror="${ran('mathAnnotation')}"></style></annotation-xml></math>`,
    frame: `<iframe srcdoc="<script>parent.${quoted('frame')}</script>"></iframe><iframe src="javascript:parent.${quoted('frame')}"></iframe>`,
    link: `<a href="javascript:${ran('link')}">x</a><svg><a xlink:href="javascript:${ran('link')}"><rect width="5" height="5"/></a></svg>`,
  };

  it('an html element without scripts', async () => {
    const opened = await open(deckOf(asHtml(MARKUP)));
    expect(opened.ran).toEqual([]);
    expect(opened.dangerous).toEqual([]);
    expectWhole(opened);
    opened.close();
  });

  it('an svg element', async () => {
    const opened = await open(deckOf(asSvg(MARKUP)));
    expect(opened.ran).toEqual([]);
    expect(opened.dangerous).toEqual([]);
    expectWhole(opened);
    opened.close();
  });

  it('an html element with scripts runs them in its sandboxed frame, and only there', async () => {
    const deck = deckOf([
      createElement.html({
        id: 'e_scripted',
        frame: frame(0),
        markup: `<p id="out">before</p><script>document.getElementById('out').textContent = 'ran'; try { parent.fileRan = ['scripted']; } catch { /* the frame has no way out */ }</script>`,
        hasScripts: true,
      }),
    ]);
    const opened = await open(deck);
    expect(opened.ran).toEqual([]);
    expect(opened.dangerous).toEqual([]);
    const inner = opened.document.querySelector<HTMLIFrameElement>(
      'iframe[data-slidr-html="frame"]',
    )!;
    expect(inner.getAttribute('sandbox')).toBe('allow-scripts');
    // Not same-origin: the file's own page cannot be read from inside it, nor it from here.
    expect(inner.contentDocument).toBeNull();
    expectWhole(opened);
    opened.close();
  });

  it('markup that never comes back the same leaves its element empty, and the file whole', async () => {
    // Whatever follows <plaintext> is text for good, the rest of the file with it.
    const opened = await open(
      deckOf(asHtml({ card: '<p>before</p><plaintext>after', fine: '<p>stays</p>' })),
    );
    expectWhole(opened);
    const content = (name: string) =>
      opened.document.querySelector(`[data-element-id="e_html_${name}"] [data-slidr-html]`)
        ?.shadowRoot;
    expect(content('card')?.childNodes).toHaveLength(0);
    expect(content('fine')?.textContent).toBe('stays');
    expect(opened.result.warnings).toEqual([
      expect.objectContaining({ code: 'markup-unstable', subject: 'card' }),
    ]);
    opened.close();
  });

  it('markup that is only oddly nested keeps its content', async () => {
    // A link inside a link, by way of a table: the parser builds it, and builds it another way
    // from its own markup. The file holds the second way; nothing is lost and nothing is warned.
    const opened = await open(
      deckOf(
        asHtml({
          odd: '<a href="https://a.example/">first<table><tr><td><a href="https://b.example/">second</a></td></tr></table></a><p>third<div>fourth</div>',
        }),
      ),
    );
    expectWhole(opened);
    const content = opened.document.querySelector(
      '[data-element-id="e_html_odd"] [data-slidr-html]',
    )?.shadowRoot;
    expect(content?.textContent).toBe('firstsecondthirdfourth');
    expect(content?.querySelectorAll('a')).toHaveLength(2);
    expect(opened.result.warnings).toEqual([]);
    opened.close();
  });
});

describe('a picture brings no address into the file', () => {
  it('whichever way its markup names one (bug hunt, objects-media.md, finding 4)', async () => {
    const url = `${location.origin}/written-outside-${Date.now()}`;
    const picture = (inside: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">${inside}</svg>`;
    const opened = await open(
      deckOf(
        asSvg({
          set: picture(
            `<image width="10" height="10"><set attributeName="href" to="${url}"/></image>`,
          ),
          mask: picture(`<rect width="50" height="50" fill="#ff0000" mask="url(${url})"/>`),
          image: picture(
            `<image width="10" height="10" href="${url}"/><use xlink:href="${url}#a"/>`,
          ),
          sheet: picture(
            `<style>@import url(${url}); rect { cursor: url(${url}), auto }</style><rect width="5" height="5"/>`,
          ),
          escaped: picture(`<rect width="50" height="50" style="mask-image: \\75rl(${url})"/>`),
          foreign: picture(
            `<foreignObject width="10" height="10"><img src="${url}"></foreignObject>`,
          ),
        }),
      ),
    );
    expect(opened.result.html).not.toContain(url);
    expect(
      performance.getEntriesByType('resource').filter((entry) => entry.name.startsWith(url)),
    ).toEqual([]);
    // The pictures are there, in the shadow roots the file declares.
    expect(
      opened.document
        .querySelector('[data-element-id="e_svg_mask"] [data-slidr-svg]')
        ?.shadowRoot?.querySelector('rect'),
    ).toBeTruthy();
    expectWhole(opened);
    opened.close();
  });
});

describe('the check itself', () => {
  function hostOf(build: (section: HTMLElement) => void): HTMLElement {
    const host = document.createElement('div');
    const section = document.createElement('section');
    host.append(section);
    build(section);
    document.body.append(host);
    return host;
  }

  it('refuses markup of its own making that a parser would read differently', () => {
    const host = hostOf((section) => {
      const element = document.createElement('div');
      element.setAttribute('data-element-id', 'e_odd');
      // A block inside a paragraph: no parser builds this from markup.
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('div'));
      element.append(paragraph);
      section.append(element);
    });
    expect(() => writeSlides(host)).toThrow(/e_odd/);
    host.remove();
  });

  it('passes what only a parser spells differently', () => {
    const host = hostOf((section) => {
      const element = document.createElement('div');
      element.setAttribute('data-element-id', 'e_text');
      element.setAttribute('data-name', 'line one\r\nline two');
      // Text in pieces, an empty piece, a Windows line break.
      element.append('a', '', 'b\r\nc', document.createElement('br'), 'd');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1 1');
      svg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#a');
      svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'clipPath'));
      element.append(svg);
      section.append(element);
    });
    expect(writeSlides(host).markup).toContain('clipPath');
    host.remove();
  });

  it('leaves the reference deck as it is, with no warning', async () => {
    const result = await exportHtml(referenceDeck(), {
      loadAsset: () => Promise.resolve(undefined),
    });
    expect(result.warnings.filter((warning) => warning.code === 'markup-unstable')).toEqual([]);
    expect(result.slides).toBeGreaterThan(5);
  });
});
