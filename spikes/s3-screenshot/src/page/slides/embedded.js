// Slide 3 - embedded content (RND-06): Shadow DOM subtrees with their own stylesheets
// (script-free HTML objects), sandboxed iframes (script-bearing HTML objects), canvas, video,
// and an image from a blob: URL.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const once = (el, ev, ms = 4000) =>
  Promise.race([
    new Promise((resolve) => el.addEventListener(ev, () => resolve(ev), { once: true })),
    wait(ms).then(() => 'timeout'),
  ]);

const shadowCss = (bg, font) => `
  :host { display:block; width:300px; padding:18px; box-sizing:border-box; border-radius:16px;
          background:${bg}; font-family:${font}; color:#1e1b4b; direction:rtl; }
  h3 { margin:0 0 8px; font-size:32px; font-weight:500; line-height:1.2; }
  p { margin:0 0 12px; font-size:21px; line-height:1.45; }
  .tag { display:inline-block; padding:4px 14px; border-radius:999px; background:var(--color-accent);
         color:#fff; font:600 17px 'Inter',sans-serif; direction:ltr; }
  img { display:block; width:100%; height:110px; object-fit:cover; border-radius:10px; margin-top:12px; }
`;

const shadowHtml = (title) => `
  <h3>${title}</h3>
  <p>פסקה עם סגנון פנימי, mixed English 123.</p>
  <span class="tag">var(--color-accent)</span>
  <img src="/assets/thumb-1.jpg" alt="">`;

const sandboxDoc = `<!doctype html><html><head><style>
  body { margin:0; padding:14px; font-family:'Segoe UI',Arial,sans-serif; background:#fef9c3; color:#422006; }
  h3 { margin:0 0 6px; font-size:24px; color:#a16207; }
  #o { font-size:18px; margin-bottom:8px; }
  .bar { height:22px; margin:6px 0; border-radius:6px; background:#ca8a04; }
</style></head><body>
  <h3>Sandboxed iframe</h3>
  <div id="o">script has not run</div>
  <div id="bars"></div>
  <canvas id="c" width="250" height="110"></canvas>
  <script>
    document.getElementById('o').textContent = 'script ran: 6 x 7 = ' + (6 * 7);
    var bars = document.getElementById('bars');
    [90, 60, 75].forEach(function (w) {
      var b = document.createElement('div'); b.className = 'bar'; b.style.width = w + '%'; bars.appendChild(b);
    });
    var g = document.getElementById('c').getContext('2d');
    g.fillStyle = '#1d4ed8'; g.fillRect(0, 0, 250, 110);
    g.fillStyle = '#fde047'; g.beginPath(); g.arc(125, 55, 40, 0, Math.PI * 2); g.fill();
  </script>
</body></html>`;

const sameOriginDoc = `<!doctype html><html><head><style>
  body { margin:0; padding:14px; font-family:'Segoe UI',Arial,sans-serif; background:#dcfce7; color:#14532d; }
  h3 { margin:0 0 6px; font-size:24px; color:#15803d; }
  p { font-size:18px; margin:0 0 10px; }
  .pill { display:inline-block; padding:6px 14px; border-radius:999px; background:#16a34a; color:#fff; font-weight:600; }
  .box { margin-top:14px; height:120px; border-radius:12px; background:linear-gradient(135deg,#22c55e,#0ea5e9); }
</style></head><body>
  <h3>Same-origin iframe</h3>
  <p>Static content with its own stylesheet.</p>
  <span class="pill">no sandbox</span>
  <div class="box"></div>
</body></html>`;

function attachShadow(host, mode, css, html, adopted) {
  const sr = host.attachShadow({ mode });
  if (adopted) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sr.adoptedStyleSheets = [sheet];
    sr.innerHTML = html;
  } else {
    sr.innerHTML = `<style>${css}</style>${html}`;
  }
  return sr;
}

