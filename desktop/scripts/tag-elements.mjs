// Writes the search tags of the media library (docs/media-library.md, ADR-108): words in Hebrew
// and in English for every icon, graphic, emoji, frame, shape, card set and ready-made slide, by
// which the app and the library's page find them beside their names, `tags/<kind>.json` of the
// library. "יום הולדת" then finds the birthday invitation, the cake, the balloons and the magnets.
//
// It reads the published library (no copy of it is needed), and keeps the tags it writes in a
// folder of its own, `desktop/.tags/<kind>.json` (`--work <dir>`), which a first run starts from
// the published tags; `--upload` sends them to the library through its API.
//
// Claude writes them, through the Claude Code CLI (`claude`, signed in, as Slidr Studio uses it):
// the items of a kind go in numbered batches, each with what the catalogues say of it (its names,
// the words its set gives it, the text of a design), and a graphic is also seen, drawn on a sheet
// of the batch's drawings. Every answer is checked: a tag in the wrong letters, a word about the
// drawing rather than what it shows, or an item with too few tags is dropped, and a missing item
// is asked for once more. The file is written after each batch, so a run that stops keeps what it
// did; the next run goes on from there.
//
//   node desktop/scripts/tag-elements.mjs                      tag what has no tags, every kind
//   node desktop/scripts/tag-elements.mjs --kinds designs,emoji only those kinds
//   node desktop/scripts/tag-elements.mjs --again <key,...>    write the tags of these again
//   node desktop/scripts/tag-elements.mjs --again-all          write every tag again
//   node desktop/scripts/tag-elements.mjs --limit 40           at most 40 items of each kind
//   node desktop/scripts/tag-elements.mjs --dry-run            say what would be tagged
//   node desktop/scripts/tag-elements.mjs --upload <url>       and send them to the library
//
// The tags reach the library through its upload API, never by publishing the author copy:
// `--upload https://library.slidr.workers.dev` (or `http://127.0.0.1:5176`, the page's dev server)
// sends each kind's tags as one upload of `tag`, which the library checks against what it
// publishes and keeps until an editor accepts it (the library's README, "Search tags").
// LIBRARY_KEY is the program's key, as the Worker's `LIBRARY_KEYS` names it. With nothing left to
// tag, `--upload` only sends what the folder has. Once accepted, the tags are published through
// the library's API too (its README, "Publishing the uploads").
//
// --site <url> reads another site than the published library (`http://127.0.0.1:5176/media/`, the
// library's dev server); --from <dir> reads an author's copy instead, and keeps the tags in its
// `tags/`, as before the library was published through its API. --model and --effort are the
// CLI's (opus, low), --jobs the batches that run at once (4). CLAUDE_PATH names the CLI when it is
// not on the PATH. A key is what the kind's catalogue calls the item: `lucide:cake`,
// `fluent-emoji:balloon`, `birthday-cake`, `magnet-birthday`, `shape:rightArrow`, `steps`,
// `birthday`. The designs Slidr Studio publishes come with their tags (`managed.json`); one
// published before the studio wrote them is tagged here.
//
// Run it after a generator's catalogue is published, with `--upload`.
// `src/media/icons/tags.test.ts` fails while a published item has no tags.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { he as elementsHe, en as elementsEn } from '../src/elements/messages.ts';
import { he as objectsHe, en as objectsEn } from '../src/objects/messages.ts';
import { extraShapes } from '../../packages/renderer/src/extraShapes.ts';
import { MEDIA_LIBRARY_URL } from '../../packages/media-library/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const list = (value) => (value ? value.split(',').map((item) => item.trim()) : []);

