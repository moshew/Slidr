// Runs the import test set (SPEC 13.5), one file after another, in the app this working tree
// runs, and prints one line per file. Each run is run-import.mjs; its JSON lands in
// test-results/import/runs/<name>-<model>.json.
//   node scripts/import/run-set.mjs [--model sonnet] [--only name,name]
// The four files of examples/ are the user's and are read from the main checkout; the two
// third-party builds are in this working tree's ignored examples/ (see e2e/import-set/README.md).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};
const model = flag('model') ?? 'haiku';
const only = flag('only')?.split(',');

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const USER = 'C:/Users/Moshe/Documents/Projects/Slidr/examples';
const BUILT = here('../../../../examples');
const SET = here('../../e2e/import-set');

/** `confirm`: the agent is asked to show its plan first, and the script approves it. */
const FILES = [
  { name: 'handwritten', path: `${SET}/handwritten.html`, slides: 6 },
  { name: 'ecix-client', path: `${USER}/ecix-client-future 4.html`, slides: 11 },
  { name: 'dapflow', path: `${USER}/dapflow.html`, slides: 8 },
  { name: 'ecix-ng', path: `${USER}/E-CIX NG - standalone.html`, slides: 35 },
  { name: 'reveal', path: `${BUILT}/reveal-demo.html`, slides: 8 },
  { name: 'marp', path: `${BUILT}/marp-demo.html`, slides: 7 },
  { name: 'canvas-animations', path: `${SET}/canvas-animations.html`, slides: 6 },
  { name: 'long-page', path: `${SET}/long-page.html`, slides: null, confirm: true },
  { name: 'photo-tour', path: `${SET}/photo-tour.html`, slides: 7 },
  { name: 'devops', path: `${USER}/devops.html`, slides: 9 },
];

const outDir = here('../../test-results/import/runs');
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const file of FILES) {
  if (only && !only.includes(file.name)) continue;
  if (!existsSync(file.path)) {
    console.log(`${file.name}: missing (${file.path})`);
    continue;
  }
  const out = `${outDir}/${file.name}-${model}.json`;
  const run = spawnSync(
    process.execPath,
    [
      here('./run-import.mjs'),
      file.path,
      out,
      '--model',
      model,
      ...(file.confirm ? ['--confirm'] : []),
    ],
    { encoding: 'utf8', timeout: 30 * 60 * 1000 },
  );
  if (!existsSync(out) || run.status !== 0) {
    console.log(`${file.name}: the run failed\n${(run.stdout + run.stderr).slice(-600)}`);
    continue;
  }
  const { report, turns, deck } = JSON.parse(readFileSync(out, 'utf8'));
  total += report.costUsd ?? 0;
  const percent = (share) => (share === null ? '-' : `${Math.round(share * 100)}%`);
  console.log(
    [
      file.name.padEnd(18),
      `slides ${report.rows.length}/${file.slides ?? '?'} (deck ${deck.slides.length}, rebuilt ${report.rows.length - (report.measured ?? report.rows.length)})`,
      `faithful ${report.faithful}`,
      `approx ${report.approximate}`,
      `editable ${percent(report.medianEditability)}`,
      `text ${percent(report.medianTextEditability)}`,
      `whole-html ${report.wholeHtml}`,
      `${Math.round(report.durationMs / 1000)}s`,
      `$${(report.costUsd ?? 0).toFixed(2)}`,
      `turns ${report.turns}`,
      `blocked ${report.blocked.length}`,
      `fonts ${deck.assets.font ?? 0}`,
      turns.at(-1)?.outcome ?? '',
      turns.at(-1)?.problem ? JSON.stringify(turns.at(-1).problem).slice(0, 120) : '',
    ].join(' | '),
  );
}
console.log(`total cost as the CLI reported it: $${total.toFixed(2)}`);
