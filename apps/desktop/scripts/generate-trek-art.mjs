/**
 * Draws the illustration of the "trek" design (Elements → Designs) and writes it as WebP:
 *
 *   node scripts/generate-trek-art.mjs [--png <file>]
 *
 * The picture is original vector art, built here from seeded noise so that a run gives the same
 * file: a desert night with a rising moon, a mesa with three walkers, an acacia and a lit tent.
 * It carries no text; the subject sits on the right and the left of the sky is left calm for the
 * slide's own, editable words. `--png` also writes the frame as PNG, for a look at it.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/* global document, Image -- the page's own, inside `page.evaluate` */

const W = 1920;
const H = 1080;
const MOON = { x: 1440, y: 368, r: 214 };

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise, summed over octaves: 0..1. */
function noise(seed) {
  const next = random(seed);
  const grid = Array.from({ length: 1024 }, next);
  const at = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    return grid[i & 1023] + (grid[(i + 1) & 1023] - grid[i & 1023]) * t;
  };
  return (x, octaves = 5) => {
    let sum = 0;
    let amp = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += at(x * 2 ** o + o * 37.3) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  };
}

const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const n1 = (v) => Math.round(v * 10) / 10;

/** A ridgeline from noise; `terrace` flattens it into the steps of desert plateaus. */
function ridge({ seed, base, amp, scale, terrace = 0, step = 7 }) {
  const height = noise(seed);
  const points = [];
  for (let x = -40; x <= W + 40; x += step) {
    let v = height(x / scale);
    if (terrace) v = mix(v, Math.round(v * terrace) / terrace, 0.62);
    points.push([x, base(x) - amp * v]);
  }
  return points;
}

/** A ridgeline through given points, roughened so that it reads as rock. */
function profile(seed, stops, rough) {
  const jitter = noise(seed);
  const points = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, y0] = stops[i];
    const [x1, y1] = stops[i + 1];
    const count = Math.max(1, Math.round((x1 - x0) / 6));
    for (let k = 0; k < count; k++) {
      const x = mix(x0, x1, k / count);
      points.push([x, mix(y0, y1, k / count) + (jitter(x / 9, 3) - 0.5) * rough]);
    }
  }
  points.push(stops.at(-1));
  return points;
}

const line = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join('');
const land = (points) => `${line(points)}L${W + 40} ${H + 20}L-40 ${H + 20}Z`;
const heightAt = (points, x) => {
  const i = points.findIndex(([px]) => px >= x);
  if (i <= 0) return points[0][1];
  const [x0, y0] = points[i - 1];
  const [x1, y1] = points[i];
  return mix(y0, y1, (x - x0) / (x1 - x0));
};

const rise =
  (from, to, start = 500, end = 1700) =>
  (x) =>
    mix(from, to, ease((x - start) / (end - start)));

const far = ridge({ seed: 11, base: rise(800, 722), amp: 52, scale: 210, terrace: 5 });
const middle = ridge({ seed: 23, base: rise(824, 760), amp: 46, scale: 150, terrace: 6 });
const near = ridge({ seed: 37, base: rise(846, 800, 300, 1900), amp: 34, scale: 120, terrace: 4 });
const mesa = profile(
  5,
  [
    [-40, 900],
    [700, 880],
    [860, 846],
    [1000, 812],
    [1100, 778],
    [1178, 716],
    [1222, 682],
    [1262, 674],
    [1284, 612],
    [1299, 578],
    [1330, 570],
    [1420, 566],
    [1520, 570],
    [1574, 575],
    [1590, 604],
    [1611, 648],
    [1652, 662],
    [1700, 676],
    [1734, 724],
    [1800, 750],
    [1866, 764],
    [1960, 778],
  ],
  7,
);
const camp = ridge({ seed: 53, base: rise(872, 846, 200, 1800), amp: 20, scale: 260, step: 10 });
const front = ridge({ seed: 71, base: () => 902, amp: 16, scale: 330, step: 10 });