/** An author's copy to read the library from (--from); without one, the published library. */
const media = flag('--from') ? resolve(flag('--from')) : undefined;
const SITE = (flag('--site') ?? MEDIA_LIBRARY_URL).replace(/\/*$/, '/');
/** Where the tags are kept between runs: the copy's `tags/`, or a folder of the script's own. */
const work = resolve(flag('--work') ?? (media ? join(media, 'tags') : join(here, '..', '.tags')));
const MODEL = flag('--model') ?? 'opus';
const EFFORT = flag('--effort') ?? 'low';
const JOBS = Number(flag('--jobs') ?? 4);
const LIMIT = Number(flag('--limit') ?? Infinity);
const DRY = args.includes('--dry-run');
const AGAIN_ALL = args.includes('--again-all');
const AGAIN = new Set(list(flag('--again')));
/** The library's page, whose API takes the tags (`--upload`), and the program's key to it. */
const UPLOAD = flag('--upload');
const KEY = process.env.LIBRARY_KEY;
if (UPLOAD && !KEY && !DRY) {
  throw new Error("--upload sends the tags with the library's key for programs: set LIBRARY_KEY.");
}
/** The kinds in the order a run tags them: the fewest and most looked for first. */
const KINDS = ['designs', 'cards', 'shapes', 'frames', 'graphics', 'emoji', 'icons'];
const chosen = list(flag('--kinds'));
for (const kind of chosen) {
  if (!KINDS.includes(kind)) throw new Error(`No kind "${kind}": ${KINDS.join(', ')}.`);
}
const kinds = chosen.length > 0 ? chosen : KINDS;

/** The files of the published library a run reads, by their paths; read once, at the start. */
const published = new Map();
/** The files each kind is told of. */
const NEEDS = {
  icons: ['icons/lucide/tags.json', 'icons/tabler/icons.json'],
  graphics: ['elements/catalogs/graphics-catalog.json'],
  emoji: ['elements/catalogs/emoji-catalog.json'],
  frames: ['elements/catalogs/frames-catalog.json'],
  shapes: ['elements/catalogs/shapes.json'],
  cards: ['elements/cards/catalog.json'],
  designs: ['elements/designs/index.json', 'elements/designs/managed.json'],
};
if (media) {
  if (!existsSync(join(media, 'manifest.json')) && !existsSync(join(media, 'elements'))) {
    throw new Error(`${media} is not an author copy of the library: run pnpm media:pull first.`);
  }
} else {
  const fetchJson = async (path) => {
    const url = SITE + path.split('/').map(encodeURIComponent).join('/');
    const answer = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!answer.ok) throw new Error(`${url} answered ${answer.status}.`);
    return answer.json();
  };
  const manifest = await fetchJson('manifest.json');
  const files = manifest.files ?? {};
  const wanted = new Set(kinds.flatMap((kind) => [...NEEDS[kind], `tags/${kind}.json`]));
  // A graphic is drawn from its art set.
  if (kinds.includes('graphics')) {
    for (const path of Object.keys(files))
      if (/^elements\/art\/[^/]+\.json$/.test(path)) wanted.add(path);
  }
  const paths = [...wanted].filter((path) => Object.hasOwn(files, path));
  for (let at = 0; at < paths.length; at += 6) {
    const batch = paths.slice(at, at + 6);
    const contents = await Promise.all(batch.map(fetchJson));
    batch.forEach((path, i) => published.set(path, contents[i]));
  }
  console.log(
    `Read ${published.size} files of the library published ${manifest.published} (${SITE}).`,
  );
}

const read = (path) => {
  if (media) return JSON.parse(readFileSync(join(media, ...path.split('/')), 'utf8'));
  if (!published.has(path)) throw new Error(`The published library has no ${path}.`);
  return published.get(path);
};

/* ---------------------------------------------------------------- what each kind holds */

/** A drawing's name as words: without the size or serial number its set ends it with. */
const spoken = (name) => name.replace(/(-\d+)+$/, '').replaceAll('-', ' ');

/** The text of a slide, paragraph by paragraph: what its runs say. */
function textOf(value, out = []) {
  if (Array.isArray(value)) for (const item of value) textOf(item, out);
  else if (value && typeof value === 'object') {
    if (Array.isArray(value.runs)) {
      const line = value.runs.map((run) => run.text ?? '').join('');
      if (line.trim()) out.push(line.trim());
    }
    for (const [key, item] of Object.entries(value)) if (key !== 'runs') textOf(item, out);
  }
  return out;
}
const clipped = (lines, most = 320) => {
  const text = lines.join(' / ');
  return text.length > most ? `${text.slice(0, most)}…` : text;
};

/**
 * Every item of a kind, in its catalogue's order: its key, and what Claude is told of it. A
 * graphic also says where its drawing is.
 */
