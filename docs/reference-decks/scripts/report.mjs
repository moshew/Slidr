// Prints what the last run of the browser tests measured on the reference decks:
//   node docs/reference-decks/scripts/report.mjs [deck] [brief]   one line per slide
//   node docs/reference-decks/scripts/report.mjs summary          one line per deck
// `deck` reads the report of a run that measured that deck alone (VITE_REFERENCE_DECK).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './decks.mjs';

const results = join(root, '..', '..', 'apps', 'desktop', 'test-results', 'templates');
const args = process.argv.slice(2);
const brief = args.includes('brief');
const summary = args.includes('summary');
const deck = args.find((arg) => arg !== 'brief' && arg !== 'summary');
const file = join(results, `reference-report${deck ? `.${deck}` : ''}.json`);
if (!existsSync(file)) {
  console.error(`No report at ${file}: run the browser tests first.`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
const percent = (share) => `${(share * 100).toFixed(share === 1 ? 0 : 1)}%`;

for (const measured of report.decks) {
  const shares = measured.slides.map((slide) => slide.editability);
  const average = shares.reduce((a, b) => a + b, 0) / shares.length;
  if (summary) {
    const rules = new Map();
    for (const slide of measured.slides) {
      for (const rule of new Set(slide.lint.map((finding) => finding.rule))) {
        rules.set(rule, [...(rules.get(rule) ?? []), slide.id]);
      }
    }
    const errors = measured.slides.filter((s) => s.lint.some((f) => f.severity === 'error'));
    console.log(
      `${measured.id}: ${shares.length} slides, ${percent(average)} editable, ${shares.filter((s) => s === 1).length} fully, ${errors.length} with a lint error`,
    );
    for (const [rule, slides] of [...rules].sort()) console.log(`  ${rule}: ${slides.join(' ')}`);
    for (const slide of measured.slides.filter((s) => s.editability < 1)) {
      console.log(
        `  ${slide.id} ${percent(slide.editability)}: ${slide.notes.join(' | ').slice(0, 200)}`,
      );
    }
    continue;
  }
  for (const slide of measured.slides) {
    console.log(
      measured.id,
      slide.id,
      slide.archetype.padEnd(10),
      percent(slide.editability).padStart(5),
      JSON.stringify(slide.elements),
      `${slide.ms}ms`,
    );
    if (!brief) for (const note of slide.notes) console.log('     note:', note.slice(0, 220));
    for (const finding of slide.lint) {
      console.log('     ', finding.rule, finding.severity, brief ? '' : finding.message.slice(0, 200));
    }
  }
  console.log(measured.id, 'average', percent(average));
}
