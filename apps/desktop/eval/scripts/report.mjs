// The evaluation set's scoring script (WG11-T13, QG-07): turns a run of `run.mjs` into a review
// page with every slide of every deck, and a summary of what was measured. The visual score is
// the user's: the page takes a score from 1 to 5 for each deck and saves it to `scores.json` in
// the run's folder, which the summary reads.
//
//   pnpm --filter @slidr/desktop eval:review                  the latest run: serve its page
//   pnpm --filter @slidr/desktop eval:review -- <run>         a run by folder name
//   pnpm --filter @slidr/desktop eval:review -- --summary <run> [<run> …]   print, side by side
//
// The page saves through this script's own little server (http://localhost:1492, or the port in
// SLIDR_EVAL_REVIEW_PORT, for a worktree whose page is open beside another's). Opened as a file
// it still shows everything, and offers the scores as a download instead.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const OUT_ROOT = join(APP_DIR, 'test-results', 'eval');
const PORT = Number(process.env.SLIDR_EVAL_REVIEW_PORT ?? 1492);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const percent = (part, whole) => (whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`);
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

/** The results of a run, in the order of the set. */
function readRun(runDir) {
  const results = readdirSync(runDir)
    .filter((name) => existsSync(join(runDir, name, 'result.json')))
    .sort()
    .map((name) => readJson(join(runDir, name, 'result.json')));
  const scoresFile = join(runDir, 'scores.json');
  const scores = existsSync(scoresFile) ? (readJson(scoresFile).scores ?? {}) : {};
  return { results, scores };
}

/** One request's row of the summary. */
function row(result, scores) {
  const { score, request } = result;
  const written = score.slides.filter((slide) => slide.cleanFirstWrite !== null);
  return {
    id: request.id,
    lang: request.lang,
    // The template the request's deck started on, when the run gave it one.
    template: result.template ?? null,
    // How often the runner said "go ahead": the agent proposed an outline, or asked.
    approvals: result.approvals ?? 0,
    outcome: result.outcome,
    slides: score.slides.length,
    errors: score.findings.error,
    warnings: score.findings.warning,
    byRule: score.findings.byRule,
    judged: score.gate.judged,
    passedFirstRound: score.gate.passedFirstRound,
    gateRounds: score.gate.rounds.length,
    gateRemaining: score.gate.remaining,
    editability: score.editability,
    titleAndBullets: score.titleAndBullets.length,
    emoji: score.emoji.length,
    htmlWrites: score.conversions.writes,
    partlyHtml: score.conversions.partlyHtml,
    wholeSlideHtml: score.conversions.wholeSlideHtml,
    cleanFirstWrite: written.filter((slide) => slide.cleanFirstWrite).length,
    written: written.length,
    toolErrors: score.toolErrors.length,
    turns: score.turns,
    seconds: Math.round(result.wallMs / 1000),
    costUsd: score.costUsd,
    visual: scores[request.id]?.score ?? null,
  };
}

export function summarize(runDir) {
  const { results, scores } = readRun(runDir);
  const rows = results.map((result) => row(result, scores));
  const scored = rows.filter((r) => r.visual !== null);
  const slides = sum(rows, (r) => r.slides);
  return {
    run: runDir.split(sep).at(-1),
    model: results[0]?.model ?? null,
    images: results[0]?.images ?? null,
    rows,
    totals: {
      requests: rows.length,
      slides,
      errors: sum(rows, (r) => r.errors),
      warnings: sum(rows, (r) => r.warnings),
      judged: sum(rows, (r) => r.judged),
      passedFirstRound: sum(rows, (r) => r.passedFirstRound),
      gateRemaining: sum(rows, (r) => r.gateRemaining),
      editability: slides === 0 ? 1 : sum(rows, (r) => r.editability * r.slides) / slides,
      titleAndBullets: sum(rows, (r) => r.titleAndBullets),
      emoji: sum(rows, (r) => r.emoji),
      approvals: sum(rows, (r) => r.approvals),
      htmlWrites: sum(rows, (r) => r.htmlWrites),
      partlyHtml: sum(rows, (r) => r.partlyHtml),
      wholeSlideHtml: sum(rows, (r) => r.wholeSlideHtml),
      cleanFirstWrite: sum(rows, (r) => r.cleanFirstWrite),
      written: sum(rows, (r) => r.written),
      toolErrors: sum(rows, (r) => r.toolErrors),
      seconds: sum(rows, (r) => r.seconds),
      costUsd: sum(rows, (r) => r.costUsd ?? 0),
      // The user's, and only once they have given it: never filled in by the script.
      scored: scored.length,
      visual: scored.length === 0 ? null : sum(scored, (r) => r.visual) / scored.length,
    },
  };
}

function summaryText(summary) {
  const pad = (value, width) => String(value).padEnd(width);
  const head = [
    pad('request', 24),
    pad('tmpl', 7),
    pad('slides', 7),
    pad('err', 4),
    pad('warn', 5),
    pad('gate 1st', 9),
    pad('clean 1st', 10),
    pad('edit', 6),
    pad('t+b', 4),
    pad('emoji', 6),
    pad('asked', 6),
    pad('sec', 6),
    pad('usd', 6),
    'visual',
  ].join('');
  const line = (r) =>
    [
      pad(r.id, 24),
      pad(r.template ?? '–', 7),
      pad(r.slides, 7),
      pad(r.errors, 4),
      pad(r.warnings, 5),
      pad(`${r.passedFirstRound}/${r.judged}`, 9),
      pad(`${r.cleanFirstWrite}/${r.written}`, 10),
      pad(percent(r.editability, 1), 6),
      pad(r.titleAndBullets, 4),
      pad(r.emoji, 6),
      pad(r.approvals, 6),
      pad(r.seconds, 6),
      pad((r.costUsd ?? 0).toFixed(2), 6),
      r.visual ?? '–',
    ].join('');
  const t = summary.totals;
  return [
    `${summary.run} (${summary.model}, images: ${summary.images})`,
    head,
    ...summary.rows.map(line),
    line({
      id: 'total',
      slides: t.slides,
      errors: t.errors,
      warnings: t.warnings,
      passedFirstRound: t.passedFirstRound,
      judged: t.judged,
      cleanFirstWrite: t.cleanFirstWrite,
      written: t.written,
      editability: t.editability,
      titleAndBullets: t.titleAndBullets,
      emoji: t.emoji,
      approvals: t.approvals,
      seconds: t.seconds,
      costUsd: t.costUsd,
      visual:
        t.visual === null ? 'not scored yet' : `${t.visual.toFixed(2)} (${t.scored}/${t.requests})`,
    }),
  ].join('\n');
}

const chip = (label, value, bad = false) =>
  `<span class="chip${bad ? ' bad' : ''}"><b>${escapeHtml(value)}</b> ${escapeHtml(label)}</span>`;

function requestSection(result, runDir) {
  const { request, score } = result;
  const r = row(result, {});
  const rules = Object.entries(score.findings.byRule)
    .map(([rule, count]) => `${rule}×${count}`)
    .join(' ');
  const sentBack = score.gate.rounds
    .map((round) => {
      const what = [
        ...(round.unseen.length > 0 ? [`${round.unseen.length} שקפים שלא נצפו`] : []),
        ...round.findings.map((finding) => finding.rule),
      ].join(', ');
      return `סבב ${round.round}: ${what}`;
    })
    .join(' · ');
  const slides = score.slides
    .map((slide) => {
      const file = `${request.id}/slides/${String(slide.number).padStart(2, '0')}.png`;
      if (!existsSync(join(runDir, file))) return '';
      const notes = [
        slide.archetype,
        ...slide.findings.map((finding) => finding.rule),
        ...(slide.editability < 1 ? [`עריכוּת ${percent(slide.editability, 1)}`] : []),
        ...(slide.titleAndBullets ? ['כותרת ותבליטים על רקע ריק'] : []),
        ...(slide.emoji ? ['emoji'] : []),
      ].filter(Boolean);
      const titles = slide.findings.map((f) => `${f.rule}: ${f.message}`).join('\n');
      return `<figure>
        <a href="${file}" target="_blank"><img loading="lazy" src="${file}" alt=""></a>
        <figcaption title="${escapeHtml(titles)}"><b>${slide.number}</b> ${escapeHtml(notes.join(' · '))}</figcaption>
      </figure>`;
    })
    .join('\n');
  return `<section id="${request.id}" data-request="${request.id}">
  <header>
    <h2>${escapeHtml(request.id)} <small>${escapeHtml(request.kind)} · ${escapeHtml(request.lang)}${result.template ? ` · תבנית: ${escapeHtml(result.template)}` : ''}</small></h2>
    <div class="score" role="radiogroup" aria-label="ציון חזותי">
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="score-${request.id}" value="${n}"><span>${n}</span></label>`).join('')}
    </div>
  </header>
  <details><summary>הבקשה</summary><pre dir="auto">${escapeHtml(request.prompt)}</pre></details>
  <p class="chips">
    ${chip('שקפים', r.slides)}
    ${chip('שגיאות lint', r.errors, r.errors > 0)}
    ${chip('אזהרות', r.warnings)}
    ${rules ? `<span class="chip">${escapeHtml(rules)}</span>` : ''}
    ${chip('עברו את השער בסבב הראשון', `${r.passedFirstRound}/${r.judged}`, r.passedFirstRound < r.judged)}
    ${chip('שקפים נקיים בכתיבה הראשונה', `${r.cleanFirstWrite}/${r.written}`)}
    ${chip('עריכוּת', percent(r.editability, 1), r.editability < 0.95)}
    ${chip('כותרת ותבליטים על רקע ריק', r.titleAndBullets, r.titleAndBullets > 0)}
    ${chip('שקפים עם emoji', r.emoji, r.emoji > 0)}
    ${chip('תורות', r.turns)}
    ${chip('שניות', r.seconds)}
    ${chip('עלות', `$${(r.costUsd ?? 0).toFixed(2)}`)}
    ${result.outcome === 'completed' ? '' : chip('סיום', result.outcome, true)}
  </p>
  ${sentBack ? `<p class="gate">השער החזיר: ${escapeHtml(sentBack)}</p>` : ''}
  <div class="slides">${slides}</div>
  <textarea placeholder="הערה (לא חובה)" data-note="${request.id}" dir="auto"></textarea>
</section>`;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --line: #dfe3ea; --text: #15171a;
  --muted: #5f6672; --accent: #2f5bea; --bad: #c62828; }
@media (prefers-color-scheme: dark) { :root { --bg: #14161a; --card: #1d2026; --line: #30343c;
  --text: #eef0f3; --muted: #9aa3b0; --accent: #7d9bff; --bad: #ff7b72; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
main { max-width: 1500px; margin: 0 auto; padding: 24px 16px 96px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.lead { color: var(--muted); margin: 0 0 20px; max-width: 80ch; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px; margin-bottom: 20px; }
section header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  justify-content: space-between; }
h2 { font-size: 17px; margin: 0; }
h2 small { color: var(--muted); font-weight: 400; margin-inline-start: 8px; }
.score { display: flex; gap: 6px; }
.score label { cursor: pointer; }
.score input { position: absolute; opacity: 0; }
.score span { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid var(--line); font-weight: 600; }
.score input:checked + span { background: var(--accent); border-color: var(--accent); color: #fff; }
.score input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
details { margin: 10px 0; }
summary { cursor: pointer; color: var(--muted); }
pre { white-space: pre-wrap; font: inherit; margin: 8px 0 0; padding: 12px; background: var(--bg);
  border-radius: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.chip { border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 13px;
  color: var(--muted); }
.chip b { color: var(--text); font-variant-numeric: tabular-nums; }
.chip.bad, .chip.bad b { color: var(--bad); border-color: var(--bad); }
.gate { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.slides { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr));
  gap: 12px; }
figure { margin: 0; }
figure img { display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--line);
  border-radius: 6px; background: #fff; }
figcaption { font-size: 12px; color: var(--muted); padding-top: 4px; }
textarea { width: 100%; margin-top: 12px; min-height: 44px; padding: 8px 10px; font: inherit;
  color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; }
.bar { position: fixed; inset-inline: 0; bottom: 0; background: var(--card);
  border-top: 1px solid var(--line); padding: 10px 16px; display: flex; gap: 16px;
  align-items: center; justify-content: center; flex-wrap: wrap; }
.bar b { font-size: 18px; font-variant-numeric: tabular-nums; }
.bar button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg); color: inherit; cursor: pointer; }
`;

// The page's own script. It reads the scores that were saved with the run, and writes each
// change back: to the server when the page came from it, otherwise to a download.
const SCRIPT = `
const state = { scores: __SCORES__ };
const served = location.protocol.startsWith('http');
const status = document.querySelector('#status');
function show() {
  const given = Object.values(state.scores).map((s) => s.score).filter(Boolean);
  const mean = given.length ? (given.reduce((a, b) => a + b, 0) / given.length).toFixed(2) : '–';
  document.querySelector('#mean').textContent = mean;
  document.querySelector('#count').textContent = given.length + ' / ' + __COUNT__;
}
async function save() {
  show();
  if (!served) { status.textContent = 'הדף נפתח כקובץ: הורד את הציונים ושמור אותם בתיקיית ההרצה'; return; }
  try {
    const response = await fetch('scores', { method: 'PUT', body: JSON.stringify(state) });
    status.textContent = response.ok ? 'נשמר' : 'השמירה נכשלה';
  } catch { status.textContent = 'השמירה נכשלה: השרת לא רץ'; }
}
for (const section of document.querySelectorAll('section[data-request]')) {
  const id = section.dataset.request;
  const saved = state.scores[id] ?? {};
  const note = section.querySelector('textarea');
  note.value = saved.note ?? '';
  for (const radio of section.querySelectorAll('input[type=radio]')) {
    radio.checked = Number(radio.value) === saved.score;
    radio.addEventListener('change', () => {
      state.scores[id] = { ...state.scores[id], score: Number(radio.value) };
      save();
    });
  }
  note.addEventListener('change', () => {
    state.scores[id] = { ...state.scores[id], note: note.value };
    save();
  });
}
document.querySelector('#download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  link.download = 'scores.json';
  link.click();
});
show();
`;

function reviewHtml(runDir) {
  const { results, scores } = readRun(runDir);
  const summary = summarize(runDir);
  const t = summary.totals;
  const script = SCRIPT.replace(
    '__SCORES__',
    JSON.stringify(scores).replace(/</g, '\\u003c'),
  ).replace('__COUNT__', String(results.length));
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>סט ההערכה · ${escapeHtml(summary.run)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>סט ההערכה · <span dir="ltr">${escapeHtml(summary.run)}</span></h1>
  <p class="lead">כל שקף של כל מצגת שה-Agent בנה בהרצה הזאת (מודל: ${escapeHtml(summary.model ?? '')}, תמונות: ${escapeHtml(summary.images ?? '')}). תן לכל מצגת ציון חזותי מ-1 עד 5; הציון נשמר מיד. לחיצה על שקף פותחת אותו בגודל מלא, וריחוף על השורה שמתחתיו מציג את ממצאי ה-lint במלואם.</p>
  <p class="chips">
    ${chip('מצגות', t.requests)}
    ${chip('שקפים', t.slides)}
    ${chip('שגיאות lint', t.errors, t.errors > 0)}
    ${chip('אזהרות', t.warnings)}
    ${chip('עברו את השער בסבב הראשון', `${t.passedFirstRound}/${t.judged} (${percent(t.passedFirstRound, t.judged)})`)}
    ${chip('שקפים נקיים בכתיבה הראשונה', `${t.cleanFirstWrite}/${t.written}`)}
    ${chip('עריכוּת', percent(t.editability, 1))}
    ${chip('כותרת ותבליטים על רקע ריק', t.titleAndBullets, t.titleAndBullets > 0)}
    ${chip('שקפים עם emoji', t.emoji, t.emoji > 0)}
    ${chip('דקות', Math.round(t.seconds / 60))}
    ${chip('עלות', `$${t.costUsd.toFixed(2)}`)}
  </p>
  ${results.map((result) => requestSection(result, runDir)).join('\n')}
</main>
<div class="bar">
  <span>ציון חזותי ממוצע: <b id="mean">–</b></span>
  <span>דורגו: <b id="count"></b></span>
  <span id="status"></span>
  <button id="download" type="button">הורד scores.json</button>
</div>
<script>${script}</script>
</body>
</html>
`;
}