const items = {
  icons() {
    const lucide = read('icons/lucide/tags.json');
    const tabler = read('icons/tabler/icons.json');
    return [
      ...Object.entries(lucide).map(([name, tags]) => ({
        key: `lucide:${name}`,
        about: `${name.replaceAll('-', ' ')} (set tags: ${tags.join(', ') || 'none'})`,
      })),
      ...Object.entries(tabler).map(([name, icon]) => ({
        key: `tabler:${name}`,
        about: `${name.replaceAll('-', ' ')} (set tags: ${(icon.tags ?? []).join(', ') || 'none'}${icon.category ? `; category: ${icon.category}` : ''})`,
      })),
    ];
  },
  graphics() {
    const seen = new Set();
    return read('elements/catalogs/graphics-catalog.json').flatMap(({ id: style, icons }) =>
      icons.flatMap((key) => {
        if (seen.has(key)) return [];
        seen.add(key);
        const [set, art] = key.split(':');
        return [{ key, about: `"${spoken(art)}" (${style} style, art set ${set})`, set, art }];
      }),
    );
  },
  emoji() {
    return read('elements/catalogs/emoji-catalog.json').flatMap(({ id: group, emoji }) =>
      emoji.map((line) => {
        const [art, char, en, enWords, he, heWords] = line.split('|');
        return {
          key: art,
          about: `${char} ${en} / ${he} (group: ${group}; keywords: ${enWords} / ${heWords})`,
        };
      }),
    );
  },
  frames() {
    return read('elements/catalogs/frames-catalog.json').groups.flatMap(({ id: group, frames }) =>
      frames.map((frame) => {
        // The words of its captions, and of the lines on its labels.
        const said = (frame.extras ?? [])
          .flatMap((extra) => (extra.kind === 'label' ? (extra.lines ?? []) : [extra]))
          .flatMap((caption) => [caption.en?.text, caption.he?.text])
          .filter((text) => typeof text === 'string' && text.trim());
        const parts = [
          `${frame.en} / ${frame.he}`,
          `group: ${group}`,
          frame.set && `magnet set: ${frame.set}`,
          frame.tags && `its words: ${frame.tags.en ?? ''} / ${frame.tags.he ?? ''}`,
          said.length > 0 && `captions: ${clipped(said, 160)}`,
        ];
        return { key: frame.id, about: parts.filter(Boolean).join('; ') };
      }),
    );
  },
  shapes() {
    const catalog = read('elements/catalogs/shapes.json');
    const groups = { he: objectsHe.library, en: objectsEn.library };
    const named = (preset, lang) =>
      extraShapes[preset]?.[lang] ?? (lang === 'he' ? objectsHe : objectsEn).shape[preset];
    const presets = [
      ...new Set([
        ...Object.keys(catalog.shapes ?? {}),
        ...Object.keys(objectsEn.shape),
        ...Object.keys(extraShapes),
      ]),
    ];
    const group = (preset) => catalog.shapes?.[preset]?.group ?? extraShapes[preset]?.group;
    return [
      ...presets
        .filter((preset) => named(preset, 'en'))
        .map((preset) => ({
          key: `shape:${preset}`,
          about: `${named(preset, 'en')} / ${named(preset, 'he')} (group: ${groups.en[group(preset)] ?? 'basic'})`,
        })),
      ...Object.keys(objectsEn.line).map((kind) => ({
        key: `line:${kind}`,
        about: `${objectsEn.line[kind]} / ${objectsHe.line[kind]} (a line you draw between two points)`,
      })),
      {
        key: 'card',
        about: `${objectsEn.card.title} / ${objectsHe.card.title} (a card: a box with a title and text)`,
      },
    ];
  },
  cards() {
    const catalog = read('elements/cards/catalog.json');
    return catalog.order.map((id) => ({
      key: id,
      about: `${elementsEn.cards.name[id]} / ${elementsHe.cards.name[id]} (${catalog.designs[id].kinds} kinds of card, up to ${catalog.designs[id].most} in a set)`,
    }));
  },
  designs() {
    const authored = read('elements/designs/index.json');
    const managed = read('elements/designs/managed.json');
    const one = (id, group, names, groupNames, slides) => {
      const text = (lang) => clipped(textOf(slides[lang]?.elements ?? []));
      return {
        key: id,
        about: [
          `${names.en} / ${names.he}`,
          `group: ${groupNames.en} / ${groupNames.he}`,
          `English text: ${text('en')}`,
          `Hebrew text: ${text('he')}`,
        ].join('\n   '),
      };
    };
    const all = authored.groups.flatMap((group) =>
      (authored.groupIds[group] ?? [])
        .filter((id) => authored.slides[id])
        .map((id) =>
          one(
            id,
            group,
            { en: elementsEn.designs.name[id] ?? id, he: elementsHe.designs.name[id] ?? id },
            {
              en: elementsEn.designs.group[group] ?? group,
              he: elementsHe.designs.group[group] ?? group,
            },
            authored.slides[id],
          ),
        ),
    );
    const taken = new Set(all.map(({ key }) => key));
    for (const group of managed.groups ?? []) {
      for (const id of managed.groupIds?.[group] ?? []) {
        // Tags already supplied by the studio are read by readTags; an authored id wins.
        if (taken.has(id) || !managed.slides?.[id]) continue;
        taken.add(id);
        all.push(
          one(
            id,
            group,
            managed.names?.[id] ?? { en: id, he: id },
            managed.groupNames?.[group] ?? { en: group, he: group },
            managed.slides[id],
          ),
        );
      }
    }
    return all;
  },
};

