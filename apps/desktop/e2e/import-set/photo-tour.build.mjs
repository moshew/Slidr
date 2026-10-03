// Builds photo-tour.html: paints synthetic, photo-like pictures on a canvas in headless Edge,
// encodes them as JPEG / WebP / PNG and embeds them as data: URIs in the page below.
//
//   node apps/desktop/e2e/import-set/photo-tour.build.mjs            writes photo-tour.html
//   node apps/desktop/e2e/import-set/photo-tour.build.mjs --dump DIR also saves each picture to DIR
//
// The pictures are drawn from seeded random numbers, so a rebuild gives the same scenes.
/* global process, console, Buffer, document */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** name → size, format, seed and the largest encoded size in bytes. */
const PICTURES = {
  ridge: { scene: 'ridge', w: 1600, h: 900, type: 'image/jpeg', budget: 150_000, seed: 11 },
  lake: { scene: 'lake', w: 1000, h: 1250, type: 'image/jpeg', budget: 115_000, seed: 23 },
  beach: { scene: 'beach', w: 1200, h: 800, type: 'image/jpeg', budget: 85_000, seed: 31 },
  lighthouse: {
    scene: 'lighthouse',
    w: 800,
    h: 1000,
    type: 'image/jpeg',
    budget: 70_000,
    seed: 47,
  },
  pebbles: { scene: 'pebbles', w: 1000, h: 1000, type: 'image/jpeg', budget: 85_000, seed: 59 },
  dunes: { scene: 'dunes', w: 1400, h: 700, type: 'image/jpeg', budget: 75_000, seed: 67 },
  forest: { scene: 'forest', w: 1600, h: 900, type: 'image/jpeg', budget: 140_000, seed: 71 },
  summit: { scene: 'summit', w: 900, h: 1200, type: 'image/jpeg', budget: 100_000, seed: 83 },
  camp: { scene: 'camp', w: 1600, h: 900, type: 'image/jpeg', budget: 110_000, seed: 97 },
  portrait1: {
    scene: 'portrait',
    w: 480,
    h: 600,
    type: 'image/webp',
    budget: 24_000,
    seed: 101,
    look: {
      bg: ['#6d8a6a', '#2e4a3c'],
      bokeh: '255,240,190',
      skin: '#e2b08a',
      hair: '#3a2a20',
      style: 'short',
      jacket: '#c2452d',
      dx: 0,
    },
  },
  portrait2: {
    scene: 'portrait',
    w: 480,
    h: 600,
    type: 'image/webp',
    budget: 24_000,
    seed: 103,
    look: {
      bg: ['#8fb3c9', '#3d5f78'],
      bokeh: '255,255,255',
      skin: '#f0c9a8',
      hair: '#b5652a',
      style: 'long',
      jacket: '#2f5f8a',
      dx: -10,
    },
  },
  portrait3: {
    scene: 'portrait',
    w: 480,
    h: 600,
    type: 'image/webp',
    budget: 24_000,
    seed: 107,
    look: {
      bg: ['#c9a36b', '#6b4a2a'],
      bokeh: '255,220,160',
      skin: '#8d5a3c',
      hair: '#15110f',
      style: 'beanie',
      jacket: '#3c6b4f',
      dx: 8,
    },
  },
  portrait4: {
    scene: 'portrait',
    w: 480,
    h: 600,
    type: 'image/webp',
    budget: 24_000,
    seed: 109,
    look: {
      bg: ['#9a8fb8', '#3b3558'],
      bokeh: '255,210,230',
      skin: '#d9a57c',
      hair: '#d8d4cc',
      style: 'bun',
      jacket: '#e0b23a',
      dx: 0,
    },
  },
  badge: { scene: 'badge', w: 240, h: 240, type: 'image/png', budget: Infinity, seed: 113 },
};

