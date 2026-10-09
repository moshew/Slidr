import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/*
 * Writes `src/elements/graphics-catalog.json`: the colour graphics of the Elements panel, by
 * style, each drawing as `set:name` in the order the panel shows it. It is checked in, so the
 * choice stays as it is when a package updates.
 *
 * Two art sets draw a style. The first is a package of the app, and most of it is offered. The
 * second is an emoji set that draws far more than is taken from it, so it is not in the app: the
 * drawings picked from it are copied into `src/elements/art/`, a file a set, with the set's
 * notice beside it for the notices of a build (`build/notices.ts`).
 */

const read = (set, file) =>
  JSON.parse(
    readFileSync(new URL(`../node_modules/@iconify-json/${set}/${file}`, import.meta.url), 'utf8'),
  );

const write = (file, value) =>
  writeFileSync(
    new URL(`../src/elements/${file}`, import.meta.url),
    `${JSON.stringify(value, null, 2)}\n`,
  );

/** A fixed order that mixes subjects: an alphabetical page is a page of one subject. */
function mixed(names) {
  const rank = (name) => {
    let hash = 2166136261;
    for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The named drawings first, in the order given, then the others. */
function leading(names, first) {
  const found = first.filter((name) => names.includes(name));
  return [...found, ...names.filter((name) => !found.includes(name))];
}

/** A drawing's name as the panel says it (`stickers.ts`): no two of a style share one. */
const spoken = (name) => name.replace(/(-\d+)+$/, '').replaceAll('-', ' ');

/* ---------------------------------------------------------------- the styles' own sets */

/* Glossy: Microsoft's Fluent colour icons. A drawing comes in several sizes; the largest is kept. */
function glossy() {
  const largest = new Map();
  for (const name of Object.keys(read('fluent-color', 'icons.json').icons)) {
    const [, design, size] = /^(.*)-(\d+)$/.exec(name);
    if (Number(size) > (largest.get(design) ?? 0)) largest.set(design, Number(size));
  }
  return {
    set: 'fluent-color',
    names: [...largest].map(([design, size]) => `${design}-${size}`),
    first: [
      'premium-32',
      'trophy-48',
      'lightbulb-filament-48',
      'megaphone-loud-32',
      'heart-48',
      'star-48',
      'gift-24',
      'data-pie-32',
      'calendar-48',
      'design-ideas-48',
      'puzzle-piece-48',
      'planet-32',
      'chat-48',
      'coin-multiple-48',
      'beach-48',
      'camera-24',
      'paint-brush-32',
      'ribbon-star-32',
      'globe-24',
      'shield-checkmark-48',
      'people-team-48',
      'data-trending-48',
      'home-48',
      'food-48',
    ],
  };
}

/*
 * Illustrated: Streamline's Kameleon set, without its two-tone twins and other firms' characters.
 * The set draws everything on a coloured disc, which the app leaves out (`stickers.ts`). The
 * drawings in white are left out with it: only the disc made them visible on a light slide.
 */
function illustrated() {
  const others =
    /^(spongebob|wall-e|r2d2|pokeball|predator|captain-shield|wii-remote|mac-signal|windows-coding)$/;
  const white = new Set([
    'aid-kit',
    'airconditioner',
    'antenna',
    'article-file-2',
    'astronaut',
    'bank',
    'baseball',
    'battery-medium',
    'bullhorn',
    'cart',
    'castle',
    'chair-4',
    'cigarette',
    'coding-file-2',
    'cone',
    'coupons',
    'databse-network',
    'download-cloud',
    'eco-tag',
    'enter-key',
    'favorite-file',
    'filter',
    'glasses',
    'grinder',
    'hammer',
    'headset-2',
    'image-file',
    'lighter',
    'map',
    'microphone-3',
    'movie-file-3',
    'nuclear-mushroom',
    'peace',
    'perfume',
    'photo-file-2',
    'play',
    'plug',
    'pointer',
    'prism-2',
    'script-paper',
    'servers',
    'settings-4',
    'smartphone',
    'smartphone-forbiden',
    'smartphone-qrcode',
    'smartphone-rotate',
    'tea-cup',
    'text-file',
    'towel',
    'transfer-cloud',
    'upload-cloud-computer',
    'vespa',
    'webcam',
    'wind-vane',
    'wind-wheel',
    'wrench',
    'wrench-2',
    'yin-yang',
  ]);
  return {
    set: 'streamline-kameleon-color',
    names: Object.keys(read('streamline-kameleon-color', 'icons.json').icons).filter(
      (name) => !name.endsWith('-duo') && !others.test(name) && !white.has(name),
    ),
    first: [
      'party-poppers',
      'dartboard',
      'chart-pie',
      'light-bulb',
      'rainbow',
      'briefcase',
      'magic-wand',
      'robot',
      'money-graph',
      'strawberry',
      'popcorn',
      'beach-2',
      'butterfly',
      'podium',
      'education-globe',
      'space-shuttle',
      'camera-front',
      'laptop',
    ],
  };
}

/* Outlined: Streamline's Ultimate colour set, without logos, toolbar glyphs and a few oddities. */
function outlined() {
  const { categories } = read('streamline-ultimate-color', 'metadata.json');
  const left = new Set([
    ...categories.Logos,
    ...categories.InterfaceEssential,
    ...categories.ArrowsDiagrams,
  ]);
  const others = /android|go-pro|kindle|blackberry|visa|adobe|sperm|stool|cannabis|rifle/;
  return {
    set: 'streamline-ultimate-color',
    names: Object.keys(read('streamline-ultimate-color', 'icons.json').icons).filter(
      (name) => !left.has(name) && !others.test(name),
    ),
    first: [
      'startup-launch',
      'idea-strategy',
      'business-team-goal',
      'award-trophy-1',
      'presentation-board-graph',
      'party-confetti',
      'space-rocket-earth',
      'analytics-pie-2',
      'team-meeting',
      'business-deal-handshake-1',
      'color-palette',
      'treasure-chest',
      'target-center-monitor',
      'gift-box-1',
      'megaphone',
      'diamond-shine',
      'earth-pin-2',
      'performance-increase',
    ],
  };
}

/* ---------------------------------------------------------------- more of each style */

/** How many drawings a style takes from its second set. */
const MORE = 250;

/** The longest colour drawing taken: the few above it are many times the usual one. */
const HEAVY = 24_000;

/*
 * Glossy and illustrated: Microsoft's Fluent emoji, which draws each subject twice, in colour
 * with light on it and flat. A subject goes to one of the two styles, so the panel has no
 * drawing twice. Things, animals, food and places only: faces, people and signs are emoji.
 */
function fluent(glossyHas, illustratedHas) {
  const { categories } = read('fluent-emoji-flat', 'metadata.json');
  const colour = read('fluent-emoji', 'icons.json').icons;
  // One clock and one moon, not every hour and phase; one of what is drawn several ways.
  const repeated =
    /-oclock$|-thirty$|quarter-moon|gibbous|^wa(ning|xing)-|^new-moon|moon-face$|^oncoming-|mailbox-with-lowered|^open-mailbox|tilted-right$|^speaker-(low|medium)|^sun-behind-(large|small)|lightning-and-rain$|without-snow$|with-yen$/;
  // Not for a slide: weapons, smoking, death, the bathroom, underwear, pests.
  const unfit =
    /^(cigarette|coffin|funeral-urn|headstone|drop-of-blood|dagger|crossed-swords|water-pistol|military-helmet|mouse-trap|razor|plunger|toilet|roll-of-paper|briefs|bikini|one-piece-swimsuit|syringe|love-hotel|cockroach|mosquito|fly|microbe|worm|rat)$/;
  // Of one faith or one country, and the suits of cards.
  const particular =
    /^(church|mosque|synagogue|kaaba|hindu-temple|shinto-shrine|wedding|prayer-beads|diya-lamp|nazar-amulet|hamsa|map-of-japan|japanese-.*|tokyo-tower|mount-fuji|carp-streamer|moon-viewing-ceremony|pine-decoration|tanabata-tree|red-envelope|red-paper-lantern|white-flower|flower-playing-cards|mahjong-red-dragon|oden|dango|fish-cake-with-swirl|rice-cracker|moon-cake|mate|sake|moai|joker|.*-suit)$/;
  const subjects = ['Activities', 'Animals & Nature', 'Food & Drink', 'Objects', 'Travel & Places']
    .flatMap((group) => categories[group])
    .filter((name) => !repeated.test(name) && !unfit.test(name) && !particular.test(name));

  // The subjects a style must have, in the order they lead it. What the first rows of the
  // style's own set show already (a gem, a light bulb, a gift) comes after the others.
  const first = {
    glossy: [
      'rocket',
      'crown',
      'party-popper',
      'money-bag',
      'bullseye',
      'artist-palette',
      'crystal-ball',
      'balloon',
      '1st-place-medal',
      'key',
      'bell',
      'magnet',
      'hourglass-done',
      'globe-showing-europe-africa',
      'ringed-planet',
      'sun',
      'glowing-star',
      'fire',
      'high-voltage',
      'sparkles',
      'four-leaf-clover',
      'sunflower',
      'dolphin',
      'red-apple',
      'airplane',
      'sailboat',
      'automobile',
      'guitar',
      'video-game',
      'hot-beverage',
      'doughnut',
      'tropical-drink',
      'parrot',
      'gem-stone',
      'light-bulb',
      'wrapped-gift',
    ],
    illustrated: [
      'bar-chart',
      'books',
      'graduation-cap',
      'megaphone',
      'microscope',
      'chart-increasing',
      'telescope',
      'dna',
      'gear',
      'magnifying-glass-tilted-left',
      'shopping-cart',
      'package',
      'memo',
      'compass',
      'world-map',
      'satellite',
      'battery',
      'hammer-and-wrench',
      'house',
      'office-building',
      'factory',
      'hospital',
      'bicycle',
      'bus',
      'bullet-train',
      'ship',
      'helicopter',
      'tent',
      'beach-with-umbrella',
      'soccer-ball',
      'basketball',
      'headphone',
      'pizza',
      'hamburger',
      'owl',
      'deciduous-tree',
    ],
  };
  const fits = {
    glossy: (name) => !glossyHas.has(spoken(name)) && colour[name].body.length <= HEAVY,
    illustrated: (name) => !illustratedHas.has(spoken(name)),
  };
  const styles = Object.keys(fits);
  const picked = Object.fromEntries(
    styles.map((style) => [
      style,
      first[style].filter((name) => subjects.includes(name) && fits[style](name)),
    ]),
  );
  const taken = new Set(styles.flatMap((style) => picked[style]));
  // The others in turn: each to the style that has fewer so far, of those it fits.
  for (const name of mixed(subjects)) {
    if (taken.has(name)) continue;
    const [style] = styles
      .filter((one) => picked[one].length < MORE && fits[one](name))
      .sort((a, b) => picked[a].length - picked[b].length);
    if (style) picked[style].push(name);
  }
  return {
    glossy: { set: 'fluent-emoji', names: picked.glossy, first: first.glossy },
    illustrated: { set: 'fluent-emoji-flat', names: picked.illustrated, first: first.illustrated },
  };
}

/*
 * Outlined: Streamline's emoji, drawn in the line and the colours of its Ultimate set. Things,
 * animals and hands; of a subject the set draws several times, the first drawing.
 */
function streamline(has) {
  const { categories } = read('streamline-emojis', 'metadata.json');
  // Of the group of faces and people: the hands, and what is worn.
  const hands =
    /^(backhand-index|clapping-hands|crossed-fingers|flexed-biceps|folded-hands|hand-with-fingers|index-pointing|ok-hand|oncoming-fist|raised-fist|raised-hand|raising-hands|sign-of-the-horns|thumbs|victory-hand|vulcan-salute|waving-hand|writing-hand)/;
  const worn =
    /^(closed-umbrella|crown|dress|glasses|graduation-cap|handbag|high-heeled-shoe|jeans|mans-shoe|necktie|purse|ring|running-shoe|school-backpack|sunglasses|t-shirt|umbrella|womans-(boot|hat|sandal))(-\d)?$/;
  const unfit =
    /^(2|bomb|cigarette|pistol|toilet|syringe|love-hotel|wedding|moai|red-paper-lantern|restroom|sweat-droplets|right-anger-bubble|japanese-symbol-for-beginner|joker|.*-suit|no-.*|oncoming-(police-car|taxi)|.*quarter-moon.*|.*-gibbous-moon|waxing-.*|new-moon|full-moon-face)$/;
  const names = Object.entries(categories)
    .flatMap(([group, all]) =>
      group === 'Flags'
        ? []
        : group === 'Smiley People'
          ? all.filter((name) => hands.test(name) || worn.test(name))
          : all,
    )
    .filter((name) => !unfit.test(name))
    .sort();
  const said = new Set(has);
  const fresh = names.filter((name) => !said.has(spoken(name)) && said.add(spoken(name)));
  const first = [
    'thumbs-up-1',
    'lion-face',
    'crown',
    'clapping-hands-1',
    'money-bag',
    'graduation-cap',
    'balloon',
    'briefcase',
    'rainbow',
    'globe-showing-europe-africa',
    'wrapped-gift-1',
    'high-voltage',
    'fire',
    'sparkles',
    'magnifying-glass-tilted-left',
    'calendar',
    'microscope',
    'telescope',
    'airplane',
    'guitar',
    'pizza-1',
    'hot-beverage-1',
    'fox-face-1',
    'penguin-1',
    'sunflower-1',
    'four-leaf-clover',
    'victory-hand-1',
    'waving-hand-1',
    'flexed-biceps-1',
    'hourglass-done',
    'package',
    'open-book',
    'artist-palette',
    'ferris-wheel',
    'sailboat',
    'rocket',
    'direct-hit',
    'bar-chart',
    'confetti-ball',
  ];
  return {
    set: 'streamline-emojis',
    names: leading(mixed(fresh), first).slice(0, MORE),
    first,
  };
}

/* ---------------------------------------------------------------- what is written */

/** A style in the order the panel shows it: its first rows by hand, of its sets in turn. */
function ordered(...sets) {
  const from = ({ set }, names) => names.map((name) => `${set}:${name}`);
  const first = sets.map((one) => from(one, one.first));
  const turns = Array.from({ length: Math.max(...first.map((list) => list.length)) }, (_, at) =>
    first.flatMap((list) => list[at] ?? []),
  );
  return leading(mixed(sets.flatMap((one) => from(one, one.names))), turns.flat());
}

const MIT = `MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE`;

/**
 * Copies the drawings taken from a set that is not in the app, and writes the set's notice:
 * the text of its licence, or who drew it and under which licence where that is all it asks.
 */
function copied({ set, names }, licence) {
  const art = read(set, 'icons.json');
  const { name, author, license } = read(set, 'info.json');
  const { version, homepage } = read(set, 'package.json');
  const lost = names.filter((one) => !art.icons[one]);
  if (lost.length > 0) throw new Error(`${set} does not draw ${lost.join(', ')}`);
  write(`art/${set}.json`, {
    width: art.width,
    height: art.height,
    icons: Object.fromEntries([...names].sort().map((one) => [one, art.icons[one]])),
  });
  write(`art/${set}.notice.json`, {
    name: `@iconify-json/${set}`,
    version,
    license: license.spdx,
    author: `${author.name}, ${author.url}`,
    homepage,
    text:
      licence ?? `${name}, by ${author.name} (${author.url}).\n${license.title}: ${license.url}`,
  });
}

const own = { glossy: glossy(), illustrated: illustrated(), outlined: outlined() };
const said = (style) => new Set(own[style].names.map(spoken));
const more = {
  ...fluent(said('glossy'), said('illustrated')),
  outlined: streamline(said('outlined')),
};

mkdirSync(new URL('../src/elements/art/', import.meta.url), { recursive: true });
copied(more.glossy, MIT);
copied(more.illustrated, MIT);
copied(more.outlined);

const catalog = Object.keys(own).map((id) => ({ id, icons: ordered(own[id], more[id]) }));
write('graphics-catalog.json', catalog);
console.log(
  catalog
    .map(({ id, icons }) => `${id}: ${icons.length} (${more[id].names.length} of ${more[id].set})`)
    .join(', '),
);
