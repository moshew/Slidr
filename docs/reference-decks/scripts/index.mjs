// index.html: the built-in templates side by side, and every slide of every reference deck next
// to the same slide rebuilt from its template, with what the conversion engine and the lint said
// about it. The slides are live HTML, inlined and scaled; nothing here is a picture of a slide.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckFiles, readDeck, root } from './decks.mjs';
import { ALL_WEIGHTS, fontFaces } from './fonts.mjs';

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

/**
 * The embedded font rules of every deck and of every template, each once. A deck carries its
 * own; a template's are read off the slides the renderer drew, which name their fonts in the
 * theme variables on the slide's root.
 */
function fonts(decks, rebuilt) {
  const rules = new Set();
  for (const deck of decks) {
    const css = /<style data-part="fonts">([\s\S]*?)<\/style>/.exec(deck.html)?.[1] ?? '';
    for (const rule of css.match(/@font-face \{[^}]*\}/g) ?? []) rules.add(rule);
  }
  for (const slides of Object.values(rebuilt ?? {})) {
    const root = (slides[0]?.html ?? '').replace(/&quot;/g, '"');
    const stacks = root.match(/--font-(?:heading|body):\s*[^;]+;/g) ?? [];
    const css = fontFaces(stacks.join('\n'), ALL_WEIGHTS);
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
  L08: 'leans to one side',
  L09: 'nearly aligned',
  L10: 'uneven gaps',
  L11: 'off the theme',
  L12: 'picture enlarged',
  L13: 'too much text',
  L14: 'three alike in a row',
  L15: 'direction against the text',
  L16: 'no visual element',
  L17: 'empty band at the bottom',
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

/** A random id of the model (`newId`): a prefix, `_`, and eight characters of base 36. */
const RANDOM_ID = /\b(s|e|a|l|p)_[0-9a-z]{8}\b/g;

/**
 * The slides rebuilt from a template, with the random ids the model gave their slides and
 * elements on that run replaced, page-wide and in the order they first appear, by numbered ones.
 * An id that repeats (a layout's mark on every slide) keeps one name, so the page reads the
 * same; and a rebuild of the page from the same templates writes the same file, where each run
 * of `pnpm test:browser` used to change dozens of its lines.
 */
export function stableIds(rebuilt) {
  if (!rebuilt) return rebuilt;
  const names = new Map();
  const rename = (html) =>
    html.replace(RANDOM_ID, (id, prefix) => {
      if (!names.has(id)) names.set(id, `${prefix}_${String(names.size + 1).padStart(8, '0')}`);
      return names.get(id);
    });
  return Object.fromEntries(
    Object.entries(rebuilt).map(([key, slides]) => [
      key,
      slides.map((slide) => ({
        ...slide,
        html: rename(slide.html),
        // A finding may name an element in its message, which a chip shows.
        lint: (slide.lint ?? []).map((f) => ({ ...f, message: rename(String(f.message ?? '')) })),
      })),
    ]),
  );
}

/** The archetypes in the order of the model, with the name the page gives each row. */
const ARCHETYPES = [
  ['hero', 'Opening'],
  ['section', 'Section divider'],
  ['bigNumber', 'Big number'],
  ['quote', 'Quote'],
  ['textImage', 'Text and image'],
  ['fullImage', 'Full image'],
  ['cards', 'Cards'],
  ['timeline', 'Timeline'],
  ['process', 'Process'],
  ['comparison', 'Comparison'],
  ['chart', 'Chart'],
  ['table', 'Table'],
  ['team', 'Team'],
  ['closing', 'Closing'],
];

const LANGS = [
  ['he', 'Hebrew, right-to-left'],
  ['en', 'English, left-to-right'],
];

const PAGE = `
:root { color-scheme: dark; --k: 0.229167; --m: 0.166667; }
* { box-sizing: border-box; }
html { background: #0e1014; color: #e7e9ee; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
body { margin: 0; padding: 32px 32px 96px; }
.page-title { font-size: 26px; margin: 0 0 4px; }
.deck-title { font-size: 20px; margin: 56px 0 4px; }
.sub-title { font-size: 16px; margin: 28px 0 4px; color: #c9cdd6; }
.note { margin: 0 0 8px; color: #a9aebb; max-width: 1100px; }
.deck-title a, .summary a { color: inherit; }
.summary { border-collapse: collapse; margin: 16px 0 0; }
.summary th, .summary td { padding: 6px 18px 6px 0; text-align: left; border-bottom: 1px solid #262a33; font-weight: 400; }
.summary th { color: #a9aebb; }
.summary td.bad { color: #ffc9cd; }
.summary td.zero { color: #6b7280; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(892px, 1fr)); gap: 28px 24px; margin-top: 20px; }
.pair { display: grid; grid-template-columns: 440px 440px; gap: 8px 12px; }
.frame { position: relative; width: 440px; height: 247.5px; overflow: hidden; border-radius: 6px; background: #000; display: block; }
.stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; transform: scale(var(--k)); }
.label { font-size: 13px; color: #a9aebb; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-height: 22px; }
.label b { color: #e7e9ee; font-weight: 600; }
.chip { font-size: 12px; padding: 1px 7px; border-radius: 10px; background: #262a33; white-space: nowrap; }
.chip.error { background: #5b1f24; color: #ffc9cd; }
.chip.warning { background: #4a3a14; color: #ffe2a1; }
.chip.info { background: #262a33; color: #c9cdd6; }
.chip.ok { background: #173a2a; color: #b5f0cf; }
.chip.edit { background: #1c2f4d; color: #c7dcff; }
.none { display: flex; align-items: center; justify-content: center; color: #6b7280; background: #15181e; font-size: 13px; }
.matrix-wrap { overflow-x: auto; margin-top: 16px; padding-bottom: 12px; }
.matrix { display: grid; gap: 10px 12px; align-items: start; width: max-content; }
.matrix .head { font-size: 14px; font-weight: 600; color: #e7e9ee; }
.matrix .head small { display: block; font-weight: 400; color: #a9aebb; max-width: 320px; }
.matrix .row { font-size: 13px; color: #a9aebb; position: sticky; left: 0; background: #0e1014; padding: 4px 8px 4px 0; z-index: 1; align-self: stretch; }
.mini { position: relative; width: 320px; height: 180px; overflow: hidden; border-radius: 5px; background: #000; }
.mini .stage { transform: scale(var(--m)); }
.cell { display: flex; flex-direction: column; gap: 4px; }
.cell .label { min-height: 0; }
`;

/** The templates of the report, in the order the library shows them. */
const templatesOf = (rebuilt) =>
  [...new Set(Object.keys(rebuilt ?? {}).map((key) => key.split('.')[0]))];

/**
 * One language of the matrix: a row for each archetype, a column for each template, each cell
 * the first sample slide of that archetype as the renderer drew it.
 */
function matrix(rebuilt, templates, lang) {
  const cells = [`<div class="row"></div>`];
  for (const id of templates) cells.push(`<div class="head">${escape(id)}</div>`);
  for (const [archetype, name] of ARCHETYPES) {
    cells.push(`<div class="row">${name}</div>`);
    for (const id of templates) {
      const slide = rebuilt[`${id}.${lang}`]?.find((s) => s.archetype === archetype);
      if (!slide) {
        cells.push('<div class="mini none">no slide</div>');
        continue;
      }
      // Only what asks to be looked at: a clean slide carries no chip in a grid of 140.
      const marks = slide.lint.filter((f) => f.severity !== 'info');
      cells.push(
        `<div class="cell"><div class="mini"><div class="stage">${slide.html}</div></div>${
          marks.length ? `<div class="label">${chips(marks)}</div>` : ''
        }</div>`,
      );
    }
  }
  return `<div class="matrix-wrap"><div class="matrix" style="grid-template-columns: 120px repeat(${templates.length}, 320px)">
${cells.join('\n')}
</div></div>`;
}

/** What the lint left on each template's own sample, by rule and language. */
function sampleTable(rebuilt, templates) {
  const count = (id, lang, test) =>
    (rebuilt[`${id}.${lang}`] ?? []).reduce((n, slide) => n + slide.lint.filter(test).length, 0);
  const rules = (id) => {
    const seen = new Map();
    for (const [lang] of LANGS) {
      for (const slide of rebuilt[`${id}.${lang}`] ?? []) {
        for (const f of slide.lint) {
          if (f.severity !== 'error') seen.set(f.rule, (seen.get(f.rule) ?? 0) + 1);
        }
      }
    }
    return [...seen].sort().map(([rule, n]) => `${rule} ×${n}`).join(', ');
  };
  const rows = templates.map((id) => {
    const errors = LANGS.reduce((n, [lang]) => n + count(id, lang, (f) => f.severity === 'error'), 0);
    const slides = (rebuilt[`${id}.he`] ?? []).length;
    return `<tr><td>${escape(id)}</td><td>${slides}</td><td class="${errors ? 'bad' : ''}">${errors}</td><td>${escape(rules(id)) || 'none'}</td></tr>`;
  });
  return `<table class="summary"><tr><th>Template</th><th>Sample slides</th><th>Lint errors, both languages</th><th>Warnings and notes, both languages</th></tr>${rows.join('')}</table>`;
}

/** Errors left when a sample deck of one template (rows) moves to another (columns). */
function switchTable(switches, templates) {
  if (!switches?.length) return '';
  const errors = (from, to) =>
    switches
      .filter((s) => s.from === from && s.to === to)
      .reduce((n, s) => n + s.errors.length, 0);
  const head = templates.map((id) => `<th>${escape(id)}</th>`).join('');
  const rows = templates.map((from) => {
    const cells = templates.map((to) => {
      if (from === to) return '<td class="zero">·</td>';
      const n = errors(from, to);
      return `<td class="${n ? 'bad' : 'zero'}">${n}</td>`;
    });
    return `<tr><td>${escape(from)}</td>${cells.join('')}</tr>`;
  });
  return `<h3 class="sub-title">A deck moved from one template to another</h3>
<p class="note">Lint errors left on the sample deck of the template in the row, once it is switched to the template in the column; Hebrew and English together. A switch deletes nothing, so what one template seats and another does not stays where it was.</p>
<table class="summary"><tr><th>from \\ to</th>${head}</tr>${rows.join('')}</table>`;
}

export function writeIndex() {
  const decks = deckFiles().map(readDeck);
  const converted = readJson('reference-report.json');
  const report = readJson('rebuilt-report.json');
  const rebuilt = stableIds(report?.rebuilt);
  const templates = templatesOf(rebuilt);

  const styles = decks
    .map((deck) => scoped(deck.theme, `.${deckClass(deck.id)}`) + scoped(deck.deck, `.${deckClass(deck.id)}`))
    .join('\n');

  const side = rebuilt
    ? `<section class="templates">
<h2 class="deck-title">The ${templates.length} built-in templates, side by side</h2>
<p class="note">A row for each kind of slide, a column for each template: the sample deck of the template, drawn by the app's own renderer from the template's theme and layouts. The first three were derived from the reference decks below; the others were designed as templates, with no reference deck. Scroll sideways. A chip under a slide is a lint warning on the template's own sample.</p>
${sampleTable(rebuilt, templates)}
${switchTable(report.switches, templates)}
${LANGS.map(([lang, name]) => `<h3 class="sub-title">${name}</h3>\n${matrix(rebuilt, templates, lang)}`).join('\n')}
</section>`
    : '<p class="note">No template report yet: run <code>pnpm test:browser</code>, then this script again.</p>';

  const rows = [];
  const sections = decks.map((deck) => {
    const measured = converted?.decks.find((d) => d.id === deck.id);
    const template = rebuilt?.[`${deck.template}.${deck.lang}`];
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
<title>Slidr templates and reference decks</title>
<style>${fonts(decks, rebuilt)}</style>
<style>${PAGE}</style>
<style>${styles}</style>
</head>
<body>
<h1 class="page-title">Slidr templates and reference decks</h1>
<p class="note">First, every built-in template side by side. Then every slide of the three reference decks, as live HTML, each next to the same slide rebuilt from the template that was derived from the deck: the gap between the two is what a theme and fourteen layouts cannot carry. Generated by <code>scripts/build.mjs</code>; the numbers come from the last run of <code>pnpm test:browser</code>.</p>
${side}
<h2 class="deck-title">The reference decks</h2>
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
  return `index.html: ${templates.length} templates, ${decks.length} decks${converted ? '' : ', no conversion report'}${rebuilt ? '' : ', no rebuilt report'}, ${Math.round(html.length / 1024)} kB`;
}
