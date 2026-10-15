// The circuit board of the Shvav sample's pictures, in millimetres: a populated board of a smart
// water meter (an LQFP microcontroller with a LoRa radio, its crystal, flash, the front end of an
// ultrasonic flow sensor, the power stage, an LED, the antenna and its connector). The copper,
// the solder mask, the gold of the pads and the silkscreen are painted on canvases that serve as
// the colour, bump, roughness, metalness and clearcoat maps of the board's top; the parts are
// meshes. `shvav-board.html` (the macro shot) and `shvav-panel.html` (the production panel) use it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BOARD = { w: 64, h: 40, t: 1.6 };
const PX = 48; // canvas pixels a millimetre

const COLORS = {
  laminate: '#05241a', // the mask over bare laminate
  copper: '#0c4630', // the mask over copper
  silk: '#efece2',
  gold: '#e2b45e',
  solder: '#cfd3d2',
  hole: '#050806',
};

// ---------------------------------------------------------------------------------------------
// The parts and where they sit (board millimetres, origin at the top-left corner, y down)

const U1 = { x: 30, y: 21, body: 7, n: 12, pitch: 0.5 };
const PARTS = [
  { kind: 'lqfp', ref: 'U1', ...U1, mark: ['SV32-L4', 'LoRa SoC', '2648 A3'] },
  { kind: 'soic8', ref: 'U2', x: 15.5, y: 13, mark: ['25Q32', 'FLASH'] },
  { kind: 'qfn', ref: 'U3', x: 43, y: 28.5, size: 4, mark: ['TDC7', 'AFE'] },
  { kind: 'xtal', ref: 'Y1', x: 22, y: 12.2, w: 3.2, h: 1.5 },
  { kind: 'xtal', ref: 'Y2', x: 38.5, y: 13.5, w: 2.0, h: 1.6 },
  { kind: 'ind', ref: 'L1', x: 44.5, y: 12.5, w: 2.6, h: 2.1, mark: '4R7' },
  { kind: 'tant', ref: 'C9', x: 10.5, y: 31, w: 3.5, h: 2.8 },
  { kind: 'tant', ref: 'C10', x: 16, y: 31, w: 3.5, h: 2.8 },
  { kind: 'led', ref: 'D1', x: 38.6, y: 9.6 },
  { kind: 'jst', ref: 'J2', x: 3.6, y: 21 },
  { kind: 'ufl', ref: 'J3', x: 53, y: 30 },
  // Passives: [ref, x, y, rotation, size, kind]
  ...[
    ['C1', 24.6, 16.2, 0, '0402', 'cap'],
    ['C2', 35.4, 16.2, 0, '0402', 'cap'],
    ['C3', 24.6, 25.8, 0, '0402', 'cap'],
    ['C4', 35.4, 25.8, 0, '0402', 'cap'],
    ['C5', 22.4, 14.6, 0, '0402', 'cap'],
    ['C6', 22.4, 9.8, 0, '0402', 'cap'],
    ['C7', 37.6, 21, 90, '0402', 'cap'],
    ['C8', 40.8, 16.4, 0, '0603', 'cap'],
    ['R1', 19.6, 18.4, 90, '0402', 'res'],
    ['R2', 20.6, 21.6, 0, '0402', 'res'],
    ['R3', 20.6, 23.4, 0, '0402', 'res'],
    ['R4', 41.6, 9.6, 0, '0402', 'res'],
    ['R5', 39.6, 31.4, 90, '0402', 'res'],
    ['R6', 46.8, 25.2, 0, '0402', 'res'],
    ['C11', 46.8, 31.8, 0, '0402', 'cap'],
    ['C12', 39.8, 25.6, 90, '0402', 'cap'],
    ['C13', 44.6, 16.2, 0, '0603', 'cap'],
    ['C14', 48.4, 13.4, 90, '0603', 'cap'],
    ['C15', 13.2, 26.6, 0, '0603', 'cap'],
    ['R7', 9.6, 17.2, 90, '0402', 'res'],
    ['R8', 9.6, 24.8, 90, '0402', 'res'],
    ['C16', 27.6, 31.2, 0, '0402', 'cap'],
    ['C17', 32.4, 31.2, 0, '0402', 'cap'],
    ['R9', 50.2, 26.2, 90, '0402', 'res'],
    ['C18', 50.2, 33.6, 90, '0402', 'cap'],
  ].map(([ref, x, y, rot, size, kind]) => ({ kind: 'chip', ref, x, y, rot, size, part: kind })),
];

const CHIP = { '0402': [1.0, 0.5, 0.45], '0603': [1.6, 0.8, 0.6] };

