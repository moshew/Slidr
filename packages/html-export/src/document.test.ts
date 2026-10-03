import { describe, expect, it } from 'vitest';
import { buildDocument, type DocumentParts } from './document';

const parts: DocumentParts = {
  title: 'Plan',
  lang: 'he',
  dir: 'rtl',
  size: { w: 1920, h: 1080 },
  slides: '<section class="slide"></section>',
  fontCss: '',
  script: 'start()',
};

describe('buildDocument', () => {
  it('writes the language, the direction and the title of the deck', () => {
    const html = buildDocument({ ...parts, title: 'R&D <plan>' });
    expect(html.startsWith('<!doctype html>\n<html lang="he" dir="rtl">')).toBe(true);
    expect(html).toContain('<title>R&amp;D &lt;plan></title>');
    expect(html).toContain('<meta charset="utf-8">');
  });

  it('puts the slides in a stage inside a viewport, with the size on the stage', () => {
    const html = buildDocument(parts);
    expect(html).toContain(
      '<div class="slidr-viewport"><div class="slidr-stage" data-width="1920" data-height="1080">\n<section class="slide"></section>\n</div></div>',
    );
    expect(html).toContain('.slidr-stage { position: absolute; left: 0; top: 0; width: 1920px;');
  });

  it('runs the script after the slides, and nothing from outside the file', () => {
    const html = buildDocument(parts);
    expect(html.indexOf('<script>start()</script>')).toBeGreaterThan(html.indexOf('</section>'));
    expect(html).not.toMatch(/<link\b|src=|@import|https?:/);
  });

  it('keeps the text of a script or a stylesheet from closing its own element', () => {
    const html = buildDocument({
      ...parts,
      script: 'const end = "</script>"; // <!-- not a comment',
      fontCss: '@font-face { font-family: "a</style>b"; }',
    });
    expect(html).toContain('const end = "<\\/script>"; // <\\!-- not a comment');
    expect(html).toContain('<style data-slidr-fonts>@font-face { font-family: "a<\\/style>b"; }');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('leaves the font stylesheet out when there are no fonts to carry', () => {
    expect(buildDocument(parts)).not.toContain('data-slidr-fonts');
  });

  it('shows the slides as a page when scripts do not run', () => {
    const html = buildDocument(parts);
    expect(html).toMatch(/<noscript><style>[^<]*\.slide \{ position: relative; display: block;/);
  });
});
