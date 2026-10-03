import { readFileSync } from 'node:fs';
const name = process.argv[2] && process.argv[2] !== 'brief' ? `.${process.argv[2]}` : '';
const r = JSON.parse(readFileSync(`apps/desktop/test-results/templates/reference-report${name}.json`, 'utf8'));
const brief = process.argv.includes('brief');
for (const d of r.decks) {
  let sum = 0;
  for (const s of d.slides) {
    sum += s.editability;
    console.log(d.id, s.id, s.archetype.padEnd(10), (s.editability * 100).toFixed(0).padStart(4) + '%', JSON.stringify(s.elements), s.ms + 'ms');
    if (!brief) for (const n of s.notes) console.log('     note:', n.slice(0, 220));
    for (const l of s.lint) console.log('     ', l.rule, l.severity, brief ? '' : l.message.slice(0, 200));
  }
  console.log(d.id, 'average', ((sum / d.slides.length) * 100).toFixed(1) + '%');
}