/** The pins of the LQFP: where each leaves the body, and its outward direction. */
function lqfpPins({ x, y, body, n, pitch }) {
  const pins = [];
  const half = body / 2;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * pitch;
      // Counter-clockwise from pin 1 at the top of the left side.
      const [px, py, dx, dy] = [
        [x - half, y + o, -1, 0],
        [x + o, y + half, 0, 1],
        [x + half, y - o, 1, 0],
        [x - o, y - half, 0, -1],
      ][side];
      pins.push({ x: px, y: py, dx, dy, side, i });
    }
  }
  return pins;
}

// ---------------------------------------------------------------------------------------------
// The painted layers

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** The traces: polylines in millimetres, each with its width. Routed at 0 and 45 degrees. */
function routes() {
  const out = [];
  const rnd = seeded(7);
  // The fan-out of U1: every pin leaves outward, bends 45 degrees away from the middle of its
  // side, and ends at a via or runs on to a part.
  for (const p of lqfpPins(U1)) {
    if (rnd() < 0.18) continue;
    const o = p.i - (U1.n - 1) / 2;
    const lead = 1.6 + (Math.abs(o) % 2) * 0.5;
    const ax = p.x + p.dx * lead;
    const ay = p.y + p.dy * lead;
    const s = Math.sign(o) || 1;
    // Sideways, along the side, away from its middle.
    const sx = p.dx === 0 ? s : 0;
    const sy = p.dy === 0 ? (p.dx < 0 ? s : -s) : 0;
    const run = 0.6 + Math.abs(o) * 0.32;
    const bx = ax + p.dx * run + sx * run;
    const by = ay + p.dy * run + sy * run;
    const far = 0.8 + rnd() * 2.2;
    const cx = bx + p.dx * far;
    const cy = by + p.dy * far;
    out.push({
      pts: [
        [p.x + p.dx * 0.9, p.y + p.dy * 0.9],
        [ax, ay],
        [bx, by],
        [cx, cy],
      ],
      w: 0.2,
      via: true,
    });
  }
  // Longer runs: the flash, the crystal, the sensor front end, the radio to the antenna.
  out.push(
    {
      pts: [
        [19.4, 11.7],
        [21.2, 11.7],
        [23.2, 9.7],
        [26.5, 9.7],
        [28.4, 11.6],
        [28.4, 14.1],
      ],
      w: 0.2,
    },
    {
      pts: [
        [19.4, 12.4],
        [21, 12.4],
      ],
      w: 0.2,
    },
    {
      pts: [
        [19.4, 14.3],
        [20.2, 15.1],
        [24.4, 15.1],
        [26.1, 16.8],
      ],
      w: 0.2,
    },
    {
      pts: [
        [11.6, 13.6],
        [10.2, 13.6],
        [8.6, 15.2],
        [8.6, 26.6],
        [10.4, 28.4],
        [12, 28.4],
      ],
      w: 0.25,
    },
    {
      pts: [
        [11.6, 12.4],
        [9.8, 12.4],
        [7.4, 14.8],
        [7.4, 19.4],
        [6.4, 20.4],
      ],
      w: 0.2,
    },
    {
      pts: [
        [5.9, 21.6],
        [7.2, 22.9],
        [7.2, 28.6],
        [9.8, 31.2],
      ],
      w: 0.4,
    },
    {
      pts: [
        [5.9, 20.6],
        [12.6, 20.6],
        [14.6, 22.6],
        [21.4, 22.6],
      ],
      w: 0.2,
    },
    {
      pts: [
        [5.9, 19.6],
        [8.2, 17.3],
        [8.2, 16.1],
      ],
      w: 0.2,
    },
    {
      pts: [
        [37.4, 23.6],
        [41, 27.2],
        [41, 30.2],
      ],
      w: 0.2,
    },
    {
      pts: [
        [37.4, 24.2],
        [38.6, 25.4],
        [38.6, 33.2],
        [40.4, 35],
      ],
      w: 0.2,
    },
    {
      pts: [
        [45, 26.5],
        [45, 24.2],
        [47.2, 22],
        [52.2, 22],
        [55.4, 18.8],
      ],
      w: 0.2,
    },
    {
      pts: [
        [37.5, 18.2],
        [41.7, 14],
        [43.1, 14],
      ],
      w: 0.3,
    },
    {
      pts: [
        [46, 12.5],
        [48.4, 12.5],
        [48.4, 10.2],
        [50.6, 8],
      ],
      w: 0.3,
    },
    {
      pts: [
        [39.4, 9.6],
        [41.1, 9.6],
      ],
      w: 0.2,
    },
    {
      pts: [
        [42.1, 9.6],
        [44, 9.6],
        [45.6, 11.2],
      ],
      w: 0.2,
    },
    {
      pts: [
        [37.5, 19.2],
        [44.4, 19.2],
        [46.2, 21],
        [50.4, 21],
        [53, 23.6],
        [53, 28.6],
      ],
      w: 0.35,
    },
    {
      pts: [
        [17.6, 31],
        [24.4, 31],
        [26.2, 29.2],
        [26.2, 26.8],
      ],
      w: 0.5,
    },
    {
      pts: [
        [12.2, 31],
        [14.2, 31],
      ],
      w: 0.5,
    },
    {
      pts: [
        [33, 29.2],
        [33.8, 30],
        [36.6, 30],
        [38.6, 32],
        [38.6, 35.6],
      ],
      w: 0.2,
    },
    {
      pts: [
        [28.4, 28.4],
        [28.4, 34.2],
        [30.4, 36.2],
        [44, 36.2],
        [46.8, 33.4],
      ],
      w: 0.25,
    },
  );
  return out;
}

