import { readFileSync, writeFileSync } from 'node:fs';

/*
 * Writes `src/elements/emoji-catalog.json`: every emoji the art set draws, in Unicode's own
 * order and groups, with its name and keywords in English and in Hebrew.
 *
 * The art is Twemoji's, from the installed package. The order comes from Unicode's
 * `emoji-test.txt` and the words from CLDR's annotations; both are fetched at fixed versions,
 * so nothing but the art is a dependency of the app. The catalog is checked in: the emoji and
 * their words stay as they are until this script is run again.
 *
 * Unicode's data comes under its licence, which asks that its notice goes with every copy. The
 * script writes it beside the catalog (`emoji-catalog.notice.json`), and the build takes it from
 * there into the notices of the app (`build/notices.ts`).
 */

const EMOJI_TEST = 'https://unicode.org/Public/emoji/16.0/emoji-test.txt';
const CLDR_VERSION = '48.2.0';
const CLDR_REPO = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}`;
const CLDR = `${CLDR_REPO}/cldr-json`;
const annotations = (locale) => [
  `${CLDR}/cldr-annotations-full/annotations/${locale}/annotations.json`,
  `${CLDR}/cldr-annotations-derived-full/annotationsDerived/${locale}/annotations.json`,
];

/** Unicode's groups, as the catalog names them. "Component" (skin tones, hair) is left out. */
const GROUPS = {
  'Smileys & Emotion': 'smileys',
  'People & Body': 'people',
  'Animals & Nature': 'animals',
  'Food & Drink': 'food',
  'Travel & Places': 'travel',
  Activities: 'activities',
  Objects: 'objects',
  Symbols: 'symbols',
  Flags: 'flags',
};

async function fetched(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}

/** An emoji to its name and keywords, from a locale's two annotation files. */
async function wordsOf(locale) {
  const [plain, derived] = await Promise.all(annotations(locale).map(fetched));
  return {
    ...JSON.parse(derived).annotationsDerived.annotations,
    ...JSON.parse(plain).annotations.annotations,
  };
}

const chars = JSON.parse(
  readFileSync(
    new URL('../node_modules/@iconify-json/twemoji/chars.json', import.meta.url),
    'utf8',
  ),
);
const [test, english, hebrew, licence] = await Promise.all([
  fetched(EMOJI_TEST),
  wordsOf('en'),
  wordsOf('he'),
  fetched(`${CLDR_REPO}/LICENSE`),
]);

const SKIN_TONE = /1F3F[B-F]/;
// The separator of the catalog's lines, and what would break one.
const clean = (text) => text.replaceAll('|', ' ').replaceAll(',', ' ').trim();

const groups = [];
let group;
let missing = 0;
for (const line of test.split('\n')) {
  const heading = /^# group: (.+)$/.exec(line);
  if (heading) {
    const id = GROUPS[heading[1].trim()];
    group = id ? { id, emoji: [] } : undefined;
    if (group) groups.push(group);
    continue;
  }
  const row = /^([0-9A-F ]+?)\s*; fully-qualified\s*# (\S+) E[\d.]+ (.+)$/.exec(line);
  if (!row || !group || SKIN_TONE.test(row[1])) continue;
  const codes = row[1].toLowerCase().split(' ');
  // The art set names an emoji by its codes, with or without the variation selector.
  const name = chars[codes.join('-')] ?? chars[codes.filter((code) => code !== 'fe0f').join('-')];
  if (!name) {
    missing += 1;
    continue;
  }
  const emoji = row[2];
  // The annotations leave the variation selector out of their keys.
  const of = (words) => words[emoji] ?? words[emoji.replaceAll('\uFE0F', '')];
  const words = (entry, name) =>
    [...new Set((entry?.default ?? []).map(clean))].filter((word) => word && word !== name);
  const en = clean(of(english)?.tts?.[0] ?? row[3]);
  const he = clean(of(hebrew)?.tts?.[0] ?? '');
  group.emoji.push(
    [name, emoji, en, words(of(english), en).join(','), he, words(of(hebrew), he).join(',')].join(
      '|',
    ),
  );
}

const count = groups.reduce((sum, { emoji }) => sum + emoji.length, 0);
if (count < 1500) throw new Error(`Only ${count} emoji were matched to the art set`);
writeFileSync(
  new URL('../src/elements/emoji-catalog.json', import.meta.url),
  `${JSON.stringify(groups, null, 2)}\n`,
);
writeFileSync(
  new URL('../src/elements/emoji-catalog.notice.json', import.meta.url),
  `${JSON.stringify(
    {
      name: 'Unicode emoji data and CLDR annotations',
      version: `${/emoji\/([\d.]+)\//.exec(EMOJI_TEST)[1]}, ${CLDR_VERSION}`,
      license: 'Unicode-3.0',
      homepage: 'https://cldr.unicode.org',
      text: licence.replaceAll('\r\n', '\n').trim(),
    },
    null,
    2,
  )}\n`,
);
console.log(`${count} emoji in ${groups.length} groups; ${missing} without art were left out`);
