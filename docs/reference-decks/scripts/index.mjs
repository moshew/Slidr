// index.html: every slide of every reference deck in one grid, each next to the same slide
// rebuilt from its template, with what the conversion engine and the lint said about it.
// The slides are the decks' own HTML, inlined and scaled; nothing here is a picture of a slide.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckFiles, readDeck, root } from './decks.mjs';

const results = join(root, '..', '..', 'apps', 'desktop', 'test-results', 'templates');
const readJson = (file) =>
  existsSync(join(results, file)) ? JSON.parse(readFileSync(join(results, file), 'utf8')) : null;

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A class name for a deck id: `tzuk.en` -> `deck-tzuk-en`. */
const deckClass = (id) => `deck-${id.replace(/\W/g, '-')}`;

/**
 * A deck's stylesheet with every rule kept inside the deck's own part of the page, so four
 * decks can share one document. The decks' CSS is plain rules: no at-rules to step around.
 */
function scoped(css, scope) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors, body) => {
      const list = selectors
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean)
        .map((selector) => {
          if (selector === ':root') return scope;
          if (selector === 'body') return `${scope} .stage`;
          return `${scope} ${selector}`;
        });
      return `${list.join(', ')} {${body}}\n`;
    });
}

/** The embedded font rules of every deck, each once. */
function fonts(decks) {
  const rules = new Set();
  for (const deck of decks) {
    const css = /<style data-part="fonts">([\s\S]*?)<\/style>/.exec(deck.html)?.[1] ?? '';
    for (const rule of css.match(/@font-face \{[^}]*\}/g) ?? []) rules.add(rule);
  }
  return [...rules].join('\n');
}

const RULES = {
  L01: 'text overflows its box',
  L02: 'off the slide',
  L03: 'text in the margin',
  L04: 'text under 24px',
  L05: 'low contrast',
  L06: 'texts overlap',
  L07: 'low coverage',
  L13: 'too much text',
  L16: 'no visual element',
};

function chips(findings) {
  if (!findings) return '';
  const byRule = new Map();
  for (const finding of findings) byRule.set(finding.rule, finding);
  if (byRule.size === 0) return '<span class="chip ok">lint: clean</span>';
  return [...byRule.values()]
    .map(
      (f) =>
        `<span class="chip ${f.severity}" title="${escape(f.message)}">${f.rule} ${RULES[f.rule] ?? ''}</span>`,
    )
    .join('');
}

const percent = (share) => `${Math.round(share * 100)}%`;

const PAGE = `
:root { color-scheme: dark; --k: 0.229167; }
* { box-sizing: border-box; }
html { background: #0e1014; color: #e7e9ee; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
body { margin: 0; padding: 32px 32px 96px; }
.page-title { font-size: 26px; margin: 0 0 4px; }
.deck-title { font-size: 20px; margin: 56px 0 4px; }
.note { margin: 0 0 8px; color: #a9aebb; max-width: 1100px; }
.deck-title a, .summary a { color: inherit; }
.summary { border-collapse: collapse; margin: 16px 0 0; }
.summary th, .summary td { padding: 6px 18px 6px 0; text-align: left; border-bottom: 1px solid #262a33; font-weight: 400; }
.summary th { color: #a9aebb; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(892px, 1fr)); gap: 28px 24px; margin-top: 20px; }
.pair { display: grid; grid-template-columns: 440px 440px; gap: 8px 12px; }
.frame { position: relative; width: 440px; height: 247.5px; overflow: hidden; border-radius: 6px; background: #000; display: block; }
.stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; transform: scale(var(--k)); }
.label { font-size: 13px; color: #a9aebb; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-height: 22px; }
.label b { color: #e7e9ee; font-weight: 600; }
.chip { font-size: 12px; padding: 1px 7px; border-radius: 10px; background: #262a33; white-space: nowrap; }
.chip.error { background: #5b1f24; color: #ffc9cd; }
.chip.warning { background: #4a3a14; color: #ffe2a1; }
.chip.ok { background: #173a2a; color: #b5f0cf; }
.chip.edit { background: #1c2f4d; color: #c7dcff; }
.none { display: flex; align-items: center; justify-content: center; color: #6b7280; background: #15181e; font-size: 13px; }
`;