/** The meander of the antenna, at the far end of the board, kept clear of the ground pour. */
const ANTENNA = (() => {
  const pts = [
    [53, 28.6],
    [53, 26.6],
    [58.2, 26.6],
  ];
  let y = 26.6;
  let right = true;
  while (y > 6) {
    y -= 2.2;
    pts.push([right ? 60.6 : 58.2, y + 2.2], [right ? 60.6 : 58.2, y]);
    right = !right;
  }
  return pts;
})();

const VIAS = (() => {
  const rnd = seeded(31);
  const list = [];
  // Stitching vias in the ground pour, along the edges and between the parts.
  for (let x = 2.6; x < 51; x += 2.6) {
    list.push([x, 1.6], [x, 38.4]);
  }
  for (let y = 4.2; y < 37; y += 2.6) list.push([1.6, y], [51.6, y]);
  for (let i = 0; i < 26; i++) list.push([6 + rnd() * 44, 3 + rnd() * 34]);
  return list;
})();

const TESTPOINTS = [
  ['TP1', 24.5, 35.6],
  ['TP2', 20.5, 35.6],
  ['TP3', 47.6, 8.6],
  ['TP4', 7.4, 35],
];
const FIDUCIALS = [
  [6, 4],
  [58, 36.2],
  [6, 36.2],
];
const HOLES = [
  [2.8, 2.8],
  [61.2, 2.8],
  [2.8, 37.2],
  [61.2, 37.2],
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Strokes a route with round ends and joins. */
function polyline(g, pts, width) {
  g.lineWidth = width * PX;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * PX, y * PX) : g.moveTo(x * PX, y * PX)));
  g.stroke();
}

/** The pads every part sits on: [x, y, w, h] in millimetres. */
function padsOf(part) {
  const pads = [];
  if (part.kind === 'lqfp') {
    for (const p of lqfpPins(part)) {
      const len = 1.5;
      const cx = p.x + p.dx * 0.75;
      const cy = p.y + p.dy * 0.75;
      pads.push(p.dx ? [cx, cy, len, 0.28] : [cx, cy, 0.28, len]);
    }
  } else if (part.kind === 'soic8') {
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 1.27;
      pads.push([part.x - 2.9, part.y + o, 1.4, 0.6], [part.x + 2.9, part.y + o, 1.4, 0.6]);
    }
  } else if (part.kind === 'qfn') {
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * 0.5;
      const e = part.size / 2;
      pads.push([part.x - e, part.y + o, 0.7, 0.25], [part.x + e, part.y + o, 0.7, 0.25]);
      pads.push([part.x + o, part.y - e, 0.25, 0.7], [part.x + o, part.y + e, 0.25, 0.7]);
    }
  } else if (part.kind === 'chip') {
    const [l, w] = CHIP[part.size];
    const r = part.rot === 90;
    const d = l / 2;
    const pw = w * 1.15;
    const pl = l * 0.45;
    pads.push(r ? [part.x, part.y - d, pw, pl] : [part.x - d, part.y, pl, pw]);
    pads.push(r ? [part.x, part.y + d, pw, pl] : [part.x + d, part.y, pl, pw]);
  } else if (part.kind === 'xtal' || part.kind === 'ind' || part.kind === 'tant') {
    const d = part.w / 2;
    pads.push(
      [part.x - d, part.y, part.w * 0.3, part.h * 0.8],
      [part.x + d, part.y, part.w * 0.3, part.h * 0.8],
    );
  } else if (part.kind === 'led') {
    pads.push([part.x - 0.8, part.y, 0.8, 0.9], [part.x + 0.8, part.y, 0.8, 0.9]);
  } else if (part.kind === 'jst') {
    for (let i = 0; i < 4; i++) pads.push([part.x + 2.1, part.y + (i - 1.5) * 1, 1.4, 0.6]);
    pads.push([part.x - 1.2, part.y - 3.4, 1.8, 1.2], [part.x - 1.2, part.y + 3.4, 1.8, 1.2]);
  } else if (part.kind === 'ufl') {
    pads.push(
      [part.x, part.y - 1.2, 1.0, 0.8],
      [part.x - 1.3, part.y + 0.5, 0.6, 1.8],
      [part.x + 1.3, part.y + 0.5, 0.6, 1.8],
    );
  }
  return pads;
}

