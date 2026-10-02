// Extra slide (not one of the four in the brief, fidelity only, no timing): text layout cases.
// It exists because html-to-image rewrites every font-size to floor(px) - 0.1 in the clone, and
// multi-line text is where a smaller font can move line breaks.
const HE =
  'שקף טוב מעביר רעיון אחד בבהירות. הטקסט הזה ארוך מספיק כדי להישבר לכמה שורות, כך שכל שינוי קטן ברוחב האותיות ' +
  'עלול להזיז מילה משורה לשורה ולשנות את מראה הפסקה כולה, כולל מספרים כמו 2026 ומילים באנגלית כמו Slidr.';
const EN =
  'A good slide carries one idea clearly. This paragraph is long enough to wrap onto several lines, so any small ' +
  'change in glyph width can move a word from one line to the next and change how the whole block looks.';

export async function build(root) {
  root.innerHTML = `
<style>
  .s5 { position:absolute; inset:0; padding:40px; box-sizing:border-box; display:grid;
        grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(2, 1fr); gap:20px;
        background:#f5f5f4; font-family:'Inter','Heebo',sans-serif; color:#111827; }
  .s5 .cell { position:relative; background:#fff; border:1px solid #d6d3d1; border-radius:14px; overflow:hidden; }
  .s5 .lbl { position:absolute; left:14px; top:10px; font:600 17px/1.2 'Inter',sans-serif; color:#57534e; }
  .s5 .demo { position:absolute; inset:40px 0 0 0; display:flex; align-items:center; justify-content:center; }
  .s5 p { margin:0; width:520px; line-height:1.5; }
  .s5 .a { font-family:'Heebo',sans-serif; font-size:24px; direction:rtl; }
  .s5 .b { font-family:'Heebo',sans-serif; font-size:25.3px; direction:rtl; }
  .s5 .c { font-family:'Inter',sans-serif; font-size:19px; }
  .s5 .c span { font-size:1.15em; }
  .s5 .d { font-family:'Inter',sans-serif; font-size:22.6px; text-align:justify; letter-spacing:.02em; }
  .s5 .e { font-family:'Inter',sans-serif; font-size:23.5px; display:-webkit-box; -webkit-box-orient:vertical;
           -webkit-line-clamp:3; overflow:hidden; }
  .s5 .e1 { font-family:'Heebo',sans-serif; font-size:23.5px; direction:rtl; white-space:nowrap; overflow:hidden;
            text-overflow:ellipsis; margin-top:22px; }
  .s5 .f { font-family:'Heebo','Inter',sans-serif; font-size:26.5px; }
  .s5 .f u { text-decoration-color:#dc2626; text-decoration-thickness:3px; text-underline-offset:5px; }
  .s5 .f s { color:#6b7280; }
  .s5 .col { flex-direction:column; }
</style>
<div class="s5">
  <div class="cell"><div class="lbl">Hebrew paragraph, font-size 24px (integer)</div>
    <div class="demo" data-feature="wrap-integer-24px"><p class="a">${HE}</p></div></div>
  <div class="cell"><div class="lbl">Hebrew paragraph, font-size 25.3px (fractional)</div>
    <div class="demo" data-feature="wrap-fractional-25.3px"><p class="b">${HE}</p></div></div>
  <div class="cell"><div class="lbl">English paragraph, 1.15em of 19px = 21.85px</div>
    <div class="demo" data-feature="wrap-em-21.85px"><p class="c"><span>${EN} ${EN}</span></p></div></div>
  <div class="cell"><div class="lbl">justify + letter-spacing, 22.6px</div>
    <div class="demo" data-feature="justify-letter-spacing"><p class="d">${EN} ${EN}</p></div></div>
  <div class="cell"><div class="lbl">line-clamp: 3 and text-overflow: ellipsis, 23.5px</div>
    <div class="demo col" data-feature="line-clamp-ellipsis"><p class="e">${EN} ${EN}</p><p class="e1">${HE}</p></div></div>
  <div class="cell"><div class="lbl">bidi mix, underline, strike, superscript, 26.5px</div>
    <div class="demo" data-feature="bidi-decorations"><p class="f" dir="auto">המחיר ירד מ-<s>$1,299</s> ל-<u>$999</u>
      (חיסכון של 23%)<sup>1</sup>, כולל Slidr Pro ל-12 חודשים. <bdi>C++ / .NET</bdi> נתמכים, וגם <b>RTL ו-LTR</b> באותה שורה.</p></div></div>
</div>`;
}
