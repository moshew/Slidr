// Development probe: captures several elements of the file that is loaded in the import window,
// one after another, and prints one line and the engine's notes for each.
//   node scripts/import/captures.mjs "<before, with $n for the number>" "<selector, with $n>" <from> <to>
// For a deck that shows one slide at a time: before = what brings slide $n into view.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [before, selector, from, to] = process.argv.slice(2);
const capture = fileURLToPath(new URL('./capture.mjs', import.meta.url));
for (let n = Number(from); n <= Number(to); n++) {
  const fill = (text) => text.replaceAll('$n', String(n));
  const run = spawnSync(process.execPath, [capture, fill(selector), fill(before)], {
    encoding: 'utf8',
    timeout: 240_000,
  });
  let out;
  try {
    out = JSON.parse(run.stdout);
  } catch {
    console.log(n, (run.stdout + run.stderr).slice(0, 400));
    continue;
  }
  if (out.error) {
    console.log(n, 'error:', out.error.slice(0, 300));
    continue;
  }
  const { guard } = out;
  console.log(
    [
      n,
      guard.faithful ? 'faithful' : 'NOT faithful',
      guard.exact ? 'exact' : 'approx',
      `rounds ${guard.rounds}`,
      guard.wholeSlide ? 'WHOLE HTML' : '',
      `editable ${Math.round(out.editability * 100)}%`,
      `text ${Math.round(out.text * 100)}%`,
      JSON.stringify(out.elements),
      `${out.ms} ms`,
    ]
      .filter(Boolean)
      .join(' | '),
  );
  for (const note of out.notes) console.log('     ', note.slice(0, 180));
}