/** The silkscreen outline of a part and where its name goes. */
function silkOf(part) {
  const box = {
    lqfp: [part.body + 3.6, part.body + 3.6],
    soic8: [7.2, 5.4],
    qfn: [(part.size ?? 4) + 1.4, (part.size ?? 4) + 1.4],
    xtal: [(part.w ?? 0) + 1.2, (part.h ?? 0) + 1.0],
    ind: [(part.w ?? 0) + 1.0, (part.h ?? 0) + 1.0],
    tant: [(part.w ?? 0) + 1.2, (part.h ?? 0) + 0.9],
    led: [2.8, 1.5],
    jst: [6.6, 9.4],
    ufl: [3.4, 3.4],
  }[part.kind];
  return box;
}

/**
 * Paints the board's top: `color` (sRGB), `bump`, and `rm` with clearcoat in red, roughness in
 * green and metalness in blue.
 */
export async function paintBoard({ label = 'WM-10', rev = 'REV C' } = {}) {
  await document.fonts.load('600 40px "Space Grotesk"');
  await document.fonts.load('600 40px "JetBrains Mono"');
  const W = BOARD.w * PX;
  const H = BOARD.h * PX;
  const color = canvas(W, H);
  const bump = canvas(W, H);
  const rm = canvas(W, H);
  const c = color.getContext('2d');
  const b = bump.getContext('2d');
  const m = rm.getContext('2d');
  const traces = routes();
  const parts = PARTS;

  // Three passes that paint the same shapes into the three maps.
  const fill = (paint) => {
    // 1. The laminate under the mask, and the copper of the ground pour with its clearances.
    paint('laminate', (g) => g.fillRect(0, 0, W, H));
    paint('copper', (g) => {
      g.beginPath();
      g.roundRect(0.9 * PX, 0.9 * PX, (BOARD.w - 1.8) * PX, (BOARD.h - 1.8) * PX, 1.4 * PX);
      g.fill();
    });
    // The antenna's keep-out.
    paint('laminate', (g) => g.fillRect(54.4 * PX, 0.9 * PX, 8.7 * PX, (BOARD.h - 1.8) * PX));
    paint('laminate', (g) => {
      for (const t of traces) polyline(g, t.pts, t.w + 0.5);
      polyline(g, ANTENNA, 0.9);
      for (const part of parts)
        for (const [x, y, w, h] of padsOf(part))
          g.fillRect(
            (x - w / 2 - 0.25) * PX,
            (y - h / 2 - 0.25) * PX,
            (w + 0.5) * PX,
            (h + 0.5) * PX,
          );
      for (const [x, y] of [...FIDUCIALS, ...HOLES]) {
        g.beginPath();
        g.arc(x * PX, y * PX, 1.9 * PX, 0, Math.PI * 2);
        g.fill();
      }
    });
    // 2. The traces and the antenna.
    paint('copper', (g) => {
      for (const t of traces) polyline(g, t.pts, t.w);
      polyline(g, ANTENNA, 0.4);
    });
    // 3. Tented vias: a ring of copper and a dimple.
    paint('via', (g) => {
      const all = [...VIAS, ...traces.filter((t) => t.via).map((t) => t.pts.at(-1))];
      for (const [x, y] of all) {
        g.beginPath();
        g.arc(x * PX, y * PX, 0.32 * PX, 0, Math.PI * 2);
        g.fill();
      }
    });
    paint('hole', (g) => {
      const all = [...VIAS, ...traces.filter((t) => t.via).map((t) => t.pts.at(-1))];
      for (const [x, y] of all) {
        g.beginPath();
        g.arc(x * PX, y * PX, 0.13 * PX, 0, Math.PI * 2);
        g.fill();
      }
    });
    // 4. The pads: solder where a part sits, gold where nothing does.
    paint('solder', (g) => {
      for (const part of parts)
        for (const [x, y, w, h] of padsOf(part))
          g.fillRect((x - w / 2) * PX, (y - h / 2) * PX, w * PX, h * PX);
    });
    paint('gold', (g) => {
      for (const [, x, y] of TESTPOINTS) {
        g.beginPath();
        g.arc(x * PX, y * PX, 0.75 * PX, 0, Math.PI * 2);
        g.fill();
      }
      for (const [x, y] of FIDUCIALS) {
        g.beginPath();
        g.arc(x * PX, y * PX, 0.5 * PX, 0, Math.PI * 2);
        g.fill();
      }
      for (const [x, y] of HOLES) {
        g.beginPath();
        g.arc(x * PX, y * PX, 1.65 * PX, 0, Math.PI * 2);
        g.fill();
      }
      // The pads of the programming header, left unpopulated.
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc((29 + i * 1.27 * 1.6) * PX, 3.4 * PX, 0.5 * PX, 0, Math.PI * 2);
        g.fill();
      }
    });
    paint('hole', (g) => {
      for (const [x, y] of HOLES) {
        g.beginPath();
        g.arc(x * PX, y * PX, 1.1 * PX, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc((29 + i * 1.27 * 1.6) * PX, 3.4 * PX, 0.22 * PX, 0, Math.PI * 2);
        g.fill();
      }
    });
    // 5. The silkscreen.
    paint('silk', (g) => {
      g.lineWidth = 0.15 * PX;
      g.lineJoin = 'miter';
      for (const part of parts) {
        const box = silkOf(part);
        if (!box) continue;
        const [w, h] = box;
        const x0 = (part.x - w / 2) * PX;
        const y0 = (part.y - h / 2) * PX;
        if (part.kind === 'lqfp' || part.kind === 'qfn') {
          // Corner brackets, and a dot for pin 1.
          const k = 1.2 * PX;
          const [X, Y, WW, HH] = [x0, y0, w * PX, h * PX];
          g.beginPath();
          g.moveTo(X, Y + k);
          g.lineTo(X, Y);
          g.lineTo(X + k, Y);
          g.moveTo(X + WW - k, Y);
          g.lineTo(X + WW, Y);
          g.lineTo(X + WW, Y + k);
          g.moveTo(X + WW, Y + HH - k);
          g.lineTo(X + WW, Y + HH);
          g.lineTo(X + WW - k, Y + HH);
          g.moveTo(X + k, Y + HH);
          g.lineTo(X, Y + HH);
          g.lineTo(X, Y + HH - k);
          g.stroke();
          g.beginPath();
          g.arc(X - 0.6 * PX, Y - 0.6 * PX, 0.32 * PX, 0, Math.PI * 2);
          g.fill();
        } else if (part.kind !== 'chip') {
          g.strokeRect(x0, y0, w * PX, h * PX);
        }
      }
      // Polarity of the tantalum capacitors and the LED.
      for (const part of parts.filter((p) => p.kind === 'tant' || p.kind === 'led')) {
        const [w, h] = silkOf(part);
        g.fillRect((part.x - w / 2 - 0.6) * PX, (part.y - h / 2) * PX, 0.35 * PX, h * PX);
      }
      // Designators.
      g.font = `600 ${0.95 * PX}px "JetBrains Mono"`;
      g.textBaseline = 'middle';
      const name = (t, x, y, align = 'center') => {
        g.textAlign = align;
        g.fillText(t, x * PX, y * PX);
      };
      name('U1', 30, 15.6 - 0.6 - 0.2 - 3.6);
      name('U2', 15.5, 9.2);
      name('U3', 43, 32.4);
      name('Y1', 22, 10.4 - 2.2);
      name('Y2', 38.5, 11.6);
      name('L1', 44.5, 10.1);
      name('C9', 10.5, 33.6);
      name('C10', 16, 33.6);
      name('D1', 38.6, 8.0);
      name('R4', 41.6, 8.3);
      name('J2', 3.6, 15.4);
      name('J3', 53, 33.3);
      name('ANT1', 59.4, 31.6);
      for (const [n, x, y] of TESTPOINTS) name(n, x, y + 1.5);
      name('C1', 24.6, 17.3);
      name('C2', 35.4, 17.3);
      name('C3', 24.6, 24.7);
      name('C4', 35.4, 24.7);
      name('R1', 18.6, 18.4, 'right');
      name('C8', 40.8, 17.5);
      name('C13', 44.6, 17.3);
      // The board's own lettering.
      g.font = `700 ${1.6 * PX}px "Space Grotesk"`;
      g.textAlign = 'left';
      g.fillText(label, 6.4 * PX, 6.6 * PX);
      g.font = `600 ${0.95 * PX}px "JetBrains Mono"`;
      g.fillText(`${rev}  ·  2648`, 6.4 * PX, 8.5 * PX);
      g.fillText('1', 27.6 * PX, 3.4 * PX);
      g.save();
      g.translate(62.4 * PX, 20 * PX);
      g.rotate(-Math.PI / 2);
      g.textAlign = 'center';
      g.fillText('868 MHz', 0, 0);
      g.restore();
      // A small logo: a drop in a circle.
      g.lineWidth = 0.18 * PX;
      g.beginPath();
      g.arc(4.2 * PX, 7.4 * PX, 1.2 * PX, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(4.2 * PX, 6.6 * PX);
      g.quadraticCurveTo(4.95 * PX, 7.6 * PX, 4.2 * PX, 8.15 * PX);
      g.quadraticCurveTo(3.45 * PX, 7.6 * PX, 4.2 * PX, 6.6 * PX);
      g.fill();
    });
  };

  // Each layer: [colour, bump grey, clearcoat, roughness, metalness]
  const LAYERS = {
    laminate: [COLORS.laminate, 0, 1, 0.34, 0],
    copper: [COLORS.copper, 70, 1, 0.3, 0],
    via: ['#125a3b', 120, 1, 0.3, 0],
    hole: [COLORS.hole, 0, 0, 0.9, 0],
    solder: [COLORS.solder, 150, 0, 0.22, 1],
    gold: [COLORS.gold, 150, 0, 0.24, 1],
    silk: [COLORS.silk, 120, 0, 0.75, 0],
  };
  const grey = (v) => `rgb(${v},${v},${v})`;
  fill((layer, draw) => {
    const [col, bmp, cc, rough, metal] = LAYERS[layer];
    c.fillStyle = c.strokeStyle = col;
    draw(c);
    b.fillStyle = b.strokeStyle = grey(bmp);
    draw(b);
    m.fillStyle =
      m.strokeStyle = `rgb(${Math.round(cc * 255)},${Math.round(rough * 255)},${Math.round(metal * 255)})`;
    draw(m);
  });
  // A faint mottle in the mask, as a real one has.
  const rnd = seeded(5);
  c.globalAlpha = 0.03;
  for (let i = 0; i < 900; i++) {
    c.fillStyle = rnd() > 0.5 ? '#000000' : '#2a7a52';
    c.beginPath();
    c.arc(rnd() * W, rnd() * H, (0.4 + rnd() * 2.2) * PX, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // Soften the bump a little, so the copper under the mask reads as a rounded ridge.
  const soft = canvas(W, H);
  const s = soft.getContext('2d');
  s.filter = `blur(${0.06 * PX}px)`;
  s.drawImage(bump, 0, 0);

  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { color: tex(color, true), bump: tex(soft, false), rm: tex(rm, false) };
}

// ---------------------------------------------------------------------------------------------
// The parts as meshes

function markTexture(
  lines,
  {
    size = 512,
    ratio = 1,
    ink = '#646b67',
    ground = '#151816',
    font = 'JetBrains Mono',
    scale = 1,
  } = {},
) {
  const cv = canvas(size, Math.round(size / ratio));
  const g = cv.getContext('2d');
  g.fillStyle = ground;
  g.fillRect(0, 0, cv.width, cv.height);
  // A grain in the moulding compound.
  const rnd = seeded(lines.join('').length + 3);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    g.fillRect(rnd() * cv.width, rnd() * cv.height, 2, 2);
  }
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = (cv.height / (lines.length + 1.4)) * 0.9;
  lines.forEach((line, i) => {
    g.font = `${i === 0 ? 700 : 500} ${(i === 0 ? 0.15 : 0.105) * size * scale}px "${font}"`;
    g.fillText(line, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * step);
  });
  // The dimple of pin 1.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(cv.width * 0.14, cv.height * 0.14, size * 0.045, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function materials() {
  return {
    epoxy: new THREE.MeshPhysicalMaterial({
      color: '#16191a',
      roughness: 0.55,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
    }),
    tin: new THREE.MeshStandardMaterial({ color: '#d4d8d8', metalness: 1, roughness: 0.28 }),
    solder: new THREE.MeshStandardMaterial({ color: '#dfe2e2', metalness: 1, roughness: 0.16 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e7b85c', metalness: 1, roughness: 0.25 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#8e7454', roughness: 0.6 }),
    resistor: new THREE.MeshStandardMaterial({ color: '#141515', roughness: 0.5 }),
    resistorSide: new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.6 }),
    ferrite: new THREE.MeshStandardMaterial({ color: '#3b3f40', roughness: 0.5, metalness: 0.2 }),
    tantalum: new THREE.MeshPhysicalMaterial({ color: '#e8a21f', roughness: 0.42, clearcoat: 0.4 }),
    stripe: new THREE.MeshStandardMaterial({ color: '#6a3c0c', roughness: 0.5 }),
    housing: new THREE.MeshStandardMaterial({ color: '#e9dfc9', roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: '#0b0d0c', roughness: 0.8 }),
    ledBody: new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.4 }),
    ledLens: new THREE.MeshPhysicalMaterial({
      color: '#ffd9c4',
      emissive: '#ff6a3a',
      emissiveIntensity: 30,
      roughness: 0.15,
      transmission: 0.2,
    }),
    edge: new THREE.MeshStandardMaterial({ color: '#5f6a3c', roughness: 0.7 }),
  };
}

