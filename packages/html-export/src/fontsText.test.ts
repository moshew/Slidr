// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { embedFonts } from './fonts';
import type { TextUse } from './fontsMatch';
import { collectText } from './fontsText';

// Which text the slides draw in which font, read off the DOM. What only a layout engine knows
// (`::before`, the markers of a list, real fonts) is tested in fonts.browser.test.ts.

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

afterEach(() => document.body.replaceChildren());

const text = (use: TextUse | undefined) =>
  String.fromCodePoint(...Array.from(use?.codePoints ?? []).sort((a, b) => a - b));

const PAIR = `font-family: 'Heebo::hebrew', Inter, Heebo, sans-serif`;

describe('collectText', () => {
  it('gathers the text of every element under the font it is drawn in', () => {
    const uses = collectText(
      host(`<div style="${PAIR}; font-weight: 400">
        <p>ab<span style="font-weight: 700">cd</span>ef</p>
        <p style="font-style: italic">gh</p>
        <p>ij</p>
      </div>`),
    );
    const regular = uses.find((u) => u.weight === 400 && u.style === 'normal');
    expect(regular?.families).toEqual(['Heebo::hebrew', 'Inter', 'Heebo', 'sans-serif']);
    expect(text(regular).replace(/\s/g, '')).toBe('abefij');
    expect(text(uses.find((u) => u.weight === 700))).toBe('cd');
    expect(text(uses.find((u) => u.style === 'italic'))).toBe('gh');
    expect(uses).toHaveLength(3);
  });

  it('keeps apart text in different font lists', () => {
    const uses = collectText(
      host(`<p style="font-family: Rubik">ab</p><p style="font-family: 'Open Sans', Heebo">cd</p>`),
    );
    expect(uses.map((u) => [u.families, text(u)])).toEqual([
      [['Rubik'], 'ab'],
      [['Open Sans', 'Heebo'], 'cd'],
    ]);
  });

  it('adds the capitals of text that is drawn in capitals', () => {
    const uses = collectText(
      host(`<p style="font-family: Inter; text-transform: uppercase">ab</p>`),
    );
    expect(text(uses[0])).toBe('ABab');
  });

  it('adds the hyphen a line may end with at a soft hyphen', () => {
    const soft = String.fromCodePoint(0xad);
    const uses = collectText(host(`<p style="font-family: Inter">ab${soft}cd</p>`));
    expect(uses[0]?.codePoints.has(0x2010)).toBe(true);
    expect(uses[0]?.codePoints.has(0x2d)).toBe(true);
  });

  it('reads the text a form control or a missing picture shows', () => {
    const uses = collectText(
      host(
        `<div style="font-family: Inter"><input placeholder="ab" value="cd"><img alt="ef"></div>`,
      ),
    );
    expect(text(uses[0])).toBe('abcdef');
  });

  it('skips what is not drawn: stylesheets, scripts, and frames it cannot read', () => {
    const uses = collectText(
      host(`<div style="font-family: Inter">
        <style>p { color: red }</style><script>let q = 1</script>
        <iframe srcdoc="<p>z</p>">w</iframe><p>ab</p>
      </div>`),
    );
    expect(text(uses[0]).replace(/\s/g, '')).toBe('ab');
  });

  it('looks into the shadow root of an html element', () => {
    const el = host(`<div style="font-family: Inter"><div id="shadow"></div></div>`);
    const root = el.querySelector('#shadow')?.attachShadow({ mode: 'open' });
    if (root) root.innerHTML = `<p style="font-weight: 600">ab</p>`;
    const uses = collectText(el);
    expect(uses.map((u) => [u.weight, text(u)])).toEqual([[600, 'ab']]);
  });

  it('adds the forms a shaper may draw the text with', () => {
    const uses = collectText(
      host(`<p style="font-family: Inter">(e${String.fromCodePoint(0x301)}</p>`),
    );
    // The other bracket, for a right-to-left line; the accented letter as one character.
    expect(uses[0]?.codePoints.has(0x29)).toBe(true);
    expect(uses[0]?.codePoints.has(0xe9)).toBe(true);
  });
});

describe('embedFonts', () => {
  it('embeds nothing where the document loads no fonts', async () => {
    const el = host(`<p style="font-family: Inter">ab</p>`);
    expect(await embedFonts(el)).toEqual({ css: '', fonts: [], warnings: [] });
  });
});
