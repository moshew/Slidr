// Slide 1 - the baseline slide named in the plan: Hebrew web font, gradient background,
// photo with object-fit: cover + rounded corners + CSS filter, a card with a soft shadow,
// mixed Hebrew / English text.
export async function build(root) {
  root.innerHTML = `
<style>
  .s1 { position:absolute; inset:0; direction:rtl; color:#fff;
        font-family:'Heebo','Inter',sans-serif;
        background:
          radial-gradient(1100px 700px at 12% 0%, rgba(255,255,255,.28), transparent 62%),
          linear-gradient(135deg, #1e3a8a 0%, #7c3aed 55%, #db2777 100%); }
  .s1 h1 { position:absolute; top:84px; right:110px; margin:0; font-size:84px; font-weight:700;
           line-height:1.12; letter-spacing:-1px; }
  .s1 .sub { position:absolute; top:212px; right:110px; width:800px; margin:0; font-size:38px;
             line-height:1.5; font-weight:400; opacity:.93; }
  .s1 .photo { position:absolute; left:110px; top:110px; width:760px; height:540px;
               object-fit:cover; object-position:35% 45%; border-radius:48px;
               filter:saturate(1.35) contrast(1.08) sepia(.18);
               box-shadow:0 24px 60px rgba(0,0,0,.38); }
  .s1 .caption { position:absolute; left:110px; top:672px; width:760px; direction:ltr;
                 font-family:'Inter',sans-serif; font-size:22px; opacity:.85; }
  .s1 .card { position:absolute; right:110px; bottom:100px; width:800px; box-sizing:border-box;
              padding:40px 48px; background:rgba(255,255,255,.96); color:#1f2937;
              border-radius:32px;
              box-shadow:0 44px 90px -12px rgba(15,23,42,.55), 0 6px 16px rgba(15,23,42,.18); }
  .s1 .card h2 { margin:0 0 18px; font-size:44px; font-weight:700; color:#4c1d95; }
  .s1 .card ul { margin:0; padding:0 28px 0 0; font-size:32px; line-height:1.7; }
  .s1 .card b { font-family:'Inter',sans-serif; font-weight:600; }
  .s1 .quote { position:absolute; left:110px; bottom:100px; width:760px; box-sizing:border-box;
               padding:30px 36px; direction:ltr; font-family:'Inter',sans-serif; font-size:30px;
               line-height:1.45; border-radius:24px; background:rgba(15,23,42,.35);
               border:1px solid rgba(255,255,255,.3); }
  .s1 .quote i { display:block; margin-top:10px; font-size:22px; opacity:.8; font-style:normal;
                 font-weight:600; }
  .s1 .foot { position:absolute; right:110px; bottom:36px; font-size:22px; opacity:.8; }
</style>
<div class="s1">
  <h1>סיכום רבעון שלישי 2026</h1>
  <p class="sub">ההכנסות צמחו ב-24% לעומת Q3 2025, בעיקר בזכות Slidr Pro וה-API החדש (v2.1).</p>
  <img class="photo" src="/assets/photo.jpg" alt="">
  <div class="caption">Photo: synthetic test image &middot; object-fit: cover &middot; filter</div>
  <div class="quote">&ldquo;Fidelity means the capture looks like what the user sees.&rdquo;
    <i>WG0-S3 &middot; slide to PNG</i></div>
  <div class="card">
    <h2>מדדים מרכזיים &middot; Key metrics</h2>
    <ul>
      <li>הכנסה שנתית חוזרת: <b>$4.2M</b> (עלייה של 31%)</li>
      <li>לקוחות פעילים: <b>1,280</b> ב-14 מדינות</li>
      <li>שביעות רצון <b>NPS 62</b> &ndash; הגבוה בענף</li>
    </ul>
  </div>
  <div class="foot">Slidr &middot; עמוד 1 מתוך 12</div>
</div>`;
}
