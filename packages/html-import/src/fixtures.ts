/**
 * Slides written as HTML, for the browser tests. Each exercises one thing the engine has to
 * get right; none is a format the engine knows (IMP-04). They use system fonts only, so the
 * tests need no font files.
 */

const SLIDE = 'position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box';

/** English, absolute layout, a gradient behind, a card with a shadow. */
export const englishAbsolute = `
<style>
  .slide { ${SLIDE}; background: linear-gradient(135deg, #0f172a, #1e3a8a); color: #fff; font-family: Arial, sans-serif; }
  h1 { position: absolute; left: 120px; top: 140px; margin: 0; font-size: 96px; line-height: 1.1; font-weight: 700; }
  p { position: absolute; left: 120px; top: 320px; width: 900px; margin: 0; font-size: 36px; line-height: 1.5; color: #cbd5e1; }
  .card { position: absolute; right: 120px; top: 300px; width: 520px; height: 360px; background: #fff; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,.35); }
  .card b { position: absolute; left: 40px; top: 40px; font-size: 120px; color: #1e3a8a; }
  .card span { position: absolute; left: 40px; bottom: 40px; font-size: 28px; color: #475569; }
</style>
<div class="slide">
  <h1>Quarterly results</h1>
  <p>Revenue grew by a third while costs stayed flat, and the new product line reached <em>break-even</em> two quarters early.</p>
  <div class="card"><b>87%</b><span>of customers renewed</span></div>
</div>`;

/** Hebrew, right to left, laid out with flex, written against the theme's variables. */
export const hebrewFlex = `
<style>
  .slide { ${SLIDE}; display: flex; flex-direction: column; justify-content: center; gap: 40px; padding: 120px 160px; font-family: var(--font-body); color: var(--color-text); background: var(--color-bg); }
  h1 { margin: 0; font-family: var(--font-heading); font-size: 72px; font-weight: 700; line-height: 1.1; color: var(--color-primary); }
  .lead { margin: 0; font-size: 36px; line-height: 1.5; color: var(--color-muted); max-width: 1200px; }
  ul { margin: 0; padding-inline-start: 48px; font-size: 32px; line-height: 1.6; }
  li { margin-bottom: 12px; }
  .tag { align-self: flex-start; padding: 12px 28px; border-radius: 999px; background: var(--color-primary); color: var(--color-bg); font-size: 26px; font-weight: 600; }
</style>
<div class="slide" data-archetype="textImage">
  <div class="tag">עדכון רבעוני</div>
  <h1 data-role="title">המטרות שלנו לשנה הבאה</h1>
  <p class="lead" data-role="subtitle">שלושה יעדים מרכזיים שיובילו את הצוות, עם דגש על איכות, מהירות ושיתוף פעולה בין הקבוצות.</p>
  <ul data-role="body">
    <li>השקת API חדש ל-production עד סוף הרבעון</li>
    <li>שיפור זמני התגובה ב-<b>40%</b></li>
    <li>הרחבת הצוות בחמישה מפתחים</li>
  </ul>
</div>`;

/** A grid of cards: borders, corners, inline SVG icons, text of mixed sizes. */
export const gridCards = `
<style>
  .slide { ${SLIDE}; padding: 100px 120px; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
  h2 { margin: 0 0 60px; font-size: 64px; line-height: 1.15; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
  .card { background: #ffffff; border: 2px solid #e2e8f0; border-radius: 20px; padding: 40px; }
  .card svg { width: 64px; height: 64px; color: #2563eb; }
  .card h3 { margin: 24px 0 12px; font-size: 36px; line-height: 1.2; }
  .card p { margin: 0; font-size: 26px; line-height: 1.5; color: #475569; }
  .dot { fill: #f59e0b; }
</style>
<div class="slide">
  <h2>How it works</h2>
  <div class="grid">
    <div class="card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      <h3>Plan</h3><p>Agree on the scope and the dates before anything is built.</p>
    </div>
    <div class="card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><circle class="dot" cx="12" cy="12" r="3" stroke="none"/></svg>
      <h3>Build</h3><p>Small steps, each one reviewed and measured.</p>
    </div>
    <div class="card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 18l6-6 4 4 6-8"/></svg>
      <h3>Ship</h3><p>Release, watch the numbers, and repeat.</p>
    </div>
  </div>
</div>`;