export async function build(root) {
  const notes = {};
  root.innerHTML = `
<style>
  .s3 { position:absolute; inset:0; padding:40px; box-sizing:border-box; display:grid;
        grid-template-columns:repeat(5, 1fr); grid-template-rows:repeat(2, 1fr); gap:20px;
        background:#eef2f7; font-family:'Inter','Heebo',sans-serif; color:#111827; }
  .s3 .cell { position:relative; background:#fff; border:1px solid #cbd5e1; border-radius:14px;
              overflow:hidden; }
  .s3 .lbl { position:absolute; left:12px; top:8px; right:8px; font:600 17px/1.2 'Inter',sans-serif;
             color:#475569; z-index:5; }
  .s3 .demo { position:absolute; inset:36px 0 0 0; display:flex; flex-direction:column;
              align-items:center; justify-content:center; gap:14px; }
  .s3 iframe { width:300px; height:380px; border:2px solid #94a3b8; border-radius:10px; background:#fff; }
  .s3 canvas.draw { width:300px; height:300px; border-radius:12px; }
  .s3 video { width:300px; height:169px; border-radius:12px; background:#000; }
  .s3 .blobimg { width:300px; height:300px; object-fit:cover; border-radius:50%;
                 border:8px solid #fff; box-shadow:0 10px 30px rgba(15,23,42,.35); }
  .s3 .leak-probe { margin:0; width:300px; font:400 22px/1.4 'Inter',sans-serif; color:#111827; }
</style>
<div class="s3">
  <div class="cell"><div class="lbl">Shadow DOM (open) + &lt;style&gt;, font used only here</div>
    <div class="demo" data-feature="shadow-open-style"><div id="s3h1"></div></div></div>
  <div class="cell"><div class="lbl">Shadow DOM (open) + adoptedStyleSheets</div>
    <div class="demo" data-feature="shadow-open-adopted"><div id="s3h2"></div></div></div>
  <div class="cell"><div class="lbl">Shadow DOM (closed)</div>
    <div class="demo" data-feature="shadow-closed"><div id="s3h3"></div></div></div>
  <div class="cell"><div class="lbl">Shadow style isolation (!important)</div>
    <div class="demo" data-feature="shadow-style-isolation">
      <p class="leak-probe">Light DOM text: must stay plain black</p>
      <div id="s3h4"></div></div></div>
  <div class="cell"><div class="lbl">Image from blob: URL</div>
    <div class="demo" data-feature="blob-url-image"><img class="blobimg" id="s3blob" alt=""></div></div>
  <div class="cell"><div class="lbl">iframe srcdoc, sandbox="allow-scripts"</div>
    <div class="demo" data-feature="iframe-sandboxed"><iframe id="s3if1" sandbox="allow-scripts"></iframe></div></div>
  <div class="cell"><div class="lbl">iframe srcdoc, same-origin</div>
    <div class="demo" data-feature="iframe-same-origin"><iframe id="s3if2"></iframe></div></div>
  <div class="cell"><div class="lbl">&lt;canvas&gt; 2D drawing</div>
    <div class="demo" data-feature="canvas-2d"><canvas class="draw" id="s3canvas" width="600" height="600"></canvas></div></div>
  <div class="cell"><div class="lbl">&lt;video&gt; first frame / poster</div>
    <div class="demo">
      <div data-feature="video-first-frame" data-crop="self"><video id="s3v1" muted playsinline preload="auto"></video></div>
      <div data-feature="video-poster" data-crop="self"><video id="s3v2" muted playsinline preload="none" poster="/assets/poster.png"></video></div>
    </div></div>
  <div class="cell"><div class="lbl">&lt;video&gt; poster only (no src)</div>
    <div class="demo" data-feature="video-poster-no-src"><video id="s3v3" poster="/assets/poster.png"></video></div></div>
</div>`;

  const $ = (id) => root.querySelector('#' + id);

  // Shadow DOM hosts.
  const s1 = attachShadow(
    $('s3h1'),
    'open',
    shadowCss('linear-gradient(160deg,#ecfeff,#c7d2fe)', "'Frank Ruhl Libre',serif"),
    shadowHtml('כותרת בתוך Shadow'),
    false,
  );
  const s2 = attachShadow(
    $('s3h2'),
    'open',
    shadowCss('linear-gradient(160deg,#fef3c7,#fecaca)', "'Heebo',sans-serif"),
    shadowHtml('גיליון סגנון מאומץ'),
    true,
  );
  const s3 = attachShadow(
    $('s3h3'),
    'closed',
    shadowCss('linear-gradient(160deg,#dcfce7,#bae6fd)', "'Heebo',sans-serif"),
    shadowHtml('שורש סגור'),
    false,
  );
  attachShadow(
    $('s3h4'),
    'open',
    `:host { display:block; width:300px; padding:14px; box-sizing:border-box; border-radius:12px; background:#fee2e2; }
     .leak-probe { margin:0; font:400 22px/1.4 'Inter',sans-serif; color:#dc2626 !important;
                   font-style:italic !important; text-decoration:underline !important; }`,
    `<p class="leak-probe">Shadow text: red, italic, underlined</p>`,
    false,
  );
  await Promise.all(
    [s1, s2, s3].map((sr) => sr.querySelector('img').decode().catch(() => {})),
  );

  // Iframes.
  const if1 = $('s3if1');
  const if2 = $('s3if2');
  const l1 = once(if1, 'load');
  const l2 = once(if2, 'load');
  if1.srcdoc = sandboxDoc;
  if2.srcdoc = sameOriginDoc;
  notes.iframeSandboxed = await l1;
  notes.iframeSameOrigin = await l2;

  // Canvas.
  const g = $('s3canvas').getContext('2d');
  const grad = g.createLinearGradient(0, 0, 600, 600);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#4338ca');
  g.fillStyle = grad;
  g.fillRect(0, 0, 600, 600);
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc(300, 300, 40 + i * 28, i * 0.5, i * 0.5 + Math.PI * 1.3);
    g.strokeStyle = `hsl(${i * 40}, 90%, 62%)`;
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 54px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('canvas', 300, 560);

  // Videos.
  const v1 = $('s3v1');
  const loaded = once(v1, 'loadeddata', 6000);
  v1.src = '/assets/clip.webm';
  notes.videoLoadedData = await loaded;
  notes.videoReadyState = v1.readyState;
  const v2 = $('s3v2');
  v2.src = '/assets/clip.webm'; // preload="none": the poster stays on screen
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = '/assets/poster.png';
  });

  // Image from a blob: URL.
  const blob = await (await fetch('/assets/thumb-2.jpg')).blob();
  const blobImg = $('s3blob');
  blobImg.src = URL.createObjectURL(blob);
  await blobImg.decode().catch(() => {});

  await wait(50);
  window.__slideNotes = { ...(window.__slideNotes ?? {}), ...notes };
}