/* ---------------------------------------------------------------- what Claude is asked */

const SYSTEM = `You write the search tags of Slidr's media library: the icons, graphics, emoji, photo frames, shapes, card sets and ready-made slides that people add to presentations. People search it in Hebrew and in English, typing a word or two for what they need: the thing itself, what it is for, an occasion or a theme.

For each item, give tags in English and in Hebrew. Write each language natively: the Hebrew is what an Israeli types into a search box, not a word-for-word translation of the English, with its common spellings (יום הולדת, יומולדת). Tag:
- what it is or shows, by its common names and synonyms;
- the category it belongs to;
- the occasions, events, holidays, seasons and themes it suits (a balloon: birthday, party);
- what it stands for or is used to say, when it is a symbol (a light bulb: idea).

Do not tag the medium or the style: no "icon", "illustration", "drawing", "sticker", "emoji", "clipart", "graphic", "outline", "flat", "3d", nor their Hebrew; no background shape; no colour on its own (a coloured thing is one tag: "red heart"). Tag only what someone looking for this item would type: a word that would bring it up for an unrelated search makes the search worse. What the item already has (its name, its set's words) may be repeated; the search merges them.

Each tag is one to three words: English in lower case, Hebrew without niqqud. Give 8 to 16 tags in each language, the most telling first, nouns in the singular unless the thing is said in the plural. Answer only through the structured output, with every item of the request under its number.`;

const ABOUT = {
  icons:
    'These are line icons of two interface sets, Lucide and Tabler, each by its English name and the tags its set gives it. Tag what the icon shows and what it stands for on a slide (a gauge: performance, speed, dashboard).',
  graphics:
    'These are colour graphics. The picture shows the drawing of each item above its number: look at it, and tag what it shows, since a file name can be vague or wrong.',
  emoji:
    'These are emoji, each with its Unicode name and keywords in both languages. Add what those miss: the occasions, feelings and themes each is used for.',
  frames:
    'These are photo frames: shapes that cut a photograph, decorated frames, letters and digits a photograph fills, and event magnets (a photograph with stickers and captions, for an event whose guests take it home). Tag the shape or object, and, for a magnet, the event, the people it is for and its style.',
  shapes:
    'These are the shapes and lines of a presentation app. Tag each by its common names and what it is used for on a slide (a chevron: process, step, timeline).',
  cards:
    'These are card sets: a row of cards that holds content on a slide. Tag what each set is used to show.',
  designs:
    'These are ready-made slides: a whole slide designed for one purpose (a cover, an agenda, an invitation, a social post), each with its name, its group and the text it carries in English and in Hebrew. Tag what it is for: the kind of slide, the occasion or event, the field it is made for, the people it addresses. Its text is a sample that its user replaces: do not tag the sample\'s subject (a cover whose sample is a talk on remote work is a cover, a talk, a conference: not "remote work"), unless the design is made for that subject (a birthday invitation is for birthdays, a menu for a restaurant).',
};