/** Gradients the model has shapes for, ones it has not, and text shown through one. */
export const gradients = `
<style>
  .slide { ${SLIDE}; background: #111827; font-family: Arial, sans-serif; }
  .box { position: absolute; width: 400px; height: 260px; border-radius: 16px; }
  .a { left: 120px; top: 120px; background: linear-gradient(to right, #ef4444, #f59e0b 40%, #10b981); }
  .b { left: 600px; top: 120px; background: radial-gradient(#60a5fa, #1e3a8a); }
  .c { left: 1080px; top: 120px; background: conic-gradient(from 90deg, #f472b6, #a78bfa, #60a5fa, #f472b6); border-radius: 50%; width: 260px; }
  .d { left: 120px; top: 460px; background: linear-gradient(to bottom right, rgba(255,255,255,.9), rgba(255,255,255,.1)); }
  .e { left: 600px; top: 460px; background: repeating-linear-gradient(45deg, #334155 0 20px, #475569 20px 40px); }
  .f { left: 1080px; top: 460px; background: radial-gradient(circle at 30% 30%, #fde68a, #b45309 70%); }
  h1 { position: absolute; left: 120px; top: 800px; margin: 0; font-size: 110px; line-height: 1.1; background: linear-gradient(90deg, #f472b6, #60a5fa); -webkit-background-clip: text; background-clip: text; color: transparent; }
</style>
<div class="slide">
  <div class="box a"></div><div class="box b"></div><div class="box c"></div>
  <div class="box d"></div><div class="box e"></div><div class="box f"></div>
  <h1>Gradient text</h1>
</div>`;

/** Images: a stored picture cropped by its box, rounded, with a border; a picture still to come. */
export const images = (png: string) => `
<style>
  .slide { ${SLIDE}; background: #fafaf9; font-family: Arial, sans-serif; color: #1c1917; }
  img { position: absolute; }
  .cover { left: 100px; top: 100px; width: 700px; height: 500px; object-fit: cover; border-radius: 28px; box-shadow: 0 16px 32px rgba(0,0,0,.25); }
  .contain { left: 900px; top: 100px; width: 400px; height: 500px; object-fit: contain; }
  .plain { left: 1400px; top: 100px; width: 400px; height: 250px; border: 6px solid #1c1917; }
  .round { left: 1400px; top: 420px; width: 240px; height: 240px; object-fit: cover; border-radius: 50%; }
  .pending { left: 100px; top: 700px; width: 500px; height: 280px; }
  .bg { position: absolute; left: 700px; top: 700px; width: 500px; height: 280px; background: url("${png}") center / cover no-repeat; border-radius: 12px; }
  figcaption { position: absolute; left: 1300px; top: 800px; font-size: 30px; }
</style>
<div class="slide">
  <img class="cover" src="${png}" alt="Team at work">
  <img class="contain" src="${png}">
  <img class="plain" src="${png}">
  <img class="round" src="${png}">
  <img class="pending" data-image-prompt="A lighthouse at dusk, flat illustration" data-name="hero-image">
  <div class="bg"></div>
  <figcaption>Six pictures, one file</figcaption>
</div>`;

/** A stage that scales itself down inside the slide, as decks that fit their window do. */
export const nestedScale = `
<style>
  .slide { ${SLIDE}; background: #0b1020; font-family: Arial, sans-serif; color: #e2e8f0; }
  .stage { position: absolute; left: 160px; top: 90px; width: 2000px; height: 1125px; transform: scale(0.8); transform-origin: 0 0; background: #111a33; }
  .stage h1 { position: absolute; left: 100px; top: 100px; margin: 0; font-size: 100px; line-height: 1.1; }
  .stage p { position: absolute; left: 100px; top: 300px; width: 1100px; margin: 0; font-size: 40px; line-height: 1.5; }
  .stage .chip { position: absolute; left: 100px; top: 700px; padding: 20px 40px; border: 3px solid #38bdf8; border-radius: 16px; font-size: 36px; color: #38bdf8; }
</style>
<div class="slide">
  <div class="stage">
    <h1>Scaled stage</h1>
    <p>Everything in here is drawn at eight tenths of its size, text and boxes alike, by one transform on the stage.</p>
    <div class="chip">0.8 of the size</div>
  </div>
</div>`;