/** A leg of a gull-wing package, along +x from the body's edge, 0.22 wide. */
function gullWing() {
  const t = 0.14;
  const w = 0.22;
  const part = (len, x, y, rz) => {
    const g = new THREE.BoxGeometry(len, t, w);
    g.translate(len / 2, 0, 0);
    g.rotateZ(rz);
    g.translate(x, y, 0);
    return g;
  };
  return mergeGeometries([
    part(0.32, 0, 0.62, 0),
    part(0.62, 0.3, 0.62, -1.05),
    part(0.6, 0.6, 0.08, 0),
  ]);
}

/** One placed part: its meshes, in board millimetres (y down on the board is +z). */
export function partMeshes(part, M, cache = {}) {
  const g = new THREE.Group();
  const at = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (part.kind === 'lqfp' || part.kind === 'soic8') {
    const lq = part.kind === 'lqfp';
    const bw = lq ? part.body : 4.9;
    const bd = lq ? part.body : 3.9;
    const top = (cache[`mark_${part.ref}`] ??= markTexture(part.mark, {
      ratio: bw / bd,
      scale: lq ? 1 : 1.25,
    }));
    const mats = [
      M.epoxy,
      M.epoxy,
      new THREE.MeshPhysicalMaterial({ map: top, roughness: 0.6, clearcoat: 0.1 }),
      M.epoxy,
      M.epoxy,
      M.epoxy,
    ];
    at(new THREE.Mesh(new RoundedBoxGeometry(bw, 1.4, bd, 2, 0.12), mats), 0, 0.8, 0);
    const leg = (cache.leg ??= gullWing());
    const pins = lq
      ? lqfpPins({ ...part, x: 0, y: 0 })
      : [0, 1, 2, 3].flatMap((i) => [
          { x: -bw / 2, y: (i - 1.5) * 1.27, dx: -1, dy: 0 },
          { x: bw / 2, y: (i - 1.5) * 1.27, dx: 1, dy: 0 },
        ]);
    for (const p of pins) {
      const m = at(new THREE.Mesh(leg, M.tin), p.x, 0, p.y);
      m.rotation.y = -Math.atan2(p.dy, p.dx);
    }
  } else if (part.kind === 'qfn') {
    const top = (cache[`mark_${part.ref}`] ??= markTexture(part.mark, { scale: 1.2 }));
    const mats = [
      M.epoxy,
      M.epoxy,
      new THREE.MeshPhysicalMaterial({ map: top, roughness: 0.6 }),
      M.epoxy,
      M.epoxy,
      M.epoxy,
    ];
    at(
      new THREE.Mesh(new RoundedBoxGeometry(part.size, 0.85, part.size, 2, 0.06), mats),
      0,
      0.45,
      0,
    );
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * 0.5;
      const e = part.size / 2;
      for (const [x, z, w, d] of [
        [-e, o, 0.5, 0.24],
        [e, o, 0.5, 0.24],
        [o, -e, 0.24, 0.5],
        [o, e, 0.24, 0.5],
      ]) {
        at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), M.solder), x, 0.06, z);
      }
    }
  } else if (part.kind === 'chip') {
    const [l, w, h] = CHIP[part.size];
    const cap = part.part === 'cap';
    const end = l * 0.22;
    at(
      new THREE.Mesh(
        new RoundedBoxGeometry(l - end * 2 + 0.02, h, w, 1, 0.04),
        cap ? M.ceramic : M.resistorSide,
      ),
      0,
      h / 2 + 0.03,
      0,
    );
    if (!cap)
      at(
        new THREE.Mesh(new THREE.BoxGeometry(l - end * 2, 0.02, w * 0.96), M.resistor),
        0,
        h + 0.04,
        0,
      );
    for (const s of [-1, 1]) {
      at(
        new THREE.Mesh(new RoundedBoxGeometry(end, h + 0.02, w + 0.02, 1, 0.05), M.tin),
        s * (l / 2 - end / 2),
        h / 2 + 0.03,
        0,
      );
      // The fillet of solder, out onto the pad.
      const f = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, h * 0.55, w * 1.02, 3, 1),
        M.solder,
      );
      f.rotation.x = Math.PI / 2;
      f.rotation.y = s > 0 ? 0 : Math.PI;
      at(f, s * (l / 2 + 0.02), 0.06, 0).scale.set(0.5, 1, 0.35);
    }
    g.rotation.y = part.rot === 90 ? Math.PI / 2 : 0;
  } else if (part.kind === 'xtal') {
    at(new THREE.Mesh(new RoundedBoxGeometry(part.w, 0.3, part.h, 1, 0.05), M.ceramic), 0, 0.15, 0);
    at(
      new THREE.Mesh(new RoundedBoxGeometry(part.w * 0.9, 0.5, part.h * 0.86, 2, 0.12), M.tin),
      0,
      0.45,
      0,
    );
  } else if (part.kind === 'ind') {
    const top = (cache[`mark_${part.ref}`] ??= markTexture([part.mark], {
      ground: '#3a3e3f',
      ink: '#c9cbc6',
      ratio: part.w / part.h,
    }));
    const mats = [
      M.ferrite,
      M.ferrite,
      new THREE.MeshStandardMaterial({ map: top, roughness: 0.5 }),
      M.ferrite,
      M.ferrite,
      M.ferrite,
    ];
    at(new THREE.Mesh(new RoundedBoxGeometry(part.w, 1.2, part.h, 2, 0.15), mats), 0, 0.62, 0);
  } else if (part.kind === 'tant') {
    at(
      new THREE.Mesh(new RoundedBoxGeometry(part.w * 0.82, 1.7, part.h, 2, 0.25), M.tantalum),
      0,
      0.86,
      0,
    );
    at(
      new THREE.Mesh(new THREE.BoxGeometry(part.w * 0.16, 0.02, part.h * 0.86), M.stripe),
      -part.w * 0.26,
      1.72,
      0,
    );
    for (const s of [-1, 1])
      at(
        new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, part.h * 0.6), M.tin),
        s * part.w * 0.43,
        0.45,
        0,
      );
  } else if (part.kind === 'led') {
    at(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.35, 0.8, 1, 0.05), M.ledBody), 0, 0.2, 0);
    for (const s of [-1, 1])
      at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.82), M.tin), s * 0.68, 0.2, 0);
    at(new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.36, 0.72, 2, 0.14), M.ledLens), 0, 0.52, 0);
  } else if (part.kind === 'jst') {
    at(new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.9, 6.2, 2, 0.12), M.housing), -0.4, 1.45, 0);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 5.0), M.dark), -2.52, 1.4, 0);
    for (let i = 0; i < 4; i++)
      at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.3), M.tin), 2.0, 0.08, (i - 1.5) * 1);
    for (const s of [-1, 1])
      at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.15), M.tin), -1.2, 0.7, s * 3.3);
  } else if (part.kind === 'ufl') {
    at(new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.4, 2.6, 1, 0.08), M.housing), 0, 0.2, 0);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.85, 40, 1, true), M.gold);
    at(ring, 0, 0.6, 0);
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), M.gold), 0, 0.5, 0);
    for (const s of [-1, 1])
      at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 1.8), M.tin), s * 1.3, 0.08, 0.5);
  }
  return g;
}

/** The board: the textured slab and every part on it, centred on the origin, top at y = 0. */
export async function buildBoard(options = {}) {
  const maps = options.maps ?? (await paintBoard(options));
  const M = options.materials ?? materials();
  const top = new THREE.MeshPhysicalMaterial({
    map: maps.color,
    bumpMap: maps.bump,
    bumpScale: 1.6,
    roughnessMap: maps.rm,
    metalnessMap: maps.rm,
    clearcoatMap: maps.rm,
    roughness: 1,
    metalness: 1,
    clearcoat: options.clearcoat ?? 0.4,
    clearcoatRoughness: 0.24,
  });
  const board = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.t, BOARD.h), [
    M.edge,
    M.edge,
    top,
    M.edge,
    M.edge,
    M.edge,
  ]);
  slab.position.y = -BOARD.t / 2;
  slab.receiveShadow = true;
  board.add(slab);
  const cache = options.cache ?? {};
  for (const part of PARTS) {
    const g = partMeshes(part, M, cache);
    g.position.set(part.x - BOARD.w / 2, 0, part.y - BOARD.h / 2);
    board.add(g);
  }
  return { board, maps, materials: M, cache };
}