/** How many items one call takes, by kind: a graphic is seen, a design has text. */
const BATCH = {
  icons: 60,
  graphics: 40,
  emoji: 60,
  frames: 40,
  shapes: 50,
  cards: 10,
  designs: 15,
};

const SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['n', 'en', 'he'],
        properties: {
          n: { type: 'integer' },
          en: { type: 'array', items: { type: 'string' } },
          he: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

/** Words about the drawing rather than what it shows, in either language. */
const MEDIUM = new Set([
  'icon',
  'icons',
  'illustration',
  'drawing',
  'sticker',
  'emoji',
  'clipart',
  'clip art',
  'graphic',
  'outline',
  'flat',
  '3d',
  'symbol icon',
  'אייקון',
  'אייקונים',
  'איור',
  'ציור',
  'סטיקר',
  'מדבקה',
  'אימוגי',
  'אמוגי',
  'קליפארט',
  'גרפיקה',
  'קו מתאר',
  'קווי מתאר',
]);
const HEBREW = /\p{Script=Hebrew}/u;
const LATIN = /[a-z0-9]/;
/** Most tags kept a language, and fewest an answer must have to be kept at all. */
const MOST = 20;
const FEWEST = 3;

/** The tags of one language as the library keeps them, or undefined when too few are good. */
function cleaned(tags, lang) {
  if (!Array.isArray(tags)) return undefined;
  const kept = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    let text = tag.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (lang === 'he') text = text.replace(/[֑-ׇ]/g, '');
    else text = text.toLowerCase();
    const plain = text.replace(/['"׳״`’]/g, '');
    if (!text || text.length > 40 || text.split(' ').length > 4) continue;
    if (MEDIUM.has(plain)) continue;
    if (lang === 'he' ? !HEBREW.test(text) : HEBREW.test(text) || !LATIN.test(text)) continue;
    if (!kept.includes(text)) kept.push(text);
  }
  return kept.length >= FEWEST ? kept.slice(0, MOST) : undefined;
}

/* ---------------------------------------------------------------- the sheet of a batch's drawings */

let browser;
const sheets = join(tmpdir(), `slidr-tags-${process.pid}`);

/** The kameleon set draws a disc behind every drawing, which the app leaves out (`stickers.ts`). */
const DISC = /^(<g fill="none">)<path fill="#[0-9a-f]+" d="M(?:24 47|48 23)\.[^"]*"\/>/;
const art = new Map();
function drawing(set, name) {
  if (!art.has(set)) art.set(set, read(`elements/art/${set}.json`));
  const own = art.get(set);
  const one = own.icons[name];
  if (!one) return '';
  const w = one.width ?? own.width ?? 16;
  const h = one.height ?? own.height ?? 16;
  const body = set === 'streamline-kameleon-color' ? one.body.replace(DISC, '$1') : one.body;
  const box = body === one.body ? `0 0 ${w} ${h}` : '9 9 30 30';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`;
}

/** The drawings of a batch on one picture, each over its number; a PNG, as base64. */
async function sheet(batch) {
  if (!browser) {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }
  const cells = batch
    .map(
      ({ set, art: name }, i) =>
        `<figure>${drawing(set, name)}<figcaption>${i + 1}</figcaption></figure>`,
    )
    .join('');
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  try {
    await page.setContent(
      `<html><body style="margin:0;background:#fff;font:700 20px Arial,sans-serif"><main>${cells}</main><style>main{display:grid;grid-template-columns:repeat(8,150px);gap:8px;padding:8px;width:max-content}figure{margin:0;border:1px solid #ddd;display:flex;flex-direction:column;align-items:center}svg{width:118px;height:118px;margin:8px 8px 0}figcaption{padding:2px 0 4px}</style></body></html>`,
    );
    const png = await page.locator('main').screenshot({ type: 'png' });
    return png.toString('base64');
  } finally {
    await page.close();
  }
}

/* ---------------------------------------------------------------- one call */

const claude = process.env.CLAUDE_PATH ?? 'claude';
mkdirSync(sheets, { recursive: true });
const systemFile = join(sheets, 'system.md');
writeFileSync(systemFile, SYSTEM);

