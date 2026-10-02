// Slide 2 - CSS passthrough (RND-07): each cell exercises one CSS feature that an imported
// or hand-written slide may use. Every feature area carries data-feature so the runner can
// measure the pixel difference of that area alone.
export async function build(root) {
  root.innerHTML = `
<style>
  .s2 { position:absolute; inset:0; padding:40px; box-sizing:border-box; display:grid;
        grid-template-columns:repeat(5, 1fr); grid-template-rows:repeat(3, 1fr); gap:20px;
        background:#f3efe6; font-family:'Inter','Heebo',sans-serif; color:#111827; }
  .s2 .cell { position:relative; background:#fff; border:1px solid #d6d3d1; border-radius:14px;
              overflow:hidden; }
  .s2 .lbl { position:absolute; left:12px; top:8px; font:600 17px/1.2 'Inter',sans-serif;
             color:#57534e; z-index:5; }
  .s2 .demo { position:absolute; inset:36px 0 0 0; display:flex; align-items:center;
              justify-content:center; gap:14px; }
  .s2 .col { flex-direction:column; gap:8px; }

  .s2 .cp-a { width:150px; height:150px; background:linear-gradient(135deg,#f43f5e,#8b5cf6);
              clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%); }
  .s2 .cp-b { width:150px; height:150px; background:linear-gradient(45deg,#0ea5e9,#22c55e);
              clip-path:inset(10% 6% round 34px); }

  .s2 .mb { position:relative; width:300px; height:230px; isolation:isolate; border-radius:12px;
            overflow:hidden; }
  .s2 .mb img { width:100%; height:100%; object-fit:cover; display:block; }
  .s2 .mb i { position:absolute; width:150px; height:150px; border-radius:50%; }
  .s2 .m1 { left:10px; top:10px; background:#ef4444; mix-blend-mode:multiply; }
  .s2 .m2 { right:10px; top:30px; background:#22d3ee; mix-blend-mode:screen; }
  .s2 .m3 { left:75px; bottom:5px; background:#facc15; mix-blend-mode:difference; }

  .s2 .bf { position:relative; width:310px; height:240px; border-radius:12px; overflow:hidden;
            background:repeating-linear-gradient(45deg,#2563eb 0 22px,#f59e0b 22px 44px,#10b981 44px 66px); }
  .s2 .bf span { position:absolute; left:8px; top:96px; font:700 30px 'Heebo',sans-serif; color:#fff;
                 white-space:nowrap; }
  .s2 .glass { position:absolute; left:60px; top:40px; width:190px; height:160px; border-radius:20px;
               background:rgba(255,255,255,.22); -webkit-backdrop-filter:blur(10px) saturate(1.8);
               backdrop-filter:blur(10px) saturate(1.8); border:1px solid rgba(255,255,255,.6);
               box-sizing:border-box; display:flex; align-items:flex-end; justify-content:center;
               padding-bottom:10px; font:600 20px 'Inter',sans-serif; color:#fff; }

  .s2 .ts { padding:18px 26px; border-radius:16px; background:#0f172a; color:#fff;
            font:700 56px 'Heebo',sans-serif;
            text-shadow:3px 3px 0 #1d4ed8, 6px 6px 0 #93c5fd, 0 0 28px rgba(96,165,250,.95); }

  .s2 .gt { font:700 44px 'Heebo',sans-serif; white-space:nowrap;
            background:linear-gradient(90deg,#db2777,#f59e0b 50%,#16a34a);
            -webkit-background-clip:text; background-clip:text; color:transparent;
            -webkit-text-fill-color:transparent; }

  .s2 .cg { width:150px; height:150px; border-radius:50%;
            background:conic-gradient(from 30deg,#ef4444 0 25%,#f59e0b 0 55%,#10b981 0 80%,#3b82f6 0); }
  .s2 .cg2 { width:130px; height:130px; border-radius:16px;
             background:repeating-conic-gradient(#111827 0 15deg,#e5e7eb 0 30deg); }

  .s2 .sub { display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px;
             font:400 13px/1.2 'Inter',sans-serif; color:#57534e; }
  .s2 .slide-icon .b { fill:var(--color-accent); stroke:#1e1b4b; stroke-width:1.5; }

  .s2 .rot { transform:rotate(-17deg) scale(1.05); padding:16px 24px; background:#0ea5e9; color:#fff;
             font:700 30px 'Heebo',sans-serif; border-radius:14px; white-space:nowrap;
             box-shadow:0 12px 24px rgba(2,132,199,.45); }

  @keyframes s2spin {
    from { transform:translateX(-100px) rotate(0deg); background-color:#16a34a; }
    to   { transform:translateX(100px) rotate(360deg); background-color:#dc2626; }
  }
  .s2 .kf { width:110px; height:110px; border-radius:18px; position:relative;
            animation:s2spin 4s linear infinite; animation-delay:-1.5s; animation-play-state:paused; }
  .s2 .kf::after, .s2 .wa::after { content:""; position:absolute; left:50%; top:8px; width:14px;
            height:40px; margin-left:-7px; border-radius:7px; background:#fff; }
  .s2 .wa { width:110px; height:110px; border-radius:50%; position:relative; background:#7c3aed; }

  .s2 .pe { position:relative; padding:12px 20px; font:600 24px 'Inter',sans-serif; background:#fef3c7;
            border-radius:10px; }
  .s2 .pe::before { content:"\\2605  "; color:#d97706; }
  .s2 .pe::after { content:""; position:absolute; right:-16px; top:-16px; width:40px; height:40px;
                   border-radius:50%; background:#ef4444; box-shadow:0 0 0 6px #fff; }
  .s2 .mklist { margin:0; padding-left:44px; font:400 22px/1.5 'Inter',sans-serif; }
  .s2 .mklist li::marker { color:#dc2626; content:"\\2192  "; font-weight:600; }

  .s2 .mk { width:160px; height:190px; background:url(/assets/thumb-3.jpg) center/cover;
            -webkit-mask-image:linear-gradient(90deg,#000 25%,transparent 96%);
            mask-image:linear-gradient(90deg,#000 25%,transparent 96%); }
  .s2 .mk2 { width:150px; height:150px; background:linear-gradient(135deg,#0f766e,#7c3aed);
             -webkit-mask:url(/assets/star.png) center/contain no-repeat;
             mask:url(/assets/star.png) center/contain no-repeat; }

  .s2 .bg { width:150px; height:150px; border-radius:16px; background:url(/assets/thumb-4.jpg) center/cover; }
  .s2 .ds { width:140px; height:140px; filter:drop-shadow(8px 10px 6px rgba(0,0,0,.45)); }

  .s2 .cv { padding:16px 22px; border-radius:14px; text-align:center; white-space:nowrap;
            background:color-mix(in oklch, var(--color-accent) 30%, white);
            color:var(--color-ink); border:4px solid var(--color-accent);
            font:700 28px var(--font-heading); }
</style>
<div class="s2">
  <div class="cell"><div class="lbl">clip-path</div>
    <div class="demo" data-feature="clip-path"><div class="cp-a"></div><div class="cp-b"></div></div></div>

  <div class="cell"><div class="lbl">mix-blend-mode</div>
    <div class="demo" data-feature="mix-blend-mode"><div class="mb"><img src="/assets/thumb-1.jpg" alt="">
      <i class="m1"></i><i class="m2"></i><i class="m3"></i></div></div></div>

  <div class="cell"><div class="lbl">backdrop-filter</div>
    <div class="demo" data-feature="backdrop-filter"><div class="bf"><span>רקע BACKDROP 12345</span>
      <div class="glass">glass</div></div></div></div>

  <div class="cell"><div class="lbl">text-shadow</div>
    <div class="demo" data-feature="text-shadow"><div class="ts">צל Text</div></div></div>

  <div class="cell"><div class="lbl">background-clip: text</div>
    <div class="demo" data-feature="gradient-text"><div class="gt">טקסט Gradient</div></div></div>

  <div class="cell"><div class="lbl">conic-gradient</div>
    <div class="demo" data-feature="conic-gradient"><div class="cg"></div><div class="cg2"></div></div></div>

  <div class="cell"><div class="lbl">inline SVG (attributes, currentColor, gradient)</div>
    <div class="demo" data-feature="svg-inline">
      <svg width="210" height="210" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:#7c3aed">
        <defs><linearGradient id="s2grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
        <circle cx="12" cy="12" r="9" fill="url(#s2grad)" stroke="none"/>
        <path d="M12 7v5l3.5 2" stroke="#fff"/>
        <path d="M2.5 12a9.5 9.5 0 0 1 9.5-9.5M21.5 12a9.5 9.5 0 0 1-9.5 9.5"/>
        <circle cx="12" cy="12" r="11.2" stroke-dasharray="1 2.4"/>
      </svg></div></div>

  <div class="cell"><div class="lbl">inline SVG styled by CSS</div>
    <div class="demo">
      <div class="sub" data-feature="svg-document-css" data-crop="self">
        <svg class="doc-icon" width="92" height="92" viewBox="0 0 24 24"><path class="a" d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z"/></svg>
        document rule</div>
      <div class="sub" data-feature="svg-slide-css-theme-var" data-crop="self">
        <svg class="slide-icon" width="92" height="92" viewBox="0 0 24 24"><path class="b" d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z"/></svg>
        slide rule + var()</div>
      <div class="sub" data-feature="svg-use-symbol" data-crop="self">
        <svg width="92" height="92" viewBox="0 0 24 24"><use href="#s2sym" fill="#0d9488" stroke="#134e4a" stroke-width="1.5"/></svg>
        &lt;use href&gt;</div>
    </div></div>

  <div class="cell"><div class="lbl">transform: rotate</div>
    <div class="demo" data-feature="rotate"><div class="rot">מסובב Rotated</div></div></div>

  <div class="cell"><div class="lbl">@keyframes, paused at 1.5s of 4s</div>
    <div class="demo" data-feature="keyframes-paused"><div class="kf"></div></div></div>

  <div class="cell"><div class="lbl">WAAPI, paused at 75%</div>
    <div class="demo" data-feature="waapi-paused"><div class="wa"></div></div></div>

  <div class="cell"><div class="lbl">pseudo-elements</div>
    <div class="demo col">
      <div class="sub" data-feature="pseudo-before-after" data-crop="self" style="padding:18px 24px">
        <div class="pe">before / after</div></div>
      <div class="sub" data-feature="pseudo-marker" data-crop="self">
        <ul class="mklist"><li>custom ::marker</li><li>second item</li></ul></div>
    </div></div>

  <div class="cell"><div class="lbl">mask-image (gradient, url)</div>
    <div class="demo" data-feature="mask-image"><div class="mk"></div><div class="mk2"></div></div></div>

  <div class="cell"><div class="lbl">background url() + drop-shadow</div>
    <div class="demo" data-feature="bg-url-drop-shadow"><div class="bg"></div>
      <img class="ds" src="/assets/star.png" alt=""></div></div>

  <div class="cell"><div class="lbl">theme var() + color-mix(oklch)</div>
    <div class="demo" data-feature="css-vars-color-mix"><div class="cv">צבע נושא Accent</div></div></div>

  <svg width="0" height="0" style="position:absolute"><symbol id="s2sym" viewBox="0 0 24 24">
    <path d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z"/></symbol></svg>
</div>`;

  // WAAPI animation frozen at a known time (the spec uses WAAPI for slide animations).
  const wa = root.querySelector('.wa');
  const anim = wa.animate(
    [
      { transform: 'translateX(-100px) rotate(0deg) scale(0.6)', opacity: 0.3 },
      { transform: 'translateX(100px) rotate(180deg) scale(1.2)', opacity: 1 },
    ],
    { duration: 2000, fill: 'both', easing: 'linear' },
  );
  anim.pause();
  anim.currentTime = 1500;
}