// ---------------------------------------------------------------------------------------------
// Runs inside the browser page.
// ---------------------------------------------------------------------------------------------
function paintAll(pictures) {
  const rng = (seed) => {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  };
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = hex(a),
      B = hex(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  };
  const vgrad = (ctx, y0, y1, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  };
  const glow = (ctx, x, y, r, stops) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  /** A jagged skyline: y for every x, from a few octaves of sines. */
  const skyline = (rand, w, base, amp, f0 = 1.3, octaves = 6) => {
    const waves = [];
    for (let k = 0; k < octaves; k++)
      waves.push([f0 * 2 ** k * (0.8 + rand() * 0.4), rand() * 6.283, amp / 1.85 ** k]);
    const ys = new Float32Array(w + 1);
    for (let x = 0; x <= w; x++) {
      let y = base;
      for (const [f, p, a] of waves) y -= Math.sin((x / w) * 6.283 * f + p) * a;
      ys[x] = y;
    }
    return ys;
  };
  const fillBelow = (ctx, ys, w, h, fill) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 2) ctx.lineTo(x, ys[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const blurred = (ctx, px, draw) => {
    ctx.save();
    ctx.filter = `blur(${px}px)`;
    draw();
    ctx.restore();
  };
  const clouds = (ctx, rand, n, box, size, tint, alpha) => {
    for (let i = 0; i < n; i++) {
      const x = box[0] + rand() * box[2],
        y = box[1] + rand() * box[3];
      const rx = size[0] + rand() * size[1],
        ry = rx * (0.08 + rand() * 0.1);
      ctx.fillStyle = `rgba(${tint},${alpha[0] + rand() * alpha[1]})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, 6.283);
      ctx.fill();
    }
  };
  const pine = (ctx, x, y, hgt, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const tiers = 5;
    ctx.moveTo(x, y - hgt);
    for (let t = 1; t <= tiers; t++) {
      const yy = y - hgt + (hgt * t) / tiers;
      const half = (hgt * 0.22 * t) / tiers;
      ctx.lineTo(x + half, yy);
      ctx.lineTo(x + half * 0.45, yy);
    }
    for (let t = tiers; t >= 1; t--) {
      const yy = y - hgt + (hgt * t) / tiers;
      const half = (hgt * 0.22 * t) / tiers;
      ctx.lineTo(x - half * 0.45, yy);
      ctx.lineTo(x - half, yy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - hgt * 0.02, y - 2, hgt * 0.04, hgt * 0.08);
  };
  const grain = (ctx, w, h, rand, amount) => {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 2 * amount;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  };
  const vignette = (ctx, w, h, strength) => {
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  const streaks = (ctx, rand, n, y0, y1, w, color, alpha) => {
    for (let i = 0; i < n; i++) {
      const t = rand();
      const y = y0 + (y1 - y0) * t * t;
      const len = (20 + rand() * 120) * (0.3 + t * 1.6);
      ctx.fillStyle = `rgba(${color},${alpha[0] + rand() * alpha[1]})`;
      ctx.beginPath();
      ctx.ellipse(rand() * w, y, len, 0.8 + t * 2.2, 0, 0, 6.283);
      ctx.fill();
    }
  };

  const scenes = {
    // Sunset over layered mountain ridges.
    ridge(ctx, w, h, rand) {
      ctx.fillStyle = vgrad(ctx, 0, h * 0.74, [
        [0, '#131d3a'],
        [0.32, '#3a4676'],
        [0.6, '#b9686c'],
        [0.82, '#f2a25c'],
        [1, '#fbd993'],
      ]);
      ctx.fillRect(0, 0, w, h);
      const sx = w * 0.69,
        sy = h * 0.6;
      glow(ctx, sx, sy, w * 0.5, [
        [0, 'rgba(255,246,220,1)'],
        [0.05, 'rgba(255,228,165,0.8)'],
        [0.28, 'rgba(255,170,95,0.3)'],
        [1, 'rgba(255,150,80,0)'],
      ]);
      blurred(ctx, 18, () => {
        clouds(ctx, rand, 16, [0, h * 0.1, w, h * 0.34], [140, 320], '70,60,100', [0.12, 0.2]);
        clouds(ctx, rand, 14, [0, h * 0.16, w, h * 0.32], [120, 300], '255,176,130', [0.14, 0.26]);
      });
      const layers = 6;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const ys = skyline(rand, w, h * (0.56 + t * 0.34), h * (0.085 + t * 0.05), 1.1 + t * 0.8);
        fillBelow(ctx, ys, w, h, mix('#c58a86', '#0c1222', Math.pow(t, 0.75)));
        // haze that settles in the valleys between two ridges
        ctx.fillStyle = vgrad(ctx, h * (0.56 + t * 0.34), h, [
          [0, 'rgba(255,190,140,0)'],
          [1, `rgba(255,190,140,${0.22 * (1 - t)})`],
        ]);
        ctx.fillRect(0, 0, w, h);
        if (i === layers - 1) {
          for (let x = -10; x < w + 10; x += 14 + rand() * 30)
            pine(
              ctx,
              x,
              ys[Math.max(0, Math.min(w, Math.round(x)))] + 8,
              46 + rand() * 80,
              '#080d19',
            );
        }
      }
      vignette(ctx, w, h, 0.35);
      grain(ctx, w, h, rand, 5);
    },

    // A still mountain lake with the peaks mirrored in it.
    lake(ctx, w, h, rand) {
      const shore = Math.round(h * 0.5);
      ctx.fillStyle = vgrad(ctx, 0, shore, [
        [0, '#6fa3cf'],
        [0.6, '#b9d6e6'],
        [1, '#eef4f2'],
      ]);
      ctx.fillRect(0, 0, w, shore);
      blurred(ctx, 14, () =>
        clouds(ctx, rand, 10, [0, 30, w, shore * 0.4], [90, 220], '255,255,255', [0.35, 0.4]),
      );
      const far = skyline(rand, w, shore * 0.52, shore * 0.2, 1.4);
      fillBelow(ctx, far, w, shore, '#8497ad');
      // snow on the high ground
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, shore);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, far[x]);
      ctx.lineTo(w, shore);
      ctx.clip();
      const snow = skyline(rand, w, shore * 0.46, shore * 0.05, 9, 4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, snow[x]);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fillStyle = '#f4f7fa';
      ctx.fill();
      ctx.restore();
      fillBelow(ctx, skyline(rand, w, shore * 0.74, shore * 0.13, 1.8), w, shore, '#566f7c');
      const near = skyline(rand, w, shore * 0.9, shore * 0.05, 2.6);
      fillBelow(ctx, near, w, shore, '#2f4a41');
      for (let x = 0; x < w; x += 7 + rand() * 12)
        pine(ctx, x, shore + 2, 30 + rand() * 46, '#1e3229');
      // the mirror image, a little darker and broken by ripples
      ctx.save();
      ctx.translate(0, shore * 2);
      ctx.scale(1, -1);
      ctx.drawImage(ctx.canvas, 0, 0, w, shore, 0, 0, w, shore);
      ctx.restore();
      ctx.fillStyle = vgrad(ctx, shore, h, [
        [0, 'rgba(20,50,60,0.28)'],
        [1, 'rgba(10,30,45,0.6)'],
      ]);
      ctx.fillRect(0, shore, w, h - shore);
      streaks(ctx, rand, 260, shore + 6, h, w, '220,240,245', [0.04, 0.12]);
      streaks(ctx, rand, 160, shore + 6, h, w, '10,30,40', [0.05, 0.12]);
      ctx.fillStyle = 'rgba(240,248,250,0.5)';
      ctx.fillRect(0, shore - 1, w, 2);
      // stones on the near shore
      for (let i = 0; i < 26; i++) {
        const x = rand() * w,
          y = h - rand() * rand() * h * 0.16,
          r = 24 + rand() * 80;
        ctx.fillStyle = mix('#2b3134', '#565b58', rand());
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.2, r, r * 0.45, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.2, y + r * 0.05, r * 0.6, r * 0.18, 0, 0, 6.283);
        ctx.fill();
      }
      vignette(ctx, w, h, 0.25);
      grain(ctx, w, h, rand, 5);
    },

    // An empty beach: sky, sea, a line of foam, sand.
    beach(ctx, w, h, rand) {
      const horizon = h * 0.36,
        shoreY = h * 0.66;
      ctx.fillStyle = vgrad(ctx, 0, horizon, [
        [0, '#5fa6de'],
        [1, '#d9eef6'],
      ]);
      ctx.fillRect(0, 0, w, horizon);
      blurred(ctx, 12, () =>
        clouds(ctx, rand, 12, [0, 20, w, horizon * 0.7], [80, 240], '255,255,255', [0.4, 0.4]),
      );
      ctx.fillStyle = vgrad(ctx, horizon, shoreY, [
        [0, '#1f6f97'],
        [0.6, '#3fa4b4'],
        [1, '#8fd3cf'],
      ]);
      ctx.fillRect(0, horizon, w, shoreY - horizon + 30);
      streaks(ctx, rand, 420, horizon + 2, shoreY, w, '255,255,255', [0.05, 0.16]);
      streaks(ctx, rand, 200, horizon + 2, shoreY, w, '10,60,90', [0.05, 0.12]);
      // sand
      const edge = skyline(rand, w, shoreY, 14, 1.2, 4);
      fillBelow(
        ctx,
        edge,
        w,
        h,
        vgrad(ctx, shoreY, h, [
          [0, '#b29a78'],
          [0.25, '#d6bf96'],
          [1, '#ecdcb8'],
        ]),
      );
      // foam along the water's edge
      blurred(ctx, 2, () => {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 9;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) ctx.lineTo(x, edge[x] + Math.sin(x * 0.05) * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) ctx.lineTo(x, edge[x] - 22 + Math.sin(x * 0.03) * 5);
        ctx.stroke();
      });
      for (let i = 0; i < 5000; i++) {
        const y = shoreY + 20 + rand() * (h - shoreY - 20);
        ctx.fillStyle = rand() > 0.5 ? 'rgba(120,95,60,0.25)' : 'rgba(255,250,235,0.3)';
        ctx.fillRect(rand() * w, y, 1.5, 1.5);
      }
      // footprints walking away
      for (let i = 0; i < 12; i++) {
        const t = i / 12;
        ctx.fillStyle = 'rgba(120,95,60,0.35)';
        ctx.beginPath();
        ctx.ellipse(
          w * (0.72 - t * 0.2) + (i % 2) * 16,
          h - 20 - t * (h - shoreY - 60),
          9 - t * 4,
          15 - t * 7,
          0.3,
          0,
          6.283,
        );
        ctx.fill();
      }
      grain(ctx, w, h, rand, 5);
    },

    // A lighthouse on a headland under an overcast sky.
    lighthouse(ctx, w, h, rand) {
      const horizon = h * 0.64;
      ctx.fillStyle = vgrad(ctx, 0, horizon, [
        [0, '#5c7a99'],
        [0.7, '#b7c7d3'],
        [1, '#dfe6e6'],
      ]);
      ctx.fillRect(0, 0, w, horizon);
      blurred(ctx, 20, () => {
        clouds(ctx, rand, 12, [0, 0, w, horizon * 0.8], [120, 260], '245,248,250', [0.25, 0.35]);
        clouds(ctx, rand, 8, [0, 0, w, horizon * 0.5], [140, 260], '60,80,105', [0.12, 0.2]);
      });
      ctx.fillStyle = vgrad(ctx, horizon, h, [
        [0, '#46748c'],
        [1, '#17364a'],
      ]);
      ctx.fillRect(0, horizon, w, h - horizon);
      streaks(ctx, rand, 260, horizon + 2, h, w, '255,255,255', [0.04, 0.14]);
      // headland
      const top = skyline(rand, w, h * 0.5, 16, 1.5, 4);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w * 0.72; x += 2)
        ctx.lineTo(x, top[x] + Math.pow(x / (w * 0.72), 6) * h * 0.2);
      ctx.lineTo(w * 0.78, h * 0.86);
      ctx.lineTo(w * 0.7, h);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = vgrad(ctx, h * 0.48, h, [
        [0, '#5d7a3f'],
        [0.07, '#4a6335'],
        [0.1, '#6b5f54'],
        [1, '#322c2a'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(${rand() > 0.5 ? '20,16,14' : '160,150,135'},${0.1 + rand() * 0.2})`;
        ctx.lineWidth = 1 + rand() * 3;
        const y = h * 0.56 + rand() * h * 0.44,
          x = rand() * w * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 40 + rand() * 120, y + (rand() - 0.3) * 30);
        ctx.stroke();
      }
      ctx.restore();
      // the tower
      const bx = w * 0.3,
        by = top[Math.round(bx)] + 6,
        th = h * 0.3;
      glow(ctx, bx, by - th - 14, 150, [
        [0, 'rgba(255,245,200,0.9)'],
        [0.2, 'rgba(255,240,190,0.35)'],
        [1, 'rgba(255,240,190,0)'],
      ]);
      const tower = ctx.createLinearGradient(bx - 30, 0, bx + 30, 0);
      tower.addColorStop(0, '#f6f4ee');
      tower.addColorStop(1, '#b9bcbd');
      ctx.fillStyle = tower;
      ctx.beginPath();
      ctx.moveTo(bx - 30, by);
      ctx.lineTo(bx - 18, by - th);
      ctx.lineTo(bx + 18, by - th);
      ctx.lineTo(bx + 30, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b5392c';
      for (const k of [0.2, 0.55]) {
        const y0 = by - th * k,
          y1 = by - th * (k + 0.16);
        const half = (y) => 30 - (12 * (by - y)) / th;
        ctx.beginPath();
        ctx.moveTo(bx - half(y0), y0);
        ctx.lineTo(bx - half(y1), y1);
        ctx.lineTo(bx + half(y1), y1);
        ctx.lineTo(bx + half(y0), y0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#2a2d33';
      ctx.fillRect(bx - 24, by - th - 6, 48, 6);
      ctx.fillStyle = '#ffe9a3';
      ctx.fillRect(bx - 13, by - th - 30, 26, 24);
      ctx.fillStyle = '#b5392c';
      ctx.beginPath();
      ctx.moveTo(bx - 18, by - th - 30);
      ctx.lineTo(bx, by - th - 50);
      ctx.lineTo(bx + 18, by - th - 30);
      ctx.closePath();
      ctx.fill();
      // keeper's house
      ctx.fillStyle = '#e9e6dd';
      ctx.fillRect(bx + 44, by - 34, 70, 36);
      ctx.fillStyle = '#6a3a30';
      ctx.beginPath();
      ctx.moveTo(bx + 38, by - 34);
      ctx.lineTo(bx + 79, by - 60);
      ctx.lineTo(bx + 120, by - 34);
      ctx.closePath();
      ctx.fill();
      // surf at the foot of the cliff
      blurred(ctx, 5, () => {
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.4})`;
          ctx.beginPath();
          ctx.ellipse(
            w * 0.66 + rand() * w * 0.18,
            h * 0.88 + rand() * h * 0.12,
            14 + rand() * 40,
            5 + rand() * 12,
            0,
            0,
            6.283,
          );
          ctx.fill();
        }
      });
      vignette(ctx, w, h, 0.3);
      grain(ctx, w, h, rand, 5);
    },

    // A close view of wet pebbles.
    pebbles(ctx, w, h, rand) {
      ctx.fillStyle = '#4b4a47';
      ctx.fillRect(0, 0, w, h);
      const palette = [
        '#8c8a85',
        '#6f6c68',
        '#b3aca0',
        '#9a7f66',
        '#5d6670',
        '#c7c1b4',
        '#7d6a5c',
        '#3f4347',
        '#a39b8d',
        '#d8d2c6',
        '#84725f',
      ];
      const stones = [];
      for (let i = 0; i < 620; i++)
        stones.push([rand() * w, rand() * h, 18 + rand() * rand() * 70, rand()]);
      stones.sort((a, b) => a[2] - b[2]);
      for (const [x, y, r, k] of stones) {
        const base = palette[Math.floor(k * palette.length)];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rand() * 3.14);
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = r * 0.35;
        ctx.shadowOffsetX = r * 0.12;
        ctx.shadowOffsetY = r * 0.18;
        const g = ctx.createRadialGradient(-r * 0.35, -r * 0.3, r * 0.05, 0, 0, r * 1.1);
        g.addColorStop(0, mix(base, '#ffffff', 0.45));
        g.addColorStop(0.5, base);
        g.addColorStop(1, mix(base, '#000000', 0.5));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * (0.62 + rand() * 0.3), 0, 0, 6.283);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        if (rand() > 0.6) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1 + rand() * 3;
          ctx.beginPath();
          ctx.moveTo(-r * 0.9, (rand() - 0.5) * r * 0.6);
          ctx.quadraticCurveTo(0, (rand() - 0.5) * r * 0.5, r * 0.9, (rand() - 0.5) * r * 0.6);
          ctx.stroke();
        }
        ctx.restore();
      }
      vignette(ctx, w, h, 0.45);
      grain(ctx, w, h, rand, 5);
    },

    // Sand dunes and marram grass in low evening light.
    dunes(ctx, w, h, rand) {
      ctx.fillStyle = vgrad(ctx, 0, h * 0.5, [
        [0, '#e7a56a'],
        [0.6, '#f8cf94'],
        [1, '#fdebc8'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.16, h * 0.4, w * 0.4, [
        [0, 'rgba(255,250,225,1)'],
        [0.06, 'rgba(255,236,180,0.85)'],
        [0.4, 'rgba(255,200,130,0.25)'],
        [1, 'rgba(255,200,130,0)'],
      ]);
      ctx.fillStyle = '#86a9b0';
      ctx.fillRect(0, h * 0.42, w, h * 0.08);
      streaks(ctx, rand, 80, h * 0.42, h * 0.5, w, '255,240,210', [0.1, 0.3]);
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const base = h * (0.5 + t * 0.3);
        const ys = skyline(rand, w, base, h * (0.05 + t * 0.06), 0.7 + rand() * 0.6, 3);
        fillBelow(
          ctx,
          ys,
          w,
          h,
          vgrad(ctx, base - h * 0.1, base + h * 0.3, [
            [0, mix('#f0cd92', '#d79a55', t)],
            [1, mix('#c99a63', '#8a5529', t)],
          ]),
        );
        const blades = 500 + i * 900;
        for (let b = 0; b < blades; b++) {
          const x = rand() * w;
          const y0 = ys[Math.round(x)] + rand() * rand() * h * (0.06 + t * 0.12);
          const len = (12 + rand() * 30) * (0.5 + t * 1.6);
          ctx.strokeStyle = [
            `rgba(96,108,52,0.8)`,
            `rgba(172,160,88,0.8)`,
            `rgba(58,66,30,0.8)`,
            `rgba(226,204,130,0.8)`,
          ][Math.floor(rand() * 4)];
          ctx.lineWidth = 0.6 + t * 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.quadraticCurveTo(
            x + len * 0.15,
            y0 - len * 0.7,
            x + len * (0.4 + rand() * 0.5),
            y0 - len * (0.7 + rand() * 0.3),
          );
          ctx.stroke();
        }
      }
      vignette(ctx, w, h, 0.25);
      grain(ctx, w, h, rand, 5);
    },

    // Tall trunks in morning mist.
    forest(ctx, w, h, rand) {
      ctx.fillStyle = vgrad(ctx, 0, h, [
        [0, '#e3ebdc'],
        [0.55, '#b4c8ac'],
        [1, '#55704f'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.74, h * 0.1, w * 0.6, [
        [0, 'rgba(255,252,225,0.95)'],
        [0.3, 'rgba(255,250,215,0.4)'],
        [1, 'rgba(255,250,215,0)'],
      ]);
      const layers = 5;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const color = mix('#b3c6ae', '#18241b', Math.pow(t, 0.8));
        blurred(ctx, (1 - t) * 3.5 + 0.3, () => {
          const count = 22 - i * 3;
          for (let k = 0; k < count; k++) {
            const x = (k + rand()) * (w / count);
            const width = 7 + t * t * 64 * (0.6 + rand() * 0.7);
            const lean = (rand() - 0.5) * 30;
            const foot = h * (0.74 + t * 0.26);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x - width / 2, foot);
            ctx.lineTo(x - width * 0.36 + lean, -10);
            ctx.lineTo(x + width * 0.36 + lean, -10);
            ctx.lineTo(x + width / 2, foot);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = color;
            for (let b = 0; b < 5; b++) {
              const by = rand() * foot * 0.7,
                dir = rand() > 0.5 ? 1 : -1;
              const bx = x + (lean * (foot - by)) / foot;
              ctx.lineWidth = Math.max(1, width * 0.12);
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.quadraticCurveTo(
                bx + dir * width * 1.5,
                by - 10,
                bx + dir * (40 + width * 2.4),
                by - 30 - rand() * 50,
              );
              ctx.stroke();
            }
          }
        });
        // mist between this row of trees and the next one
        ctx.fillStyle = vgrad(ctx, 0, h, [
          [0, `rgba(232,240,226,${0.16 * (1 - t)})`],
          [0.7, `rgba(226,236,220,${0.46 * (1 - t)})`],
          [1, `rgba(200,216,196,${0.2 * (1 - t)})`],
        ]);
        ctx.fillRect(0, 0, w, h);
      }
      // shafts of light
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(16px)';
      for (let i = 0; i < 7; i++) {
        const x0 = w * (0.5 + rand() * 0.45),
          wd = 30 + rand() * 90;
        ctx.fillStyle = `rgba(255,250,215,${0.08 + rand() * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(x0, -20);
        ctx.lineTo(x0 + wd, -20);
        ctx.lineTo(x0 + wd - w * 0.42, h);
        ctx.lineTo(x0 - wd * 1.6 - w * 0.42, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // undergrowth
      ctx.fillStyle = vgrad(ctx, h * 0.8, h, [
        [0, 'rgba(20,34,22,0)'],
        [1, 'rgba(14,24,16,0.92)'],
      ]);
      ctx.fillRect(0, h * 0.8, w, h * 0.2);
      for (let i = 0; i < 1500; i++) {
        const x = rand() * w,
          y = h * 0.86 + rand() * h * 0.14;
        ctx.strokeStyle = rand() > 0.6 ? 'rgba(120,150,84,0.7)' : 'rgba(40,66,40,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + (rand() - 0.5) * 20,
          y - 20,
          x + (rand() - 0.5) * 50,
          y - 14 - rand() * 34,
        );
        ctx.stroke();
      }
      vignette(ctx, w, h, 0.3);
      grain(ctx, w, h, rand, 5);
    },

    // First light from the top, above a sea of cloud.
    summit(ctx, w, h, rand) {
      const horizon = h * 0.62;
      ctx.fillStyle = vgrad(ctx, 0, horizon, [
        [0, '#080c26'],
        [0.42, '#27286a'],
        [0.72, '#8c3f7c'],
        [0.9, '#ec7d4c'],
        [1, '#ffd486'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const y = rand() * rand() * horizon * 0.7;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.7})`;
        ctx.fillRect(rand() * w, y, 1 + rand() * 1.6, 1 + rand() * 1.6);
      }
      glow(ctx, w * 0.3, horizon, w * 0.7, [
        [0, 'rgba(255,250,220,1)'],
        [0.04, 'rgba(255,225,150,0.9)'],
        [0.3, 'rgba(255,150,90,0.3)'],
        [1, 'rgba(255,150,90,0)'],
      ]);
      // cloud sea
      ctx.fillStyle = vgrad(ctx, horizon, h, [
        [0, '#e9a58c'],
        [0.3, '#a9799c'],
        [1, '#3d355f'],
      ]);
      ctx.fillRect(0, horizon, w, h - horizon);
      blurred(ctx, 16, () => {
        for (let i = 0; i < 90; i++) {
          const t = rand();
          const y = horizon + 6 + t * t * (h - horizon) * 0.8;
          const rx = (50 + rand() * 120) * (0.4 + t * 1.8);
          ctx.fillStyle = `rgba(${t < 0.3 ? '255,214,170' : '226,190,214'},${0.25 + rand() * 0.35})`;
          ctx.beginPath();
          ctx.ellipse(rand() * w, y, rx, rx * 0.2, 0, 0, 6.283);
          ctx.fill();
          ctx.fillStyle = 'rgba(52,40,84,0.25)';
          ctx.beginPath();
          ctx.ellipse(rand() * w, y + rx * 0.2, rx, rx * 0.14, 0, 0, 6.283);
          ctx.fill();
        }
      });
      // the top itself, in shadow, with a rim of light
      const px = w * 0.62,
        py = h * 0.6;
      const rock = [
        [-20, h],
        [w * 0.1, h * 0.86],
        [w * 0.3, h * 0.78],
        [w * 0.44, h * 0.68],
        [px - 30, py + 6],
        [px, py],
        [px + 40, py + 14],
        [w * 0.8, h * 0.72],
        [w * 0.92, h * 0.8],
        [w + 20, h * 0.84],
        [w + 20, h],
      ];
      ctx.fillStyle = vgrad(ctx, py, h, [
        [0, '#1a1730'],
        [1, '#07070f'],
      ]);
      ctx.beginPath();
      rock.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + (rand() - 0.5) * 6) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,110,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      rock.slice(1, 6).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      // cairn
      ctx.fillStyle = '#0d0c18';
      [
        [0, 0, 26, 9],
        [-2, -14, 20, 8],
        [3, -27, 15, 7],
        [0, -38, 10, 6],
        [1, -47, 6, 4],
      ].forEach(([dx, dy, rx, ry]) => {
        ctx.beginPath();
        ctx.ellipse(px + dx, py - 4 + dy, rx, ry, 0, 0, 6.283);
        ctx.fill();
      });
      // a walker beside it
      const fx = px - 96,
        fy = py + 22;
      ctx.fillStyle = '#0a0914';
      ctx.strokeStyle = '#0a0914';
      ctx.beginPath();
      ctx.arc(fx, fy - 84, 9, 0, 6.283);
      ctx.fill();
      ctx.fillRect(fx - 9, fy - 74, 18, 36);
      ctx.fillRect(fx - 20, fy - 72, 12, 28);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(fx - 4, fy - 40);
      ctx.lineTo(fx - 8, fy);
      ctx.moveTo(fx + 4, fy - 40);
      ctx.lineTo(fx + 10, fy);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx + 8, fy - 60);
      ctx.lineTo(fx + 24, fy + 2);
      ctx.stroke();
      vignette(ctx, w, h, 0.3);
      grain(ctx, w, h, rand, 5);
    },

    // The last camp at night, out of focus lights in front.
    camp(ctx, w, h, rand) {
      ctx.fillStyle = vgrad(ctx, 0, h, [
        [0, '#050916'],
        [0.55, '#131b36'],
        [1, '#19141c'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.7})`;
        ctx.fillRect(rand() * w, rand() * h * 0.55, 1 + rand() * 1.5, 1 + rand() * 1.5);
      }
      const trees = skyline(rand, w, h * 0.62, h * 0.05, 1.2, 4);
      fillBelow(ctx, trees, w, h, '#070a12');
      for (let x = 0; x < w; x += 12 + rand() * 26)
        pine(ctx, x, trees[Math.round(x)] + 6, 50 + rand() * 90, '#070a12');
      // ground lit by the fire
      const fx = w * 0.6,
        fy = h * 0.8;
      glow(ctx, fx, fy, w * 0.42, [
        [0, 'rgba(255,170,70,0.75)'],
        [0.2, 'rgba(255,130,50,0.3)'],
        [1, 'rgba(255,120,40,0)'],
      ]);
      // tent
      const tx = w * 0.34,
        ty = h * 0.82;
      ctx.save();
      ctx.shadowColor = 'rgba(255,170,70,0.9)';
      ctx.shadowBlur = 70;
      const tent = ctx.createLinearGradient(tx - 150, ty - 150, tx + 150, ty);
      tent.addColorStop(0, '#ffd27a');
      tent.addColorStop(1, '#f07a2c');
      ctx.fillStyle = tent;
      ctx.beginPath();
      ctx.moveTo(tx - 170, ty);
      ctx.quadraticCurveTo(tx - 60, ty - 150, tx, ty - 160);
      ctx.quadraticCurveTo(tx + 60, ty - 150, tx + 170, ty);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(120,50,10,0.55)';
      ctx.beginPath();
      ctx.moveTo(tx - 6, ty - 150);
      ctx.lineTo(tx + 44, ty);
      ctx.lineTo(tx - 50, ty);
      ctx.closePath();
      ctx.fill();
      // flames
      for (let i = 0; i < 9; i++) {
        const dx = (rand() - 0.5) * 50,
          fh = 40 + rand() * 70;
        ctx.fillStyle = ['#fff1b0', '#ffc24d', '#ff8a2a'][i % 3];
        ctx.beginPath();
        ctx.moveTo(fx + dx - 14, fy);
        ctx.quadraticCurveTo(fx + dx - 18, fy - fh * 0.5, fx + dx + (rand() - 0.5) * 16, fy - fh);
        ctx.quadraticCurveTo(fx + dx + 18, fy - fh * 0.5, fx + dx + 14, fy);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(255,${150 + Math.floor(rand() * 80)},70,${0.4 + rand() * 0.6})`;
        ctx.fillRect(
          fx + (rand() - 0.5) * 160,
          fy - 60 - rand() * 300,
          2 + rand() * 2,
          2 + rand() * 2,
        );
      }
      // bokeh
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(2px)';
      for (let i = 0; i < 46; i++) {
        const r = 18 + rand() * 80;
        const x = rand() * w,
          y = h * 0.35 + rand() * h * 0.7;
        const tint = rand() > 0.25 ? `255,${150 + Math.floor(rand() * 70)},80` : '150,190,255';
        const a = 0.08 + rand() * 0.16;
        ctx.fillStyle = `rgba(${tint},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = `rgba(${tint},${a * 1.4})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      vignette(ctx, w, h, 0.4);
      grain(ctx, w, h, rand, 4);
    },

    // Head and shoulders against a blurred background.
    portrait(ctx, w, h, rand, look) {
      ctx.fillStyle = vgrad(ctx, 0, h, [
        [0, look.bg[0]],
        [1, look.bg[1]],
      ]);
      ctx.fillRect(0, 0, w, h);
      blurred(ctx, 12, () => {
        for (let i = 0; i < 26; i++) {
          ctx.fillStyle = `rgba(${look.bokeh},${0.1 + rand() * 0.25})`;
          ctx.beginPath();
          ctx.arc(rand() * w, rand() * h * 0.8, 18 + rand() * 50, 0, 6.283);
          ctx.fill();
        }
      });
      const cx = w / 2 + look.dx,
        cy = h * 0.4,
        rx = w * 0.165,
        ry = w * 0.21;
      const skinDark = mix(look.skin, '#000000', 0.3),
        skinLight = mix(look.skin, '#ffffff', 0.25);
      blurred(ctx, 0.7, () => {
        if (look.style === 'long') {
          ctx.fillStyle = look.hair;
          ctx.beginPath();
          ctx.ellipse(cx, cy + ry * 0.5, rx * 1.45, ry * 1.75, 0, 0, 6.283);
          ctx.fill();
        }
        // shoulders
        const sh = ctx.createLinearGradient(0, h * 0.68, 0, h);
        sh.addColorStop(0, look.jacket);
        sh.addColorStop(1, mix(look.jacket, '#000000', 0.4));
        ctx.fillStyle = sh;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.46, h);
        ctx.bezierCurveTo(cx - w * 0.44, h * 0.76, cx - w * 0.24, h * 0.72, cx - w * 0.1, h * 0.69);
        ctx.lineTo(cx + w * 0.1, h * 0.69);
        ctx.bezierCurveTo(cx + w * 0.24, h * 0.72, cx + w * 0.44, h * 0.76, cx + w * 0.46, h);
        ctx.closePath();
        ctx.fill();
        // neck
        ctx.fillStyle = skinDark;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.07, cy + ry * 0.6);
        ctx.lineTo(cx - w * 0.085, h * 0.71);
        ctx.quadraticCurveTo(cx, h * 0.77, cx + w * 0.085, h * 0.71);
        ctx.lineTo(cx + w * 0.07, cy + ry * 0.6);
        ctx.closePath();
        ctx.fill();
        // collar
        ctx.strokeStyle = mix(look.jacket, '#ffffff', 0.25);
        ctx.lineWidth = w * 0.03;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.12, h * 0.7);
        ctx.quadraticCurveTo(cx, h * 0.8, cx + w * 0.12, h * 0.7);
        ctx.stroke();
        // head
        const face = ctx.createRadialGradient(
          cx - rx * 0.4,
          cy - ry * 0.3,
          rx * 0.1,
          cx,
          cy,
          ry * 1.25,
        );
        face.addColorStop(0, skinLight);
        face.addColorStop(0.55, look.skin);
        face.addColorStop(1, skinDark);
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283);
        ctx.fill();
        // ears
        ctx.fillStyle = look.skin;
        ctx.beginPath();
        ctx.ellipse(cx - rx * 1.0, cy + ry * 0.05, rx * 0.13, ry * 0.17, 0, 0, 6.283);
        ctx.ellipse(cx + rx * 1.0, cy + ry * 0.05, rx * 0.13, ry * 0.17, 0, 0, 6.283);
        ctx.fill();
        // features
        ctx.fillStyle = 'rgba(30,18,12,0.85)';
        ctx.beginPath();
        ctx.ellipse(cx - rx * 0.4, cy - ry * 0.05, rx * 0.085, ry * 0.045, 0, 0, 6.283);
        ctx.ellipse(cx + rx * 0.4, cy - ry * 0.05, rx * 0.085, ry * 0.045, 0, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = mix(look.hair, look.skin, 0.25);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.6, cy - ry * 0.2);
        ctx.quadraticCurveTo(cx - rx * 0.4, cy - ry * 0.27, cx - rx * 0.2, cy - ry * 0.2);
        ctx.moveTo(cx + rx * 0.2, cy - ry * 0.2);
        ctx.quadraticCurveTo(cx + rx * 0.4, cy - ry * 0.27, cx + rx * 0.6, cy - ry * 0.2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(60,25,15,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + rx * 0.04, cy);
        ctx.quadraticCurveTo(cx + rx * 0.16, cy + ry * 0.3, cx - rx * 0.04, cy + ry * 0.33);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,40,35,0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.34, cy + ry * 0.55);
        ctx.quadraticCurveTo(cx, cy + ry * 0.72, cx + rx * 0.34, cy + ry * 0.55);
        ctx.stroke();
        // hair or hat
        ctx.fillStyle = look.hair;
        if (look.style === 'beanie') {
          ctx.fillStyle = '#c9472f';
          ctx.beginPath();
          ctx.ellipse(cx, cy - ry * 0.42, rx * 1.12, ry * 0.86, 0, 3.1416, 6.2832);
          ctx.fill();
          ctx.fillStyle = '#a53623';
          ctx.fillRect(cx - rx * 1.14, cy - ry * 0.5, rx * 2.28, ry * 0.26);
          ctx.fillStyle = '#f0e6d2';
          ctx.beginPath();
          ctx.arc(cx, cy - ry * 1.3, rx * 0.24, 0, 6.283);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.ellipse(cx, cy - ry * 0.3, rx * 1.08, ry * 0.86, 0, 3.1416, 6.2832);
          ctx.quadraticCurveTo(cx + rx * 0.5, cy - ry * 0.72, cx - rx * 0.1, cy - ry * 0.62);
          ctx.quadraticCurveTo(cx - rx * 0.7, cy - ry * 0.56, cx - rx * 1.08, cy - ry * 0.3);
          ctx.fill();
          if (look.style === 'bun') {
            ctx.beginPath();
            ctx.arc(cx + rx * 0.1, cy - ry * 1.2, rx * 0.42, 0, 6.283);
            ctx.fill();
          }
        }
      });
      // light from the left
      ctx.fillStyle = (() => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'rgba(255,240,210,0.16)');
        g.addColorStop(0.6, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,20,0.28)');
        return g;
      })();
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, rand, 4);
    },

    // The trail's waymark, with a transparent background.
    badge(ctx, w, h) {
      const c = w / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f6efe0';
      ctx.beginPath();
      ctx.arc(c, c, c - 6, 0, 6.283);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1d2a3a';
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c - 22, 0, 6.283);
      ctx.clip();
      ctx.fillStyle = '#f2a25c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fbe3a6';
      ctx.beginPath();
      ctx.arc(c + 30, c - 14, 26, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#566f7c';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.72);
      ctx.lineTo(w * 0.3, h * 0.36);
      ctx.lineTo(w * 0.48, h * 0.6);
      ctx.lineTo(w * 0.64, h * 0.42);
      ctx.lineTo(w, h * 0.8);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f6efe0';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * 0.36);
      ctx.lineTo(w * 0.36, h * 0.46);
      ctx.lineTo(w * 0.3, h * 0.44);
      ctx.lineTo(w * 0.25, h * 0.47);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1d2a3a';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.restore();
    },
  };

  const out = {};
  for (const [name, p] of Object.entries(pictures)) {
    const canvas = document.createElement('canvas');
    canvas.width = p.w;
    canvas.height = p.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    scenes[p.scene](ctx, p.w, p.h, rng(p.seed), p.look);
    let quality = 0.84,
      url;
    do {
      url = canvas.toDataURL(p.type, quality);
      quality -= 0.04;
    } while (p.budget && url.length * 0.75 > p.budget && quality > 0.3);
    out[name] = url;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The page. {{name}} is replaced by the data: URI of that picture.
// ---------------------------------------------------------------------------------------------
const PAGE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Six Days on the Northern Ridge</title>
<style>
  /* One rem is one hundredth of a 16:9 frame, so every slide keeps its proportions. */
  html {
    font-size: min(1vw, 1.7778vh);
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
    scrollbar-width: none;
  }

  html::-webkit-scrollbar { display: none; }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: #1d2a3a;
    background: #10151f;
  }

  h1, h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    margin: 0;
  }

  p { margin: 0; }

  .slide {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    scroll-snap-align: start;
  }

  .kicker {
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  /* 1. cover */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 6rem 7rem;
    color: #fff;
    background-color: #1a2238;
    background-image:
      linear-gradient(to top, rgba(8, 12, 24, 0.82), rgba(8, 12, 24, 0) 60%),
      url("{{ridge}}");
    background-size: cover;
    background-position: center;
  }

  .mark {
    position: absolute;
    top: 3.5rem;
    left: 7rem;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    font-size: 1.15rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .mark img { width: 5rem; height: 5rem; }

  .cover h1 { font-size: 8.2rem; line-height: 1; max-width: 62rem; }
  .cover .sub { margin-top: 2rem; font-size: 1.9rem; opacity: 0.9; }

  .hint {
    position: absolute;
    right: 7rem;
    bottom: 6.4rem;
    font-size: 1.05rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  /* 2. route */
  .route { display: flex; background: #f6efe0; }

  .route > img {
    width: 44%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 40%;
  }

  .route .text { flex: 1; padding: 4.6rem 6rem 0 5.5rem; }
  .route .kicker { color: #b4552d; }
  .route h2 { font-size: 3.6rem; line-height: 1.1; margin: 1rem 0 1.4rem; }
  .route .text > p { font-size: 1.55rem; line-height: 1.5; color: #4a5563; max-width: 40rem; }

  .days { list-style: none; margin: 2.2rem 0 0; padding: 0; font-size: 1.45rem; }

  .days li {
    display: flex;
    align-items: baseline;
    gap: 1.4rem;
    padding: 0.75rem 0;
    border-top: 0.07rem solid #d8cdb6;
  }

  .days b { width: 4.6rem; color: #b4552d; font-weight: 600; }
  .days span { margin-left: auto; color: #6b7480; font-variant-numeric: tabular-nums; }

  /* 3. coast grid */
  .coast { background: #10151f; color: #fff; padding: 4.5rem 6rem 5rem; display: flex; flex-direction: column; }
  .coast header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2.2rem; }
  .coast h2 { font-size: 4rem; }
  .coast header p { font-size: 1.4rem; color: #9aa6b8; }

  .mosaic {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 2fr 1fr 1.25fr;
    grid-template-rows: 1fr 1fr;
    gap: 1.2rem;
  }

  .mosaic figure { position: relative; margin: 0; overflow: hidden; border-radius: 0.6rem; min-height: 0; }
  .mosaic figure:nth-child(1) { grid-row: span 2; }
  .mosaic figure:nth-child(2) { grid-row: span 2; }
  .mosaic img { display: block; width: 100%; height: 100%; object-fit: cover; }

  .mosaic figcaption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 3rem 1.4rem 1.1rem;
    font-size: 1.15rem;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0));
  }

  /* 4. forest */
  .wood {
    color: #fff;
    background-color: #55704f;
    background-image: url("{{forest}}");
    background-size: cover;
    background-position: center;
  }

  .wood .panel {
    position: absolute;
    right: 6rem;
    bottom: 6rem;
    width: 38rem;
    padding: 3rem 3.2rem 3.2rem;
    border-radius: 0.8rem;
    background: rgba(16, 28, 20, 0.78);
  }

  .wood .kicker { color: #c9e3a8; }
  .wood h2 { font-size: 4.2rem; margin: 0.8rem 0 1.2rem; }
  .wood p { font-size: 1.5rem; line-height: 1.5; }

  /* 5. people */
  .people { display: flex; flex-direction: column; justify-content: center; background: #f6efe0; padding: 4rem 7rem 6rem; text-align: center; }
  .people .kicker { color: #b4552d; }
  .people h2 { font-size: 4.6rem; margin: 1rem 0 4.2rem; }

  .faces { display: flex; justify-content: space-between; }
  .faces div { width: 18rem; }

  .faces img {
    width: 15rem;
    height: 15rem;
    border-radius: 50%;
    object-fit: cover;
    object-position: 50% 28%;
    border: 0.45rem solid #fff;
    box-shadow: 0 1.2rem 2.4rem -1rem rgba(29, 42, 58, 0.55);
  }

  .faces h3 { margin: 1.8rem 0 0.4rem; font-size: 1.9rem; }
  .faces p { font-size: 1.35rem; line-height: 1.4; color: #5c6672; }

  /* 6. summit */
  .top { display: flex; align-items: center; gap: 6rem; padding: 5rem 7rem; background: #151a2e; color: #fff; }
  .top .text { flex: 1; }
  .top .kicker { color: #f2a25c; }
  .top h2 { font-size: 5.4rem; line-height: 1.05; margin: 1rem 0 1.6rem; }
  .top .text > p { font-size: 1.55rem; line-height: 1.5; color: #b9c0d4; max-width: 38rem; }

  .facts { display: flex; gap: 3.4rem; margin-top: 3.4rem; }
  .facts strong { display: block; font-family: Georgia, serif; font-weight: 400; font-size: 3.8rem; color: #fbd993; }
  .facts span { font-size: 1.2rem; color: #b9c0d4; }

  .top > img {
    width: 31rem;
    height: 46rem;
    object-fit: cover;
    object-position: 60% 50%;
    border-radius: 15.5rem 15.5rem 0.8rem 0.8rem;
  }

  /* 7. closing */
  .end {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #fff;
    background: #0a0f1c url("{{camp}}") center / cover no-repeat;
  }

  .end h2 { font-size: 7rem; }
  .end p { margin-top: 1.6rem; font-size: 1.7rem; max-width: 46rem; line-height: 1.5; }
  .end small { position: absolute; bottom: 4rem; font-size: 1.1rem; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.7; }

  /* side dots */
  .dots {
    position: fixed;
    right: 2rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    z-index: 5;
  }

  .dots a {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.45);
    box-shadow: 0 0 0 0.08rem rgba(0, 0, 0, 0.35);
  }

  .dots a.on { background: #f2a25c; transform: scale(1.4); }
</style>
</head>
<body>

<section class="slide cover" id="cover">
  <div class="mark"><img src="{{badge}}" alt="Northern Ridge Trail waymark">Northern Ridge Trail</div>
  <h1>Six Days on the Northern Ridge</h1>
  <p class="sub">A photo journal from the harbour wall to the summit hut. September 2025.</p>
  <div class="hint">Scroll or press &darr;</div>
</section>

<section class="slide route" id="route">
  <img src="{{lake}}" alt="Mirror Tarn at dawn, the far peaks reflected in still water">
  <div class="text">
    <p class="kicker">The route</p>
    <h2>92 kilometres, from sea level to 2,469 metres</h2>
    <p>The trail leaves Saltwick Harbour, follows the coast for two days, then turns inland through Alder Wood and climbs past Mirror Tarn to the ridge.</p>
    <ul class="days">
      <li><b>Day 1</b>Saltwick Harbour to Gull Point<span>14 km</span></li>
      <li><b>Day 2</b>Gull Point to Marram Dunes<span>17 km</span></li>
      <li><b>Day 3</b>Marram Dunes to Alder Wood<span>19 km</span></li>
      <li><b>Day 4</b>Alder Wood to Mirror Tarn<span>16 km</span></li>
      <li><b>Day 5</b>Mirror Tarn to Ridge Hut<span>15 km</span></li>
      <li><b>Day 6</b>Ridge Hut to the summit and down<span>11 km</span></li>
    </ul>
  </div>
</section>

<section class="slide coast" id="coast">
  <header>
    <h2>Days 1 and 2: the coast</h2>
    <p>31 km of sand, shingle and cliff path</p>
  </header>
  <div class="mosaic">
    <figure><img src="{{beach}}" alt="A wide empty beach with a line of foam"><figcaption>Low tide below Saltwick, 7 am</figcaption></figure>
    <figure><img src="{{lighthouse}}" alt="A red and white lighthouse on a headland"><figcaption>Gull Point light</figcaption></figure>
    <figure><img src="{{pebbles}}" alt="Wet pebbles in grey, ochre and white"><figcaption>Shingle at Kettle Cove</figcaption></figure>
    <figure><img src="{{dunes}}" alt="Sand dunes and grass in evening light"><figcaption>Marram Dunes, last light</figcaption></figure>
  </div>
</section>

<section class="slide wood" id="wood">
  <div class="panel">
    <p class="kicker">Day 3</p>
    <h2>Into Alder Wood</h2>
    <p>Nineteen kilometres under the trees. The mist stayed until noon, and for most of the morning the only sound was water dripping from the branches.</p>
  </div>
</section>

<section class="slide people" id="people">
  <p class="kicker">Company</p>
  <h2>The people we walked with</h2>
  <div class="faces">
    <div>
      <img src="{{portrait1}}" alt="Portrait of Marek">
      <h3>Marek Novak</h3>
      <p>Hut warden at Ridge Hut for eleven seasons</p>
    </div>
    <div>
      <img src="{{portrait2}}" alt="Portrait of Ingrid">
      <h3>Ingrid Solberg</h3>
      <p>Botanist, counting alpine gentians</p>
    </div>
    <div>
      <img src="{{portrait3}}" alt="Portrait of Kofi">
      <h3>Kofi Mensah</h3>
      <p>Walking the whole coast, day 41</p>
    </div>
    <div>
      <img src="{{portrait4}}" alt="Portrait of Ruth">
      <h3>Ruth Adler</h3>
      <p>Seventy-three, on her ninth crossing</p>
    </div>
  </div>
</section>

<section class="slide top" id="summit">
  <div class="text">
    <p class="kicker">Day 6</p>
    <h2>Summit morning</h2>
    <p>We left the hut by headtorch at four. The cloud stayed below us in the valleys, and the first light reached the cairn a few minutes after we did.</p>
    <div class="facts">
      <div><strong>2,469 m</strong><span>highest point of the trail</span></div>
      <div><strong>05:12</strong><span>sunrise</span></div>
      <div><strong>&minus;4 &deg;C</strong><span>at the hut door</span></div>
    </div>
  </div>
  <img src="{{summit}}" alt="A walker beside the summit cairn above a sea of cloud at sunrise">
</section>

<section class="slide end" id="end">
  <h2>Until next season</h2>
  <p>The trail closes with the first snow in October and opens again in June.</p>
  <small>Photographs and notes: the Thursday walking group</small>
</section>

<nav class="dots" aria-label="Slides">
  <a href="#cover" class="on"></a>
  <a href="#route"></a>
  <a href="#coast"></a>
  <a href="#wood"></a>
  <a href="#people"></a>
  <a href="#summit"></a>
  <a href="#end"></a>
</nav>

<script>
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dots a'));

  function nearest() {
    return Math.round(window.scrollY / window.innerHeight);
  }

  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides[i].scrollIntoView({ behavior: 'smooth' });
  }

  document.addEventListener('keydown', function (e) {
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].indexOf(e.key) !== -1) { e.preventDefault(); go(nearest() + 1); }
    if (['ArrowUp', 'ArrowLeft', 'PageUp'].indexOf(e.key) !== -1) { e.preventDefault(); go(nearest() - 1); }
    if (e.key === 'Home') go(0);
    if (e.key === 'End') go(slides.length - 1);
  });

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function (e) { e.preventDefault(); go(i); });
  });

  var watcher = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var i = slides.indexOf(entry.target);
      dots.forEach(function (dot, j) { dot.classList.toggle('on', i === j); });
    });
  }, { threshold: 0.6 });

  slides.forEach(function (slide) { watcher.observe(slide); });
</script>

</body>
</html>
`;

// ---------------------------------------------------------------------------------------------
const dumpAt = process.argv.indexOf('--dump');
const dumpDir = dumpAt === -1 ? null : process.argv[dumpAt + 1];

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto('about:blank');
const uris = await page.evaluate(paintAll, PICTURES);
await browser.close();

let total = 0;
for (const [name, uri] of Object.entries(uris)) {
  const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  total += bytes.length;
  console.log(
    `${name.padEnd(11)} ${PICTURES[name].w}x${PICTURES[name].h} ${uri.slice(5, uri.indexOf(';'))} ${bytes.length} bytes`,
  );
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(join(dumpDir, `${name}.${uri.slice(11, uri.indexOf(';'))}`), bytes);
  }
}

const html = PAGE.replace(/\{\{(\w+)\}\}/g, (_, name) => {
  if (!uris[name]) throw new Error(`no picture named ${name}`);
  return uris[name];
});
const target = join(here, 'photo-tour.html');
writeFileSync(target, html, 'utf8');
console.log(`pictures: ${total} bytes; ${target}: ${Buffer.byteLength(html)} bytes`);