/** What Claude answered for a batch, by the number of each item; it throws when the call fails. */
function ask(content) {
  return new Promise((done, fail) => {
    const child = spawn(
      claude,
      [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--restricted',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--tools',
        '',
        '--permission-mode',
        'dontAsk',
        '--no-session-persistence',
        '--system-prompt-file',
        systemFile,
        '--model',
        MODEL,
        '--effort',
        EFFORT,
        '--json-schema',
        JSON.stringify(SCHEMA),
      ],
      { cwd: sheets, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = out
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return undefined;
          }
        })
        .find((event) => event?.type === 'result');
      if (!result || result.is_error || result.subtype !== 'success') {
        fail(new Error(`claude ended with ${code}: ${result?.result ?? err.slice(-400)}`));
        return;
      }
      done({ items: result.structured_output?.items ?? [], cost: result.total_cost_usd ?? 0 });
    });
    child.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`);
  });
}

/** The tags of a batch, by key; an item Claude left out or answered badly is not there. */
async function tag(kind, batch) {
  const lines = batch.map((item, i) => `${i + 1}. ${item.about}`).join('\n');
  const content = [];
  if (kind === 'graphics') {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: await sheet(batch) },
    });
  }
  content.push({
    type: 'text',
    text: `${ABOUT[kind]}\n\nItems:\n${lines}\n\nTag all ${batch.length} items.`,
  });
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { items: answered, cost } = await ask(content);
      const tags = new Map();
      for (const answer of answered) {
        const item = batch[answer.n - 1];
        const en = cleaned(answer.en, 'en');
        const he = cleaned(answer.he, 'he');
        if (item && en && he) tags.set(item.key, { en, he });
      }
      return { tags, cost };
    } catch (error) {
      last = error;
      await new Promise((wait) => setTimeout(wait, 5000 * (attempt + 1)));
    }
  }
  throw last;
}

/* ---------------------------------------------------------------- the files */

const fileOf = (kind) => join(work, `${kind}.json`);

/** The tags of a kind: as this folder keeps them, or else as the library publishes them. */
function readTags(kind) {
  const file = fileOf(kind);
  const tags = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')).tags ?? {})
    : media
      ? {}
      : { ...(published.get(`tags/${kind}.json`)?.tags ?? {}) };
  if (kind !== 'designs') return tags;
  const managed = read('elements/designs/managed.json').tags ?? {};
  for (const [key, own] of Object.entries(managed)) {
    tags[key] = { ...own, ...tags[key] };
  }
  return tags;
}

/** The tags of a kind in its catalogue's order, an item a line; what the catalogue lost is left out. */
function writeTags(kind, all, tags) {
  const lines = all
    .filter(({ key }) => tags[key])
    .map(({ key }) => `    ${JSON.stringify(key)}: ${JSON.stringify(tags[key])}`);
  const file = fileOf(kind);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `{\n  "version": 1,\n  "tags": {\n${lines.join(',\n')}\n  }\n}\n`);
  renameSync(`${file}.tmp`, file);
}

/* ---------------------------------------------------------------- into the library */

/**
 * Sends the tags of a kind to the library through its API, as one upload of `tag` (the library's
 * README, "Search tags"): every item that has tags, each under its key, in Hebrew and English.
 * One upload of a kind's tags waits at a time: one that waits is withdrawn and sent again, and one
 * that was accepted is left to be published first. What the library finds wrong is said, item by
 * item; nothing of it is sent then.
 */
async function uploadTags(kind, all, tags) {
  const base = UPLOAD.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${KEY}` };
  const call = async (path, init = {}) => {
    const answer = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    const body = answer.status === 204 ? undefined : await answer.json().catch(() => undefined);
    return { status: answer.status, body };
  };
  const languages = { he: { tags: {} }, en: { tags: {} } };
  for (const { key } of all) {
    if (!tags[key]) continue;
    for (const [lang, words] of Object.entries(tags[key])) {
      languages[lang] ??= { tags: {} };
      languages[lang].tags[key] = words;
    }
  }
  const count = Object.keys(languages.he.tags).length;
  if (count === 0) return;
  if (DRY) {
    console.log(`  ${kind}: would upload the tags of ${count} items to ${base}`);
    return;
  }
  const query = `?type=${kind}&action=tag&target=${kind}`;
  const waiting = await call(`/api/uploads${query}&status=pending`);
  const accepted = await call(`/api/uploads${query}&status=accepted`);
  if (waiting.status !== 200 || accepted.status !== 200) {
    throw new Error(`${base} answered ${waiting.status}: ${waiting.body?.message ?? ''}`);
  }
  if (accepted.body.uploads.length > 0) {
    console.error(
      `  ${kind}: the tags of ${accepted.body.uploads[0].id} were accepted and wait to be published; nothing is sent.`,
    );
    unsent += 1;
    return;
  }
  for (const { id } of waiting.body.uploads) {
    await call(`/api/uploads/${id}`, { method: 'DELETE' });
    console.log(`  ${kind}: the waiting upload ${id} is withdrawn for these tags`);
  }
  const made = await call('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: kind, action: 'tag', id: kind, languages }),
  });
  if (made.status === 201) {
    console.log(`  ${kind}: the tags of ${count} items wait as ${made.body.id}`);
    return;
  }
  unsent += 1;
  console.error(
    `  ${kind}: the library refused the tags (${made.status}): ${made.body?.message ?? ''}`,
  );
  for (const issue of (made.body?.issues ?? []).slice(0, 20)) {
    console.error(`    ${issue.path}: ${issue.message}`);
  }
}