/** z-index inside stacking contexts: the order on screen is not the order of the numbers. */
export const stacking = `
<style>
  .slide { ${SLIDE}; z-index: 0; background: #ffffff; font-family: Arial, sans-serif; }
  .layer { position: absolute; inset: 0; z-index: 0; }
  .back { position: absolute; left: 200px; top: 200px; width: 800px; height: 500px; background: #bfdbfe; z-index: 5; }
  .front { position: absolute; left: 500px; top: 350px; width: 800px; height: 500px; background: #1d4ed8; z-index: 1; opacity: 0.999; }
  .front .inner { position: absolute; left: 60px; top: 60px; width: 300px; height: 200px; background: #fbbf24; z-index: 100; }
  .under { position: absolute; left: 900px; top: 150px; width: 500px; height: 400px; background: #fecaca; z-index: -1; }
  .label { position: absolute; left: 560px; top: 640px; font-size: 48px; color: #fff; z-index: 2; margin: 0; }
  .plain { position: absolute; left: 1100px; top: 600px; width: 500px; height: 300px; background: #10b981; }
</style>
<div class="slide">
  <div class="layer"><div class="back"></div></div>
  <div class="front"><div class="inner"></div></div>
  <div class="under"></div>
  <p class="label">On top</p>
  <div class="plain"></div>
</div>`;

/** Content that is in the DOM and never on screen. */
export const hidden = `
<style>
  .slide { ${SLIDE}; background: #fff; font-family: Arial, sans-serif; font-size: 40px; padding: 100px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .none { display: none; }
  .invisible { visibility: hidden; }
  .invisible .back { visibility: visible; }
  .clear { opacity: 0; }
  .off { position: absolute; left: 3000px; top: 0; }
  p { margin: 0 0 30px; }
</style>
<div class="slide">
  <p>The only visible line</p>
  <span class="sr-only">Read by screen readers only</span>
  <p class="none">Not displayed</p>
  <p class="invisible">Invisible <span class="back">but this part shows</span></p>
  <p class="clear">Fully transparent</p>
  <p class="off">Off the slide</p>
</div>`;

/**
 * Pseudo-elements: generated text, and boxes that only CSS draws. The bar and the sheen are
 * placed by their own offsets; the slanted rule under the second heading is not.
 */
export const pseudo = `
<style>
  .slide { ${SLIDE}; background: #fff; font-family: Arial, sans-serif; color: #111; padding: 120px; }
  h1 { position: relative; margin: 0 0 80px; padding-inline-start: 40px; font-size: 80px; line-height: 1.1; }
  h1::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 12px; background: #dc2626; border-radius: 6px; }
  .step { margin: 0 0 24px; font-size: 40px; line-height: 1.4; }
  .step::before { content: "→ "; color: #dc2626; }
  blockquote { margin: 60px 0 0; font-size: 48px; line-height: 1.4; font-style: italic; }
  blockquote::after { content: " ”"; }
  .card { position: relative; overflow: hidden; width: 700px; margin: 60px 0 0; padding: 30px 40px; box-sizing: border-box; background: #f8fafc; border: 2px solid #94a3b8; border-radius: 16px; }
  .card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(37, 99, 235, 0.35), transparent); }
  .card p { margin: 0; font-size: 44px; line-height: 1.3; font-weight: 700; }
  h2 { position: relative; margin: 50px 0 0; padding-bottom: 24px; font-size: 44px; line-height: 1.2; }
  h2::after { content: ""; position: absolute; left: 4px; bottom: 0; width: 160px; height: 8px; background: #2563eb; transform: skewX(-30deg); }
</style>
<div class="slide">
  <h1>A bar drawn by CSS</h1>
  <p class="step">First do this</p>
  <p class="step">Then do that</p>
  <blockquote>Make it simple</blockquote>
  <div class="card"><p>Under a sheen</p></div>
  <h2>A slanted rule</h2>
</div>`;

/**
 * A font list that opens with a family that has no Hebrew: the browser draws the Hebrew
 * letters with the next family, and the digits and spaces with the first.
 */
