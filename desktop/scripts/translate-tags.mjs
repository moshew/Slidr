// Translate the library's existing search tags into all remaining content languages.
// node desktop/scripts/translate-tags.mjs --from <author-copy> [--languages fr,ja] [--dry-run]
// Uses the signed-in Claude CLI as tag-elements.mjs does. Source tags remain intact. Each
// distinct English phrase is translated once per language, with Hebrew and item context;
// progress is saved after every batch in archive/tag-translations.json for resumable runs.
// The generated tags/<kind>.json files can then be sent by tag-elements.mjs --upload.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`${name} needs a value.`);
  return args[at + 1];
};
// Read the authoritative list without importing model's bundler-only transitive imports.
const model = readFileSync(
  new URL('../../packages/model/src/languages.ts', import.meta.url),
  'utf8',
);
const supported = [
  ...model.match(/CONTENT_LANGUAGES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g),
].map((m) => m[1]);
const languages = [
  ...new Set(
    option('--languages', supported.filter((l) => !['en', 'he'].includes(l)).join(',')).split(','),
  ),
];
for (const lang of languages) {
  if (!supported.includes(lang) || ['en', 'he'].includes(lang))
    throw new Error(`Unsupported translation language: ${lang}`);
}
const media = resolve(
  option('--from', fileURLToPath(new URL('../../../Slidr-media/', import.meta.url))),
);
const jobs = Number(option('--jobs', '4'));
const size = Number(option('--batch', '80'));
if (!Number.isInteger(jobs) || jobs < 1 || !Number.isInteger(size) || size < 1)
  throw new Error('Positive integer --jobs and --batch required.');
const kinds = ['designs', 'cards', 'shapes', 'frames', 'graphics', 'emoji', 'icons'];
const sources = [];
for (const kind of kinds) {
  const path = join(media, 'tags', `${kind}.json`);
  if (existsSync(path)) sources.push({ path, file: JSON.parse(readFileSync(path, 'utf8')) });
}
const managed = join(media, 'elements', 'designs', 'managed.json');
if (existsSync(managed)) {
  const file = JSON.parse(readFileSync(managed, 'utf8'));
  if (file.tags) sources.push({ path: managed, file });
}
const phrases = new Map();
for (const { file } of sources) {
  for (const [key, own] of Object.entries(file.tags ?? {})) {
    if (!Array.isArray(own.en) || own.en.length < 3)
      throw new Error(`${key}: missing English source tags.`);
    for (const phrase of own.en) {
      if (typeof phrase !== 'string') throw new Error(`${key}: invalid source tag.`);
      if (!phrases.has(phrase)) phrases.set(phrase, { phrase, examples: [] });
      const examples = phrases.get(phrase).examples;
      if (examples.length < 2) examples.push({ key, he: own.he });
    }
  }
}
if (!phrases.size)
  throw new Error(`No source tags found in ${media}. Pull the published tags first.`);
const cacheFile = join(media, 'archive', 'tag-translations.json');
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
};
const scriptFor = (lang) => {
  if (lang === 'ja') return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  if (lang === 'ko') return /\p{Script=Hangul}/u;
  if (lang === 'zh-CN') return /\p{Script=Han}/u;
  return new RegExp(`\\p{Script=${new Intl.Locale(lang).maximize().script}}`, 'u');
};
const valid = (text, lang) =>
  typeof text === 'string' &&
  text.length > 0 &&
  text.length <= 40 &&
  text === text.normalize('NFC').replace(/\s+/g, ' ').trim() &&
  text.split(' ').length <= 4 &&
  scriptFor(lang).test(text) &&
  !/\p{Script=Hebrew}/u.test(text);
const tasks = [];
for (const lang of languages) {
  cache[lang] ??= {};
  const missing = [...phrases.values()].filter(({ phrase }) => !valid(cache[lang][phrase], lang));
  console.log(`${lang}: ${missing.length}/${phrases.size} distinct tags need translation`);
  for (let at = 0; at < missing.length; at += size)
    tasks.push({ lang, batch: missing.slice(at, at + size) });
}
if (args.includes('--dry-run')) process.exit(0);