function stars() {
  const next = random(404);
  const tints = ['#ffffff', '#fff4dc', '#dfe6ff', '#ffe9c4'];
  const dots = [];
  const sparks = [];
  while (dots.length < 620) {
    const x = next() * W;
    const y = next() ** 1.35 * 800;
    const size = next();
    const tint = tints[Math.floor(next() * tints.length)];
    const glow = next();
    if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r + 26) continue;
    // Where the slide's words go, only small, quiet stars: a bright one beside a letter reads
    // as a stray mark.
    const words = x > 70 && x < 1150 && y > 80 && y < 770;
    if (words && size > 0.9) continue;
    // Fewer and fainter toward the lit horizon.
    const fade = (1 - ease((y - 380) / 400) * 0.75) * (words ? 0.7 : 1);
    const radius = size > 0.985 ? 2.5 : size > 0.9 ? 1.7 : size > 0.55 ? 1.15 : 0.75;
    dots.push(
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="${radius}" fill="${tint}" opacity="${n1((0.35 + glow * 0.65) * fade)}"/>`,
    );
    if (size > 0.985 && y < 520) sparks.push([x, y, 7 + glow * 7]);
  }
  const rays = sparks
    .map(
      ([x, y, s]) =>
        `<path d="M${n1(x)} ${n1(y - s)}Q${n1(x)} ${n1(y)} ${n1(x + s)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y + s)}Q${n1(x)} ${n1(y)} ${n1(x - s)} ${n1(y)}Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y - s)}Z" fill="#fff8e6" opacity=".9"/>`,
    )
    .join('');
  return dots.join('') + rays;
}

/** A walker with a pack and a stick, feet at the origin, about 46 high, heading right. */
function walker(x, y, scale, stride) {
  const s = stride;
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${scale})" fill="none" stroke="#1b1946" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="1.5" cy="-42" r="4.7" fill="#1b1946" stroke="none"/>
    <path d="M0 -35.5L-.6 -19" stroke-width="7.4"/>
    <path d="M-6.8 -34.5v11.5" stroke-width="6.4"/>
    <path d="M-.6 -19L${-5.5 * s} -9.5L${-7.5 * s} 0M-.6 -19L${4.6 * s} -10L${6.5 * s} 0" stroke-width="3.5"/>
    <path d="M1 -33.5L6.5 -26L10.5 -24" stroke-width="2.7"/>
    <path d="M10.5 -27L13.5 0" stroke-width="1.3"/>
  </g>`;
}

/** An umbrella thorn acacia: a forked trunk under a wide, flat crown. Base at the origin. */
function acacia(x, y, scale) {
  const next = random(88);
  const crown = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const cx = mix(-104, 108, t) + (next() - 0.5) * 12;
    const arch = Math.sin(t * Math.PI);
    const cy = -150 - arch * 16 + (next() - 0.5) * 9;
    crown.push(
      `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(17 + arch * 15 + next() * 9)}" ry="${n1(6 + arch * 7 + next() * 4)}"/>`,
    );
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    crown.push(
      `<ellipse cx="${n1(mix(-66, 70, t) + (next() - 0.5) * 12)}" cy="${n1(-140 + (next() - 0.5) * 6)}" rx="${n1(15 + next() * 8)}" ry="${n1(4 + next() * 2)}"/>`,
    );
  }
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="#0b0b25">
    <g fill="none" stroke="#0b0b25" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 4C1 -22 -4 -40 -9 -62" stroke-width="9"/>
      <path d="M-9 -62C-22 -92 -52 -118 -84 -141" stroke-width="5.5"/>
      <path d="M-9 -62C-8 -96 -18 -122 -30 -146" stroke-width="4.5"/>
      <path d="M-2 -40C14 -78 46 -112 80 -140" stroke-width="5.5"/>
      <path d="M18 -72C24 -104 30 -126 28 -148" stroke-width="3.5"/>
      <path d="M-50 -116C-56 -128 -58 -136 -56 -146M50 -116C62 -124 74 -126 90 -128" stroke-width="2.6"/>
    </g>
    ${crown.join('')}
  </g>`;
}

function tent(x, y) {
  return `<g transform="translate(${x} ${y}) scale(1.3)">
    <ellipse cx="0" cy="2" rx="230" ry="34" fill="url(#ground-glow)"/>
    <circle cx="0" cy="-26" r="120" fill="url(#tent-glow)"/>
    <path d="M-47 0Q-22 -34 0 -56Q22 -34 47 0Z" fill="url(#tent)"/>
    <path d="M0 -56Q-7 -24 -12 0H12Q7 -24 0 -56Z" fill="#fff0c4" opacity=".92"/>
    <path d="M0 -56Q-3 -26 -4 0H4Q3 -26 0 -56Z" fill="#b5531f" opacity=".5"/>
    <path d="M-47 0Q-22 -34 0 -56" fill="none" stroke="#ffe7b0" stroke-width="1.5" opacity=".8"/>
    <path d="M-58 2L-47 0M58 2L47 0M0 -56V-63" stroke="#2a1b3d" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;
}