export function writeIndex() {
  const decks = deckFiles().map(readDeck);
  const converted = readJson('reference-report.json');
  const rebuilt = readJson('rebuilt-report.json');

  const styles = decks
    .map((deck) => scoped(deck.theme, `.${deckClass(deck.id)}`) + scoped(deck.deck, `.${deckClass(deck.id)}`))
    .join('\n');

  const rows = [];
  const sections = decks.map((deck) => {
    const measured = converted?.decks.find((d) => d.id === deck.id);
    const template = rebuilt?.rebuilt[`${deck.template}.${deck.lang}`];
    const cells = deck.slides.map((slide, i) => {
      const m = measured?.slides.find((s) => s.id === slide.id);
      const twin = template?.[i];
      const original = `<a class="frame" href="${deck.file}#${slide.id}" dir="${deck.dir}" lang="${deck.lang}"><div class="stage">${slide.html}</div></a>`;
      const made = twin
        ? `<div class="frame"><div class="stage">${twin.html}</div></div>`
        : '<div class="frame none">not rebuilt yet</div>';
      return `<div class="pair">
${original}
${made}
<div class="label"><b>${slide.id}</b> ${escape(slide.archetype ?? '')}${m ? ` <span class="chip edit">editable ${percent(m.editability)}</span>${chips(m.lint)}` : ''}</div>
<div class="label">from the template${twin ? ` ${chips(twin.lint)}` : ''}</div>
</div>`;
    });
    if (measured) {
      const shares = measured.slides.map((s) => s.editability);
      rows.push(
        `<tr><td><a href="${deck.file}">${escape(deck.id)}</a></td><td>${deck.slides.length}</td><td>${percent(shares.reduce((a, b) => a + b, 0) / shares.length)}</td><td>${shares.filter((s) => s === 1).length} of ${shares.length}</td><td>${measured.slides.filter((s) => s.lint.some((f) => f.severity === 'error')).length}</td><td>${template ? template.filter((s) => s.lint.some((f) => f.severity === 'error')).length : ''}</td></tr>`,
      );
    }
    return `<section class="${deckClass(deck.id)}">
<h2 class="deck-title"><a href="${deck.file}">${escape(deck.title)}</a></h2>
<p class="note">${deck.slides.length} slides, ${deck.lang === 'he' ? 'Hebrew, right-to-left' : 'English, left-to-right'}. Left: the slide as written in HTML (click it to open the deck there). Right: the same slide rebuilt from the layouts of the <b>${deck.template}</b> template.</p>
<div class="grid">
${cells.join('\n')}
</div>
</section>`;
  });

  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slidr reference decks</title>
<style>${fonts(decks)}</style>
<style>${PAGE}</style>
<style>${styles}</style>
</head>
<body>
<h1 class="page-title">Slidr reference decks</h1>
<p class="note">Every slide of every deck, as live HTML, each next to the same slide rebuilt from the template that was derived from the deck. The gap between the two is what a theme and fourteen layouts cannot carry. Generated by <code>scripts/build.mjs</code>; the numbers come from the last run of <code>pnpm test:browser</code>.</p>
${
  rows.length
    ? `<table class="summary"><tr><th>Deck</th><th>Slides</th><th>Editable after conversion</th><th>Slides fully editable</th><th>Slides with a lint error</th><th>Rebuilt slides with a lint error</th></tr>${rows.join('')}</table>`
    : '<p class="note">No measurements yet: run <code>pnpm test:browser</code>, then this script again.</p>'
}
${sections.join('\n')}
</body>
</html>
`;
  writeFileSync(join(root, 'index.html'), html);
  return `index.html: ${decks.length} decks${converted ? '' : ', no conversion report'}${rebuilt ? '' : ', no rebuilt report'}`;
}