/** Writes the review page and the summary of a run into its folder. */
export function writeReport(runDir) {
  const reviewPage = join(runDir, 'review.html');
  writeFileSync(reviewPage, reviewHtml(runDir));
  const summary = summarize(runDir);
  writeFileSync(join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(runDir, 'summary.txt'), `${summaryText(summary)}\n`);
  return { reviewPage, summary };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** Serves a run's folder, and keeps the scores the page sends. */
function serve(runDir) {
  const root = resolve(runDir);
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (request.method === 'PUT' && path === '/scores') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        try {
          const { scores } = JSON.parse(body);
          const file = join(root, 'scores.json');
          writeFileSync(file, `${JSON.stringify({ scores, updatedAt: new Date() }, null, 2)}\n`);
          writeReport(root);
          response.writeHead(204).end();
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    if (path === '/') {
      // Written anew for every visit, so the page opens with the scores as they are on disk.
      response.writeHead(200, { 'Content-Type': TYPES['.html'] });
      response.end(reviewHtml(root));
      return;
    }
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`review page: http://localhost:${PORT}/  (Ctrl+C to stop)`);
  });
}

function latestRun() {
  const runs = existsSync(OUT_ROOT)
    ? readdirSync(OUT_ROOT).filter((name) => existsSync(join(OUT_ROOT, name, 'run.json')))
    : [];
  const latest = runs.sort().at(-1);
  if (!latest) throw new Error(`No run under ${OUT_ROOT}.`);
  return latest;
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const summaryOnly = args[0] === '--summary';
  const runs = (summaryOnly ? args.slice(1) : args.slice(0, 1)).map((name) => join(OUT_ROOT, name));
  if (runs.length === 0) runs.push(join(OUT_ROOT, latestRun()));
  for (const runDir of runs) {
    if (!existsSync(runDir)) throw new Error(`No run at ${runDir}.`);
    console.log(`${summaryText(writeReport(runDir).summary)}\n`);
  }
  if (!summaryOnly) serve(runs[0]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