export const fontList = `
<style>
  @font-face { font-family: "Fixture Latin"; src: local("Courier New"); unicode-range: U+0000-00FF; }
  .slide { ${SLIDE}; background: #fff; color: #111; padding: 120px; }
  p { margin: 0; direction: rtl; font-family: "Fixture Latin", Arial, sans-serif; font-size: 60px; line-height: 1.3; }
</style>
<div class="slide">
  <p>שלב 2 בתהליך</p>
</div>`;

/**
 * A pseudo-element over the content that no shape can draw (its layers are blended): the card
 * is one picture. The card beside it lifts its content above the same wash, and converts.
 */
export const pseudoOver = `
<style>
  .slide { ${SLIDE}; background: #fff; font-family: Arial, sans-serif; color: #111; padding: 120px; display: flex; gap: 80px; align-items: flex-start; }
  .card { position: relative; width: 600px; padding: 40px; box-sizing: border-box; background: #fef3c7; }
  .card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(#1d4ed8, #1d4ed8), linear-gradient(90deg, #fff, #000); background-blend-mode: multiply; opacity: 0.3; }
  .card p { margin: 0; font-size: 48px; line-height: 1.3; font-weight: 700; }
  .lifted p { position: relative; }
</style>
<div class="slide">
  <div class="card"><p>Washed over</p></div>
  <div class="card lifted"><p>Lifted above</p></div>
</div>`;

/** A table by its tags, and the same layout made of divs: both are tables to the browser. */
export const tables = `
<style>
  .slide { ${SLIDE}; background: #fff; font-family: Arial, sans-serif; color: #0f172a; padding: 80px 120px; }
  h2 { margin: 0 0 40px; font-size: 56px; line-height: 1.15; }
  table { border-collapse: collapse; width: 1200px; font-size: 28px; line-height: 1.3; }
  th { background: #1e3a8a; color: #fff; text-align: start; font-weight: 700; }
  th, td { padding: 16px 24px; border: 2px solid #cbd5e1; vertical-align: middle; }
  td.num { text-align: end; }
  .grid { display: table; border-collapse: collapse; margin-top: 60px; font-size: 26px; line-height: 1.3; }
  .row { display: table-row; }
  .cell { display: table-cell; padding: 14px 28px; border: 2px solid #94a3b8; }
</style>
<div class="slide">
  <h2>Two tables</h2>
  <table>
    <thead><tr><th>Region</th><th>Q1</th><th>Q2</th></tr></thead>
    <tbody>
      <tr><td>North</td><td class="num">1,200</td><td class="num">1,340</td></tr>
      <tr><td>South</td><td class="num">980</td><td class="num">1,105</td></tr>
      <tr><td colspan="2">Total for both regions</td><td class="num">2,445</td></tr>
    </tbody>
  </table>
  <div class="grid">
    <div class="row"><div class="cell">Plan</div><div class="cell">Free</div><div class="cell">Team</div></div>
    <div class="row"><div class="cell">Seats</div><div class="cell">3</div><div class="cell">50</div></div>
  </div>
</div>`;

/** The recommended conventions of SPEC 11.5, all on one slide. */
export const conventions = (assetId: string) => `
<style>
  .slide { ${SLIDE}; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); padding: 100px 120px; }
  h1 { margin: 0 0 40px; font-family: var(--font-heading); font-size: 72px; font-weight: 700; line-height: 1.1; }
  .row { display: flex; gap: 40px; align-items: flex-start; }
  .photo { width: 480px; height: 320px; object-fit: cover; border-radius: var(--radius); }
  .todo { width: 480px; height: 320px; }
  .chart { width: 520px; height: 320px; }
  .icon { font-size: 96px; color: var(--color-accent); }
  .widget { margin-top: 40px; padding: 24px; width: 600px; background: var(--color-surface); border-radius: 12px; font-size: 28px; }
  .cover { position: absolute; right: 120px; bottom: 100px; width: 360px; height: 200px; background-size: cover; background-position: center; background-repeat: no-repeat; }
</style>
<div class="slide" data-archetype="chart">
  <h1 data-role="title" data-name="headline" data-anim="fade">Conventions</h1>
  <div class="row">
    <img class="photo" data-asset="${assetId}" data-name="team-photo" data-role="image">
    <img class="todo" data-image-prompt="A paper plane over a city, flat style" data-name="pending-art">
    <div class="chart" data-name="sales" data-role="chart" data-chart='{"chartType":"column","data":{"categories":["Q1","Q2"],"series":[{"name":"Sales","values":[3,5]}]},"options":{"title":"Sales"}}'></div>
    <i class="icon" data-icon="lucide:rocket"></i>
  </div>
  <div class="widget" data-keep-html data-name="widget" data-anim="rise"><b>Kept</b> as written, <u>whatever</u> is inside.</div>
  <div class="cover" data-asset="${assetId}" data-name="cover"></div>
</div>`;

