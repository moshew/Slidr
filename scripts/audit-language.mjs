/**
 * Find non-ASCII letters in repository text without walking dependencies or build output.
 * This is a source audit, not a language detector: unaccented Latin text needs human review.
 * Run `node scripts/audit-language.mjs`, or add `--all` to include justified exceptions.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const all = process.argv.includes('--all');
const json = process.argv.includes('--json');
const decoder = new TextDecoder('utf-8', { fatal: true });

// These files contain actual translations or editable multilingual presentation content.
// Documentation is deliberately not covered by content-directory exceptions.
const groups = [
  ['Translations', /(?:^|\/)i18n\/|\/messages\.ts$/],
  [
    'Multilingual presentation content',
    /^(?:packages\/templates\/src\/authoring\/(?:.*\.(?:ts|html)|tools\/merge-into-library\.mjs)|desktop\/scripts\/(?:frames-magnets\/.*|generate-frames-catalog\.mjs|export-templates\.mjs))$/,
  ],
  [
    'Language, RTL and UI test data',
    /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\.(?:fixture|cases)\.json$|\/(?:fixtures\.[jt]s|tests\.rs)$|^(?:desktop\/(?:e2e|packaged)\/|desktop\/eval\/(?:conversion-cases\/|.*\.json$)|docs\/reference-decks\/scripts\/)|\/fixtures\/)/,
  ],
  ['Recorded harness fixtures', /^desktop\/src-tauri\/src\/harness\/claude_code\/.*\.jsonl$/],
  ['Generated runtime and chart dependencies', /\.generated\.ts$/],
  ['Rendering and bidi experiments', /^spikes\//],
];

// Functional non-English literals outside translation files: keep the reason close to them.
const literals = new Map([
  ['desktop/eval/page.ts', 'Sample Hebrew deck for rewrite evaluations'],
  ['desktop/src/dev/gallery/copy.ts', 'Gallery translations for testing both UI directions'],
  ['desktop/src/dev/runtime/decks.ts', 'Multilingual rendering fixtures'],
  ['desktop/src/controls/FontField.tsx', 'Font samples in each supported script'],
  ['desktop/src/ai/DeckLook.tsx', 'Hebrew font sample'],
  ['desktop/src/fonts/FontsSection.tsx', 'Hebrew font sample'],
  ['desktop/src/templates/TemplateShowroom.tsx', 'Hebrew font sample'],
  ['desktop/src/templates/preload.ts', 'Preload both Hebrew and Latin glyphs'],
  ['desktop/src/templates/samples.ts', 'Recognize untranslated Hebrew sample titles'],
  ['desktop/src/media/icons/search.ts', 'Hebrew normalization and inflection rules'],
  ['desktop/src/find/search.ts', 'Unicode case-folding examples'],
  ['desktop/src/stage/keys.ts', 'Non-English keyboard layout example'],
  ['packages/model/src/languages.ts', 'Native names of supported languages'],
  ['packages/html-import/src/text.ts', 'Measure mixed Hebrew and Latin font metrics'],
  ['packages/html-export/src/fontsMatch.ts', 'Unicode font composition examples'],
  ['packages/renderer/src/extraShapes.ts', 'Translated shape names'],
  ['packages/runtime/src/standalone.ts', 'Translated end-of-show labels in exported decks'],
]);

function hasForeignLetters(text) {
  return (
    /\P{ASCII}/u.test(text) && [...text].some((c) => c.codePointAt(0) > 127 && /\p{L}/u.test(c))
  );
}

function exception(file, line, index, lines) {
  // English technical prose can retain the original spelling of a person's name.
  if (!hasForeignLetters(line.replace(/(?<!\p{L})(?:B\u00e9ziers?|Piti\u00e9)(?!\p{L})/gu, ''))) {
    return 'Proper names in English technical prose';
  }
  // Keep actual historical filenames usable, rather than inventing translated paths.
  if (
    file === 'docs/adr/ADR-099-cards-as-tall-as-what-they-hold.md' &&
    !hasForeignLetters(line.replace(/`(?:slides\/)?[^`]+\.slidr`/g, ''))
  ) {
    return 'Historical deck filenames';
  }
  if (file.endsWith('.md') && !file.startsWith('spikes/')) return null;
  // Rust keeps its Unicode test cases in the same files as production code.
  if (file.endsWith('.rs') && lines.slice(0, index).some((s) => /^#\[cfg\(test\)\]/.test(s))) {
    return 'Rust Unicode and RTL test data';
  }
  // Even in translated/content/test files, comments should be in English. Unicode examples
  // that explain an algorithm are the few explicit exceptions in the table above.
  const comment = /^\s*(?:\/\/|\/\*|\*|#(?!\[)|<!--)/.test(line);
  if (literals.has(file)) return literals.get(file);
  if (comment && !file.startsWith('spikes/')) return null;
  return groups.find(([, pattern]) => pattern.test(file))?.[0] ?? null;
}

const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean),
  ),
].sort();
const findings = [];
const kept = {};
let scanned = 0;
for (const file of files) {
  let source;
  try {
    const bytes = readFileSync(resolve(root, file));
    if (bytes.includes(0)) continue;
    source = decoder.decode(bytes);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error instanceof TypeError) continue;
    throw error;
  }
  scanned++;
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!hasForeignLetters(line)) continue;
    const reason = exception(file, line, index, lines);
    if (reason) kept[reason] = (kept[reason] ?? 0) + 1;
    if (all || !reason) findings.push({ file, line: index + 1, text: line.trim(), reason });
  }
}
if (json) {
  console.log(JSON.stringify({ scanned, kept, findings }, null, 2));
} else {
  for (const item of findings) {
    console.log(`${item.file}:${item.line}: ${item.text}${item.reason ? ` [${item.reason}]` : ''}`);
  }
  console.log(
    `Scanned ${scanned} text files; ${findings.filter((f) => !f.reason).length} lines to review.`,
  );
  for (const [reason, count] of Object.entries(kept)) console.log(`  Kept ${count}: ${reason}`);
}
if (findings.some((item) => !item.reason)) process.exitCode = 1;