/* ---------------------------------------------------------------- the run */

let spent = 0;
let failed = 0;
/** The kinds whose tags the library did not take. */
let unsent = 0;
for (const kind of kinds) {
  const all = items[kind]();
  const tags = readTags(kind);
  const keys = new Set(all.map(({ key }) => key));
  const dropped = Object.keys(tags).filter((key) => !keys.has(key));
  const wanted = all.filter(({ key }) => AGAIN_ALL || AGAIN.has(key) || !tags[key]).slice(0, LIMIT);
  const tagged = all.filter(({ key }) => tags[key]).length;
  console.log(
    `${kind}: ${all.length} items, ${tagged} tagged, ${wanted.length} to tag now` +
      (dropped.length > 0 ? `, ${dropped.length} no longer in the catalogue` : ''),
  );
  if (!DRY && wanted.length > 0) await tagAll(kind, all, tags, wanted);
  else if (!DRY && dropped.length > 0) writeTags(kind, all, tags);
  if (UPLOAD) await uploadTags(kind, all, tags);
}

/** Asks Claude for the tags of what is wanted, and keeps them in the kind's file batch by batch. */
async function tagAll(kind, all, tags, wanted) {
  const size = BATCH[kind];
  let left = wanted;
  // A second round asks again for what the first left out.
  for (let round = 0; round < 2 && left.length > 0; round += 1) {
    const batches = [];
    for (let at = 0; at < left.length; at += size) batches.push(left.slice(at, at + size));
    let next = 0;
    let done = 0;
    const missing = [];
    const work = async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        try {
          const { tags: found, cost } = await tag(kind, batch);
          spent += cost;
          for (const [key, own] of found) tags[key] = own;
          missing.push(...batch.filter(({ key }) => !found.has(key)));
          writeTags(kind, all, tags);
        } catch (error) {
          console.error(`  ${kind}: a batch failed: ${error.message}`);
          missing.push(...batch);
        }
        done += batch.length;
        console.log(`  ${kind}: ${done}/${left.length} asked, $${spent.toFixed(2)} so far`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(JOBS, batches.length) }, work));
    left = missing;
  }
  if (left.length > 0) {
    failed += left.length;
    console.error(`  ${kind}: no tags for ${left.map(({ key }) => key).join(', ')}`);
  }
  writeTags(kind, all, tags);
}

await browser?.close();
rmSync(sheets, { recursive: true, force: true });
console.log(
  `Done. The calls cost $${spent.toFixed(2)}` +
    (failed ? `; ${failed} items have no tags` : '') +
    (unsent ? `; the tags of ${unsent} kinds were not sent` : '') +
    '.',
);
process.exit(failed + unsent > 0 ? 1 : 0);