/** Theme variables next to literal values that happen to equal them. */
export const themeUse = `
<style>
  .slide { ${SLIDE}; background: var(--color-bg); font-family: var(--font-body); padding: 100px 120px; }
  .a { margin: 0 0 30px; font-size: 44px; line-height: 1.2; font-weight: 600; font-family: var(--font-heading); color: var(--color-primary); }
  .b { margin: 0 0 30px; font-size: 44px; line-height: 1.2; font-weight: 600; font-family: var(--font-heading); color: #2f5bea; }
  .c { margin: 0 0 30px; font-size: 30px; line-height: 1.45; color: var(--color-text); }
  .box { width: 400px; height: 120px; margin-bottom: 30px; }
  .linked { background: var(--color-surface); border: 3px solid var(--color-accent); }
  .literal { background: #f3f4f6; }
  .half { background: color-mix(in srgb, var(--color-secondary) 40%, transparent); }
</style>
<div class="slide">
  <p class="a">Linked to the theme</p>
  <p class="b">The same colour, written out</p>
  <p class="c">Body text exactly as the theme has it</p>
  <div class="box linked"></div>
  <div class="box literal"></div>
  <div class="box half"></div>
</div>`;

/** Glows the model has no shape for: in the theme's colours, and in the same colour written out. */
export const themeGlows = `
<style>
  .slide { ${SLIDE}; background: var(--color-bg); }
  .glow { position: absolute; width: 600px; height: 400px; }
  .themed { left: 100px; top: 100px; background: radial-gradient(circle, color-mix(in srgb, var(--color-primary) 35%, transparent) 0%, transparent 70%); }
  .literal { left: 800px; top: 100px; background: radial-gradient(circle, rgba(47, 91, 234, 0.35) 0%, transparent 70%); }
  .stacked { left: 100px; top: 600px; background: radial-gradient(circle at 20% 30%, var(--color-accent), transparent 60%), var(--color-surface); }
</style>
<div class="slide">
  <div class="glow themed"></div>
  <div class="glow literal"></div>
  <div class="glow stacked"></div>
</div>`;

/** CSS the model has no fields for: it has to arrive in `css`, and the keyframes on the slide. */
export const passthrough = `
<style>
  @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.08); } }
  .slide { ${SLIDE}; background: #1f2937; font-family: Arial, sans-serif; color: #f9fafb; }
  h1 { position: absolute; left: 120px; top: 120px; margin: 0; font-size: 90px; line-height: 1.1; text-shadow: 0 6px 18px rgba(0,0,0,.6); letter-spacing: 4px; text-transform: uppercase; }
  .blur { position: absolute; left: 1200px; top: 100px; width: 400px; height: 400px; border-radius: 50%; background: #f472b6; filter: blur(40px); }
  .blend { position: absolute; left: 1100px; top: 500px; width: 500px; height: 300px; background: #22d3ee; mix-blend-mode: screen; }
  .clip { position: absolute; left: 120px; top: 500px; width: 400px; height: 300px; background: #a78bfa; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .beat { position: absolute; left: 640px; top: 560px; width: 200px; height: 200px; background: #f59e0b; border-radius: 24px; animation: pulse 1s ease-in-out infinite alternate; }
  .tilt { position: absolute; left: 640px; top: 300px; margin: 0; font-size: 44px; transform: rotate(-8deg); }
  .sides { position: absolute; left: 120px; top: 860px; width: 700px; height: 100px; background: #374151; border-bottom: 8px solid #34d399; border-left: 8px solid #34d399; }
</style>
<div class="slide">
  <h1>Passthrough</h1>
  <div class="blur"></div><div class="blend"></div><div class="clip"></div><div class="beat"></div>
  <p class="tilt">Tilted eight degrees</p>
  <div class="sides"></div>
</div>`;