function brush() {
  const next = random(19);
  const tufts = [];
  for (let i = 0; i < 46; i++) {
    const x = next() * W;
    const y = heightAt(front, x) + 3;
    const size = 5 + next() * 9;
    const blades = [-0.9, -0.45, 0, 0.5, 0.95]
      .map(
        (lean) =>
          `M0 0Q${n1(lean * size * 0.5)} ${n1(-size * 0.6)} ${n1(lean * size)} ${n1(-size * (1 - Math.abs(lean) * 0.35))}`,
      )
      .join('');
    tufts.push(`<path transform="translate(${n1(x)} ${n1(y)})" d="${blades}"/>`);
  }
  return `<g fill="none" stroke="#090920" stroke-width="1.6" stroke-linecap="round">${tufts.join('')}</g>`;
}

function clouds() {
  const next = random(63);
  const bands = [];
  for (let i = 0; i < 9; i++) {
    const cx = 1020 + next() * 900;
    const cy = 566 + next() * 170;
    bands.push(
      `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(170 + next() * 260)}" ry="${n1(3 + next() * 6)}" fill="${cy < 640 ? '#8c6aa8' : '#f0a383'}" opacity="${n1(0.22 + next() * 0.26)}"/>`,
    );
  }
  return `<g filter="url(#soft)">${bands.join('')}</g>`;
}