const schema = {
  type: 'object',
  required: ['tags'],
  additionalProperties: false,
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['n', 'text'],
        additionalProperties: false,
        properties: { n: { type: 'integer' }, text: { type: 'string' } },
      },
    },
  },
};
function translate({ lang, batch }) {
  const prompt = `Translate these English search tags of a presentation media library into ${lang}.
Use natural, native search terms, preserving each phrase's meaning, specificity and relevance.
Hebrew tags and item keys are context only. Do not add themes or explain. Return one translation
per numbered phrase. Keep German noun capitalization and all native accents and vowel marks.
Use Simplified Chinese for zh-CN, Brazilian Portuguese for pt-BR. Tags must have 1–4 space-separated
words and at most 40 characters. Never return English as a substitute for a missing translation.
${batch.map((item, n) => JSON.stringify({ n, ...item })).join('\n')}`;
  return new Promise((done, fail) => {
    const child = spawn(
      process.env.CLAUDE_PATH ?? 'claude',
      [
        '-p',
        '--output-format',
        'json',
        '--restricted',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--tools',
        '',
        '--permission-mode',
        'dontAsk',
        '--no-session-persistence',
        '--model',
        option('--model', 'opus'),
        '--effort',
        option('--effort', 'low'),
        '--json-schema',
        JSON.stringify(schema),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.is_error || !result.structured_output?.tags)
          throw new Error(result.result ?? stderr.slice(-400));
        const found = new Map();
        for (const { n, text } of result.structured_output.tags) {
          if (!Number.isInteger(n) || !batch[n] || typeof text !== 'string') continue;
          const plain = text.normalize('NFC').replace(/\s+/g, ' ').trim();
          if (
            !plain ||
            plain.length > 40 ||
            plain.split(' ').length > 4 ||
            !/\p{L}/u.test(plain) ||
            /\p{Script=Hebrew}/u.test(plain)
          )
            continue;
          found.set(n, plain);
        }
        if (found.size !== batch.length)
          throw new Error(
            `${lang}: incomplete or invalid translation batch (${found.size}/${batch.length}).`,
          );
        done({ found, cost: result.total_cost_usd ?? 0 });
      } catch (error) {
        fail(error);
      }
    });
    child.stdin.end(prompt);
  });
}
let next = 0;
let spent = 0;
let failed = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      let error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { found, cost } = await translate(task);
          for (const [n, text] of found) cache[task.lang][task.batch[n].phrase] = text;
          spent += cost;
          save(cacheFile, cache);
          console.log(
            `${task.lang}: ${Object.keys(cache[task.lang]).length}/${phrases.size}; $${spent.toFixed(2)}`,
          );
          error = undefined;
          break;
        } catch (caught) {
          error = caught;
        }
      }
      if (error) {
        console.error(error.message);
        failed++;
      }
    }
  }),
);
// Validate every item before changing any source file. A partial run only updates the cache.
const incomplete = [];
for (const { file } of sources) {
  for (const [key, own] of Object.entries(file.tags)) {
    for (const lang of languages) {
      const translated = own.en.map((tag) => cache[lang][tag]);
      const unique = [...new Set(translated)];
      if (translated.some((tag) => !valid(tag, lang)) || unique.length < 3 || unique.length > 20)
        incomplete.push(`${key}/${lang}`);
      else own[lang] = unique;
    }
  }
}
if (failed || incomplete.length)
  throw new Error(
    `Translations incomplete; source files unchanged. Resume the run. ${incomplete.slice(0, 20).join(', ')}`,
  );
for (const { path, file } of sources) save(path, file);
console.log(
  `Translated ${phrases.size} distinct tags into ${languages.length} languages; ${sources.length} files updated. Calls: $${spent.toFixed(2)}.`,
);
