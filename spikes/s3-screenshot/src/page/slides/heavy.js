// Slide 4 - heavy slide: 100 absolutely positioned objects (56 text boxes, 34 shapes,
// 10 images), each an object wrapper with content inside, the way the editor lays out objects.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  'תכנית עבודה 2026',
  'Roadmap and milestones',
  'צמיחה של 24% ברבעון',
  'Customer feedback loop',
  'שלב ראשון: מחקר',
  'Design system tokens',
  'ביצועים: 60fps עם 100 אובייקטים',
  'Latency under 500 ms',
  'ייצוא ל-HTML ול-PDF',
  'Agent sees what the user sees',
  'גופנים: Heebo ו-Inter',
  'Q3 review · סיכום',
];

export const COUNTS = { text: 56, shape: 34, image: 10 };

export async function build(root) {
  const rand = rng(20261002);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const parts = [];
  const pos = (w, h) => {
    const left = Math.round(rand() * (1920 - w - 40) + 20);
    const top = Math.round(rand() * (1080 - h - 40) + 20);
    const rot = rand() < 0.3 ? Math.round((rand() - 0.5) * 24) : 0;
    return `left:${left}px;top:${top}px;width:${w}px;height:${h}px;${rot ? `transform:rotate(${rot}deg);` : ''}`;
  };

  for (let i = 0; i < COUNTS.shape; i++) {
    const w = Math.round(80 + rand() * 260);
    const h = Math.round(80 + rand() * 200);
    const hue = Math.round(rand() * 360);
    const kind = i % 3;
    const radius = kind === 0 ? '50%' : kind === 1 ? '22px' : '0';
    const fill =
      i % 2
        ? `linear-gradient(${Math.round(rand() * 360)}deg,hsl(${hue},80%,62%),hsl(${(hue + 60) % 360},85%,48%))`
        : `hsl(${hue},70%,72%)`;
    const shadow = i % 4 === 0 ? 'box-shadow:0 14px 34px rgba(15,23,42,.3);' : '';
    const border = i % 5 === 0 ? `border:4px solid hsl(${hue},60%,30%);box-sizing:border-box;` : '';
    parts.push(
      `<div class="obj" style="${pos(w, h)}opacity:${(0.55 + rand() * 0.45).toFixed(2)}">` +
        `<div class="shape" style="border-radius:${radius};background:${fill};${shadow}${border}"></div></div>`,
    );
  }
  for (let i = 0; i < COUNTS.image; i++) {
    const w = Math.round(200 + rand() * 180);
    const h = Math.round(140 + rand() * 120);
    const src = i === 0 ? '/assets/photo.jpg' : `/assets/thumb-${(i % 4) + 1}.jpg`;
    parts.push(
      `<div class="obj" style="${pos(w, h)}"><img class="pic" src="${src}" alt="" ` +
        `style="border-radius:${Math.round(rand() * 40)}px"></div>`,
    );
  }
  for (let i = 0; i < COUNTS.text; i++) {
    const size = Math.round(18 + rand() * 30);
    const text = TEXTS[i % TEXTS.length];
    const w = Math.round(size * 13 + rand() * 120);
    const h = Math.round(size * 1.9);
    const boxed = i % 3 === 0;
    const hue = Math.round(rand() * 360);
    const style =
      `font-size:${size}px;font-weight:${i % 2 ? 700 : 400};` +
      `font-family:${i % 4 === 3 ? "'Inter',sans-serif" : "'Heebo','Inter',sans-serif"};` +
      (boxed
        ? `background:hsl(${hue},85%,94%);color:hsl(${hue},70%,22%);border-radius:10px;padding:0 12px;`
        : `color:${pick(['#0f172a', '#1e3a8a', '#7c2d12', '#14532d', '#581c87'])};`);
    parts.push(`<div class="obj" style="${pos(w, h)}"><div class="txt" dir="auto" style="${style}">${text}</div></div>`);
  }

  root.innerHTML = `
<style>
  .s4 { position:absolute; inset:0; background:linear-gradient(180deg,#f8fafc,#e2e8f0); overflow:hidden; }
  .s4 .obj { position:absolute; }
  .s4 .shape { width:100%; height:100%; }
  .s4 .pic { width:100%; height:100%; object-fit:cover; display:block; box-shadow:0 8px 22px rgba(15,23,42,.3); }
  .s4 .txt { width:100%; height:100%; box-sizing:border-box; display:flex; align-items:center;
             white-space:nowrap; line-height:1.2; }
</style>
<div class="s4">${parts.join('')}</div>`;
}