/** The mesa's rock: faint beds under its edge, and the moon's light along it. */
function strata() {
  const cliff = mesa.filter(([x]) => x > 700);
  const beds = [
    [24, 0.5],
    [52, 0.38],
    [86, 0.3],
    [128, 0.2],
  ]
    .map(([drop, opacity], i) => {
      const wobble = noise(90 + i);
      const bed = cliff.map(([x, y]) => [x, y + drop + (wobble(x / 40, 3) - 0.5) * 9]);
      return `<path d="${line(bed)}" fill="none" stroke="#4a4290" stroke-width="${n1(2.4 - i * 0.3)}" opacity="${opacity}" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<clipPath id="rock"><path d="${land(mesa)}"/></clipPath><g clip-path="url(#rock)">${beds}</g>
    <path d="${line(mesa)}" fill="none" stroke="#ffdcae" stroke-width="2.2" opacity=".8" stroke-linejoin="round" mask="url(#moonlit)"/>`;
}

function layer(id, points, top, bottom, depth, rim) {
  const crest = Math.min(...points.map(([, y]) => y));
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(crest)}" x2="0" y2="${n1(crest + depth)}"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <path d="${land(points)}" fill="url(#${id})"/>${
      rim
        ? `<path d="${line(points)}" fill="none" stroke="${rim}" stroke-width="1.6" opacity=".5" stroke-linejoin="round" mask="url(#moonlit)"/>`
        : ''
    }`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="830">
      <stop stop-color="#050823"/><stop offset=".3" stop-color="#0b1343"/><stop offset=".56" stop-color="#1a2567"/>
      <stop offset=".76" stop-color="#383486"/><stop offset=".9" stop-color="#674991"/><stop offset="1" stop-color="#9a5d90"/>
    </linearGradient>
    <radialGradient id="dusk" gradientUnits="userSpaceOnUse" cx="1540" cy="830" r="1080" gradientTransform="translate(0 830) scale(1 .46) translate(0 -830)">
      <stop stop-color="#ffc388"/><stop offset=".2" stop-color="#f69a78" stop-opacity=".82"/>
      <stop offset=".5" stop-color="#b9649a" stop-opacity=".36"/><stop offset="1" stop-color="#5a4a98" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${MOON.x}" cy="${MOON.y}" r="640">
      <stop offset=".3" stop-color="#ffe8ba" stop-opacity=".5"/><stop offset=".42" stop-color="#ffd9a6" stop-opacity=".22"/>
      <stop offset=".7" stop-color="#d9a6c4" stop-opacity=".07"/><stop offset="1" stop-color="#b79ad6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="moon" cx="38%" cy="34%" r="78%">
      <stop stop-color="#fffdf4"/><stop offset=".5" stop-color="#fdeec9"/><stop offset="1" stop-color="#f1c98b"/>
    </radialGradient>
    <linearGradient id="tent" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffdf9a"/><stop offset="1" stop-color="#f08a3e"/></linearGradient>
    <radialGradient id="tent-glow"><stop stop-color="#ffb866" stop-opacity=".55"/><stop offset=".45" stop-color="#ff9a55" stop-opacity=".16"/><stop offset="1" stop-color="#ff9a55" stop-opacity="0"/></radialGradient>
    <radialGradient id="ground-glow"><stop stop-color="#ffb061" stop-opacity=".7"/><stop offset=".5" stop-color="#e8794a" stop-opacity=".2"/><stop offset="1" stop-color="#e8794a" stop-opacity="0"/></radialGradient>
    <radialGradient id="lit" gradientUnits="userSpaceOnUse" cx="${MOON.x}" cy="${MOON.y + 200}" r="520"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="moonlit" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#lit)"/></mask>
    <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="1012" y1="84" x2="1176" y2="150"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff7e2"/></linearGradient>
    <clipPath id="disc"><circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r}"/></clipPath>
    <filter id="soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="seas" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" seed="4"/>
      <feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  .9 .9 .9 0 -.95"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#dusk)"/>
  ${stars()}
  <path d="M1012 84L1176 150" stroke="url(#trail)" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="1176" cy="150" r="3" fill="#fffaf0"/>

  <circle cx="${MOON.x}" cy="${MOON.y}" r="640" fill="url(#halo)"/>
  <circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r}" fill="url(#moon)"/>
  <g clip-path="url(#disc)" filter="url(#seas)" fill="#c08a5a" opacity=".27">
    <path d="M1338 262c34-34 96-40 132-12 30 24 22 60-14 74-30 12-40 40-76 42-44 2-74-66-42-104z"/>
    <path d="M1474 300c30-14 62 4 66 38 4 30-16 58-44 62-30 4-50-22-46-54 2-20 8-38 24-46z"/>
    <path d="M1318 380c22-12 50 0 58 26 8 28-8 60-32 64-26 4-44-22-42-50 2-18 4-32 16-40z"/>
    <path d="M1490 420c28-12 70-6 78 18 6 22-22 40-52 40-28 0-46-14-44-32 0-12 6-20 18-26z"/>
    <ellipse cx="1420" cy="462" rx="30" ry="20"/><ellipse cx="1572" cy="304" rx="18" ry="26"/>
    <ellipse cx="1586" cy="372" rx="12" ry="16"/>
  </g>
  <circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r - 1}" fill="none" stroke="#fff6dc" stroke-width="2" opacity=".55"/>
  ${clouds()}

  ${layer('far', far, '#5b4d97', '#a06c9e', 130, '#f3c7c0')}
  ${layer('middle', middle, '#423c82', '#75588f', 150, '#d6c2f0')}
  ${layer('near', near, '#2e2a67', '#4f4180', 170, '#bdb2ee')}
  ${layer('mesa', mesa, '#1b1946', '#2c2760', 330)}
  ${strata()}
  ${walker(1352, heightAt(mesa, 1352) + 2, 0.96, 1)}
  ${walker(1418, heightAt(mesa, 1418) + 2, 1.06, -0.8)}
  ${walker(1506, heightAt(mesa, 1506) + 2, 1, 0.9)}
  ${layer('camp', camp, '#11112e', '#16143a', 120)}
  ${acacia(1108, heightAt(camp, 1108) + 4, 1.12)}
  ${tent(1640, heightAt(camp, 1640) + 3)}
  ${layer('front', front, '#0a0a22', '#060617', 200)}
  ${brush()}
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".5" style="mix-blend-mode:soft-light"/>
</svg>`;

const out = fileURLToPath(new URL('../../../../Slidr-media/images/designs/trek.webp', import.meta.url));
const pngAt = process.argv.indexOf('--png');

// The installed Edge, as the project's suites use: the engine the app itself draws with.
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:#000">${svg}</body>`);
  const png = await page.screenshot({ type: 'png' });
  if (pngAt > 0) await writeFile(process.argv[pngAt + 1], png);
  const webp = await page.evaluate(
    async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.86).split(',')[1];
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  await writeFile(out, Buffer.from(webp, 'base64'));
  console.log(`${out}: ${Math.round((webp.length * 3) / 4 / 1024)} kB`);
} finally {
  await browser.close();
}
