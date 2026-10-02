// Builds the two synthetic fixtures of spike S5. The third input is the real third-party file in
// /examples. Each fixture marks, shows and navigates slides in a different way on purpose.
//   node fixtures/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));

/** A photo-like PNG (smooth colour field with some grain) as a data URI. */
function photo(width, height, seed) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      const u = x / width, v = y / height;
      const hill = Math.sin(u * 5 + seed) * 0.5 + Math.cos(v * 4 - seed) * 0.5;
      const grain = (rnd() - 0.5) * 18;
      raw[o] = Math.max(0, Math.min(255, 40 + 150 * u + 40 * hill + grain));
      raw[o + 1] = Math.max(0, Math.min(255, 90 + 110 * v + 30 * hill + grain));
      raw[o + 2] = Math.max(0, Math.min(255, 170 - 90 * u * v + 50 * hill + grain));
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ---------------------------------------------------------------------------------------------
// Fixture 1: a hand-written Hebrew deck. One <section> per slide, CSS in <style>, a few lines of
// JS that show one slide at a time. Design size 1280x720.
const handwritten = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>תוכנית עבודה 2027</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #0b1020; font-family: "Segoe UI", Arial, sans-serif; display: grid; place-items: center; min-height: 100vh; }
  .deck { width: 1280px; height: 720px; position: relative; }
  .slide { position: absolute; inset: 0; display: none; padding: 64px 80px; background: #f7f5ef; color: #1b2440; overflow: hidden; }
  .slide.current { display: block; }
  h1 { font-size: 84px; line-height: 1.05; font-weight: 800; }
  h2 { font-size: 52px; font-weight: 700; margin-bottom: 28px; }
  p { font-size: 26px; line-height: 1.5; }
  .cover { background: linear-gradient(135deg, #1b2440 0%, #3b4fb8 55%, #19b4a6 100%); color: #fff; }
  .cover .tag { display: inline-block; font-size: 20px; letter-spacing: 2px; padding: 8px 18px; border: 2px solid rgba(255,255,255,.6); border-radius: 999px; margin-bottom: 40px; }
  .cover p { margin-top: 28px; font-size: 30px; opacity: .9; max-width: 760px; }
  ul.points { list-style: none; padding: 0; font-size: 30px; }
  ul.points li { padding: 16px 56px 16px 0; position: relative; border-bottom: 1px solid #d8d3c4; }
  ul.points li::before { content: ""; position: absolute; right: 8px; top: 28px; width: 20px; height: 20px; border-radius: 6px; background: #19b4a6; }
  .two { display: grid; grid-template-columns: 1fr 520px; gap: 48px; align-items: center; height: 480px; }
  .two img { width: 520px; height: 400px; object-fit: cover; border-radius: 24px; box-shadow: 0 24px 60px rgba(27,36,64,.3); }
  .stat { display: flex; align-items: baseline; gap: 24px; margin-top: 60px; }
  .stat b { font-size: 220px; line-height: 1; color: #3b4fb8; font-weight: 800; }
  .stat span { font-size: 40px; max-width: 420px; }
  table { border-collapse: collapse; width: 100%; font-size: 24px; }
  th { background: #1b2440; color: #fff; text-align: start; padding: 14px 20px; }
  td { padding: 14px 20px; border-bottom: 1px solid #d8d3c4; }
  tr:nth-child(even) td { background: #efece2; }
  .quote { background: #1b2440; color: #fff; display: none; }
  .quote.current { display: grid; place-items: center; text-align: center; }
  .quote blockquote { font-size: 54px; line-height: 1.3; font-weight: 600; max-width: 1000px; }
  .quote cite { display: block; margin-top: 32px; font-size: 26px; font-style: normal; color: #19b4a6; }
  .num { position: absolute; left: 32px; bottom: 24px; font-size: 18px; opacity: .5; }
</style>
</head>
<body>
<div class="deck">
  <section class="slide cover current">
    <span class="tag">תוכנית עבודה</span>
    <h1>מחלקת מוצר<br>יעדים לשנת 2027</h1>
    <p>שלושה מהלכים, רבעון אחר רבעון, עם מדדים ברורים לכל אחד.</p>
  </section>
  <section class="slide">
    <h2>שלושת המהלכים</h2>
    <ul class="points">
      <li>השקת גרסת Enterprise עם SSO והרשאות</li>
      <li>קיצור זמן ה-onboarding מ-14 ימים ל-3</li>
      <li>פתיחת API ציבורי לשותפים (REST + Webhooks)</li>
      <li>צמצום churn חודשי אל מתחת ל-1.5%</li>
    </ul>
    <span class="num">2</span>
  </section>
  <section class="slide">
    <h2>למה עכשיו</h2>
    <div class="two">
      <p>הלקוחות הגדולים שלנו מבקשים שליטה מרכזית בהרשאות כבר שנה. בלי Enterprise אנחנו מפסידים עסקאות של מעל <b>50 משתמשים</b>, והמתחרים כבר שם.</p>
      <img alt="נוף" src="${photo(260, 200, 3)}">
    </div>
    <span class="num">3</span>
  </section>
  <section class="slide">
    <h2>המדד המרכזי</h2>
    <div class="stat"><b>3×</b><span>גידול בהכנסה מלקוחות ארגוניים עד סוף השנה</span></div>
    <span class="num">4</span>
  </section>
  <section class="slide">
    <h2>לוח זמנים</h2>
    <table>
      <tr><th>רבעון</th><th>מהלך</th><th>בעלים</th><th>מדד</th></tr>
      <tr><td>Q1</td><td>SSO והרשאות</td><td>דנה</td><td>5 לקוחות בפיילוט</td></tr>
      <tr><td>Q2</td><td>Onboarding חדש</td><td>יואב</td><td>3 ימים בממוצע</td></tr>
      <tr><td>Q3</td><td>API ציבורי</td><td>מיכל</td><td>10 שותפים פעילים</td></tr>
      <tr><td>Q4</td><td>שימור</td><td>עמית</td><td>churn 1.5%</td></tr>
    </table>
    <span class="num">5</span>
  </section>
  <section class="slide quote">
    <div>
      <blockquote>"מוצר טוב הוא מוצר שהלקוח שוכח שהוא משתמש בו."</blockquote>
      <cite>ראש צוות מוצר</cite>
    </div>
  </section>
</div>
<script>
  var slides = document.querySelectorAll('.slide'), i = 0;
  function show(n) { slides[i].classList.remove('current'); i = Math.max(0, Math.min(slides.length - 1, n)); slides[i].classList.add('current'); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === ' ') show(i + 1);
    if (e.key === 'ArrowRight') show(i - 1);
  });
</script>
</body>
</html>
`;
writeFileSync(join(here, 'handwritten.html'), handwritten);

// ---------------------------------------------------------------------------------------------
// Fixture 2: reveal.js, single file. Horizontal and vertical slides, fragments, speaker notes,
// slide backgrounds set through data attributes, a code block and an image.
const revealDist = join(here, '..', 'node_modules', 'reveal.js', 'dist');
const css = (name) => readFileSync(join(revealDist, name), 'utf8');
const revealJs = readFileSync(join(revealDist, 'reveal.js'), 'utf8').replace(/<\/script>/g, '<\\/script>');

const reveal = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quarterly Platform Review</title>
<style>${css('reset.css')}</style>
<style>${css('reveal.css')}</style>
<style>${css('theme/white.css')}</style>
<style>
  .reveal h1, .reveal h2 { text-transform: none; }
  .kpis { display: flex; gap: 32px; justify-content: center; margin-top: 40px; }
  .kpi { flex: 1; background: #f1f5f9; border-radius: 16px; padding: 28px 16px; box-shadow: 0 8px 24px rgba(15,23,42,.12); }
  .kpi b { display: block; font-size: 72px; color: #2563eb; }
  .kpi span { font-size: 24px; color: #475569; }
  .split { display: flex; gap: 40px; align-items: center; text-align: left; }
  .split img { width: 420px; height: 300px; object-fit: cover; border-radius: 12px; }
  .reveal pre { font-size: 20px; }
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">
    <section data-background-gradient="linear-gradient(120deg, #0f172a, #1d4ed8)">
      <h1 style="color:#fff">Quarterly Platform Review</h1>
      <p style="color:#bfdbfe">Infrastructure group · Q3</p>
      <aside class="notes">Welcome everyone. Keep this one short: two minutes.</aside>
    </section>
    <section>
      <h2>Agenda</h2>
      <ul>
        <li class="fragment">Reliability numbers</li>
        <li class="fragment">Cost per request</li>
        <li class="fragment">Migration status</li>
        <li class="fragment">Asks for next quarter</li>
      </ul>
    </section>
    <section>
      <section>
        <h2>Reliability</h2>
        <div class="kpis">
          <div class="kpi"><b>99.97%</b><span>availability</span></div>
          <div class="kpi"><b>41 ms</b><span>p50 latency</span></div>
          <div class="kpi"><b>2</b><span>incidents</span></div>
        </div>
        <aside class="notes">Two incidents, both in August. Details on the next slide down.</aside>
      </section>
      <section>
        <h3>Incident detail</h3>
        <table>
          <thead><tr><th>Date</th><th>Duration</th><th>Root cause</th></tr></thead>
          <tbody>
            <tr><td>Aug 4</td><td>18 min</td><td>Expired certificate</td></tr>
            <tr><td>Aug 22</td><td>7 min</td><td>Bad config rollout</td></tr>
          </tbody>
        </table>
      </section>
    </section>
    <section>
      <h2>Cost per request</h2>
      <div class="split">
        <div>
          <p>Down <strong>23%</strong> since the move to ARM instances.</p>
          <p><small>Source: billing export, 90-day window.</small></p>
        </div>
        <img alt="Datacenter" src="${photo(210, 150, 7)}">
      </div>
    </section>
    <section>
      <h2>Migration status</h2>
      <pre><code>services migrated   38 / 52
traffic on new mesh  71%
rollback events      0</code></pre>
    </section>
    <section data-background-color="#0f172a">
      <h2 style="color:#fff">Asks</h2>
      <p style="color:#e2e8f0">Two more SREs, and a freeze on new regions until Q1.</p>
      <aside class="notes">This is the slide that matters. Leave time for questions.</aside>
    </section>
  </div>
</div>
<script>${revealJs}</script>
<script>Reveal.initialize({ hash: true, width: 1280, height: 720, transition: 'slide' });</script>
</body>
</html>
`;
writeFileSync(join(here, 'reveal.html'), reveal);
console.log(`handwritten.html ${(handwritten.length / 1024).toFixed(0)} KB, reveal.html ${(reveal.length / 1024).toFixed(0)} KB`);