/**
 * A page of another size with something behind the slide, as an import session meets them:
 * a 1280x720 slide inside a page that paints its own background.
 */
export const foreignPage = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; }
  body { background: linear-gradient(#e0f2fe, #bae6fd); font-family: Arial, sans-serif; }
  .deck { position: absolute; left: 40px; top: 30px; }
  section { position: relative; width: 1280px; height: 720px; color: #0c4a6e; }
  section h1 { position: absolute; right: 80px; top: 80px; margin: 0; font-size: 64px; line-height: 1.2; }
  section p { position: absolute; right: 80px; top: 200px; width: 700px; margin: 0; font-size: 28px; line-height: 1.6; }
  section .note { position: absolute; left: 80px; bottom: 60px; padding: 18px 30px; background: #0c4a6e; color: #fff; border-radius: 12px; font-size: 24px; }
</style></head>
<body><div class="deck"><section>
  <h1>שקף מקובץ אחר</h1>
  <p>הטקסט הזה נכתב ב-1280 על 720, והרקע שמאחוריו שייך לעמוד ולא לשקף עצמו.</p>
  <div class="note">הערה בפינה</div>
</section></div></body></html>`;

/** One of each thing the fidelity guard has to tell apart: text in both directions, a card, a picture. */
export const guarded = (png: string) => `
<style>
  .slide { ${SLIDE}; background: #f1f5f9; font-family: Arial, sans-serif; color: #0f172a; }
  h1 { position: absolute; left: 120px; top: 100px; margin: 0; font-size: 80px; line-height: 1.15; }
  .text { position: absolute; left: 120px; top: 250px; width: 800px; margin: 0; font-size: 34px; line-height: 1.5; color: #334155; }
  .he { position: absolute; left: 120px; top: 560px; width: 800px; margin: 0; font-size: 36px; line-height: 1.5; direction: rtl; }
  .card { position: absolute; left: 1040px; top: 120px; width: 700px; height: 380px; background: #ffffff; border-radius: 24px; box-shadow: 0 18px 36px rgba(15, 23, 42, 0.25); }
  .card h2 { position: absolute; left: 48px; top: 40px; margin: 0; font-size: 44px; line-height: 1.2; }
  .card p { position: absolute; left: 48px; top: 120px; width: 600px; margin: 0; font-size: 28px; line-height: 1.5; color: #475569; }
  img { position: absolute; left: 1040px; top: 580px; width: 420px; height: 300px; object-fit: cover; border-radius: 16px; }
</style>
<div class="slide">
  <h1>What the guard sees</h1>
  <p class="text">A paragraph long enough to wrap onto a second line and then a third, so that a narrower box would break it somewhere else.</p>
  <p class="he">שורה בעברית עם מילה ב-English באמצע, ארוכה מספיק כדי להישבר לשתי שורות לפחות בתוך התיבה.</p>
  <div class="card"><h2>A card</h2><p>With a shadow under it and round corners around it.</p></div>
  <img src="${png}" alt="">
</div>`;

/** A slide as an import session meets it when the deck fits itself to the window. */
export const scaledPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #0f172a; }
  .stage { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; transform: scale(0.9); transform-origin: 0 0; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a; }
  .stage h1 { position: absolute; left: 80px; top: 70px; margin: 0; font-size: 60px; line-height: 1.2; }
  .stage p { position: absolute; left: 80px; top: 180px; width: 640px; margin: 0; font-size: 26px; line-height: 1.5; }
  .stage .card { position: absolute; left: 800px; top: 90px; width: 380px; height: 260px; background: #dbeafe; border-radius: 18px; }
</style></head>
<body><div class="stage">
  <h1>Fitted to the window</h1>
  <p>The stage is drawn at nine tenths of its size, so nothing in it lands on whole pixels.</p>
  <div class="card"></div>
</div></body></html>`;

/** A font the HTML brings itself. Named after a system font, so the tests need no font file. */
export const ownFont = `
<style>
  @font-face { font-family: "Fixture Mono"; src: local("Courier New"); }
  .slide { ${SLIDE}; background: #fff; }
  h1 { position: absolute; left: 120px; top: 120px; margin: 0; font: 700 80px/1.2 "Fixture Mono", serif; color: #111; }
</style>
<div class="slide"><h1>Set in its own font</h1></div>`;
