import { readFileSync, writeFileSync } from 'node:fs';

/*
 * Writes `src/elements/graphics-catalog.json`: the colour graphics of the Elements panel, by
 * style. Each style is one art set of the installed packages; the catalog lists which of its
 * drawings are offered and in what order. It is checked in, so the choice stays as it is when a
 * package updates.
 */

const read = (set, file) =>
  JSON.parse(
    readFileSync(new URL(`../node_modules/@iconify-json/${set}/${file}`, import.meta.url), 'utf8'),
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

/* Glossy: Microsoft's Fluent colour icons. A drawing comes in several sizes; the largest is kept. */
function glossy() {
  const largest = new Map();
  for (const name of Object.keys(read('fluent-color', 'icons.json').icons)) {
    const [, design, size] = /^(.*)-(\d+)$/.exec(name);
    if (Number(size) > (largest.get(design) ?? 0)) largest.set(design, Number(size));
  }
  const names = mixed([...largest].map(([design, size]) => `${design}-${size}`));
  return leading(names, [
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
  ]);
}

/* Illustrated: Streamline's Kameleon set, without its two-tone twins and other firms' characters. */
function illustrated() {
  const others =
    /^(spongebob|wall-e|r2d2|pokeball|predator|captain-shield|wii-remote|mac-signal|windows-coding)$/;
  const names = Object.keys(read('streamline-kameleon-color', 'icons.json').icons).filter(
    (name) => !name.endsWith('-duo') && !others.test(name),
  );
  return leading(mixed(names), [
    'space-shuttle',
    'light-bulb',
    'chart-pie',
    'dartboard',
    'party-poppers',
    'map',
    'astronaut',
    'rainbow',
    'magic-wand',
    'briefcase',
    'money-graph',
    'camera-front',
    'bullhorn',
    'laptop',
    'robot',
    'beach-2',
    'popcorn',
    'strawberry',
  ]);
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
  const names = Object.keys(read('streamline-ultimate-color', 'icons.json').icons).filter(
    (name) => !left.has(name) && !others.test(name),
  );
  return leading(mixed(names), [
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
  ]);
}

const catalog = [
  { id: 'glossy', set: 'fluent-color', icons: glossy() },
  { id: 'illustrated', set: 'streamline-kameleon-color', icons: illustrated() },
  { id: 'outlined', set: 'streamline-ultimate-color', icons: outlined() },
];

writeFileSync(
  new URL('../src/elements/graphics-catalog.json', import.meta.url),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
console.log(catalog.map(({ id, icons }) => `${id}: ${icons.length}`).join(', '));
