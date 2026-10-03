/**
 * Reference slides for the renderer (WG2-T11): every element type and every rendering feature,
 * in both directions. The visual regression suite snapshots them; the dev page shows them.
 *
 * Ids, dates and assets are fixed. The asset table has entries only; the dev page draws the
 * pictures (`testAssetKinds`).
 */
import {
  createBaseTheme,
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
  type Element,
  type Fill,
  type Paragraph,
  type Slide,
  type Stroke,
} from '@slidr/model';
import { shapePresets } from '../geometry';

const NOW = new Date('2026-10-03T08:00:00.000Z');

export const referenceAssets = {
  landscape: 'a1'.repeat(32),
  portrait: 'a2'.repeat(32),
  icon: 'a3'.repeat(32),
  poster: 'a4'.repeat(32),
  clip: 'a5'.repeat(32),
} as const;

/** What the dev page draws for each test asset. */
export type TestAssetKind = 'landscape' | 'portrait' | 'icon' | 'poster';

export const testAssetKinds: Record<string, TestAssetKind> = {
  [referenceAssets.landscape]: 'landscape',
  [referenceAssets.portrait]: 'portrait',
  [referenceAssets.icon]: 'icon',
  [referenceAssets.poster]: 'poster',
};

function meta(id: string, file: string, rest: Partial<AssetMeta>): AssetMeta {
  return { id, file, mime: 'image/jpeg', kind: 'image', bytes: 1024, origin: 'upload', ...rest };
}

const ASSETS: AssetMeta[] = [
  meta(referenceAssets.landscape, 'landscape.jpg', { width: 2400, height: 1600 }),
  meta(referenceAssets.portrait, 'portrait.jpg', { width: 1200, height: 1600 }),
  meta(referenceAssets.icon, 'icon.svg', {
    mime: 'image/svg+xml',
    kind: 'svg',
    width: 24,
    height: 24,
  }),
  meta(referenceAssets.poster, 'poster.jpg', { width: 1920, height: 1080 }),
  meta(referenceAssets.clip, 'clip.mp4', {
    mime: 'video/mp4',
    kind: 'video',
    width: 1920,
    height: 1080,
  }),
];

const caption = (
  id: string,
  x: number,
  y: number,
  w: number,
  text: string,
  dir: Paragraph['dir'] = 'ltr',
) =>
  createElement.text({
    id,
    frame: { x, y, w, h: 36 },
    content: richText(text, { dir, align: 'center', styleRef: 'caption' }),
  });

const solid = (
  token: 'primary' | 'secondary' | 'accent' | 'surface' | 'text' | 'muted' | 'bg',
  alpha?: number,
): Fill => ({
  kind: 'solid',
  color: alpha === undefined ? { token } : { token, alpha },
});

const FILLS: Fill[] = [
  solid('primary'),
  {
    kind: 'linear',
    angle: 135,
    stops: [
      { color: { token: 'primary' }, at: 0 },
      { color: { token: 'accent' }, at: 1 },
    ],
  },
  {
    kind: 'radial',
    stops: [
      { color: { token: 'accent' }, at: 0 },
      { color: { token: 'secondary' }, at: 1 },
    ],
    center: { x: 0.3, y: 0.3 },
  },
  {
    kind: 'conic',
    angle: 0,
    stops: [
      { color: { token: 'primary' }, at: 0 },
      { color: { token: 'secondary' }, at: 0.5 },
      { color: { token: 'primary' }, at: 1 },
    ],
  },
  solid('secondary', 0.6),
  { kind: 'css', value: 'repeating-linear-gradient(45deg, #2f5bea 0 12px, #8fa8f5 12px 24px)' },
];

const STROKES: (Stroke | undefined)[] = [
  undefined,
  { color: { token: 'text' }, width: 4 },
  { color: { token: 'text' }, width: 3, dash: 'dashed' },
  undefined,
  { color: { value: '#e5484d' }, width: 6, dash: 'dotted', cap: 'round' },
  { color: { token: 'primary' }, width: 2 },
];

function shapesSlide(): Slide {
  const elements: Element[] = [];
  shapePresets.forEach((preset, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = 60 + col * 228;
    const y = 50 + row * 205;
    const open = /Bracket|Brace/.test(preset);
    elements.push(
      createElement.shape({
        id: `e_shape_${preset}`,
        frame: { x, y, w: 180, h: 120 },
        geometry: { kind: 'preset', preset },
        fill: FILLS[i % FILLS.length] ?? solid('primary'),
        stroke: open ? { color: { token: 'text' }, width: 4 } : STROKES[i % STROKES.length],
      }),
      caption(`e_cap_${preset}`, x - 20, y + 128, 220, preset),
    );
  });
  // Rotation, flips, a path geometry from its own viewBox, text inside a shape.
  elements.push(
    createElement.shape({
      id: 'e_shape_rot',
      frame: { x: 1430, y: 880, w: 140, h: 100 },
      rotation: 30,
      geometry: { kind: 'preset', preset: 'arrowRight' },
      fill: solid('accent'),
    }),
    createElement.shape({
      id: 'e_shape_flip',
      frame: { x: 1600, y: 880, w: 140, h: 100 },
      flipH: true,
      geometry: { kind: 'preset', preset: 'rightTriangle' },
      fill: solid('secondary'),
    }),
    createElement.shape({
      id: 'e_shape_path',
      frame: { x: 1770, y: 870, w: 120, h: 120 },
      geometry: { kind: 'path', d: 'M12 2 L22 22 L2 22 Z', viewBox: { w: 24, h: 24 } },
      fill: solid('primary'),
      stroke: { color: { token: 'text' }, width: 3 },
    }),
  );
  return createSlide({ id: 's_ref_shapes', name: 'Shapes', elements });
}

function linesSlide(): Slide {
  const heads = ['none', 'arrow', 'triangle', 'circle', 'diamond', 'bar'] as const;
  const elements: Element[] = [];
  heads.forEach((head, i) => {
    const y = 90 + i * 110;
    elements.push(
      caption(`e_cap_head_${head}`, 40, y - 18, 160, head),
      createElement.line({
        id: `e_line_${head}_thin`,
        frame: { x: 240, y, w: 360, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 360, y: 0 },
        ],
        stroke: { color: { token: 'text' }, width: 2 },
        startHead: head,
        endHead: head,
      }),
      createElement.line({
        id: `e_line_${head}_thick`,
        frame: { x: 680, y, w: 360, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 360, y: 0 },
        ],
        stroke: { color: { token: 'primary' }, width: 8 },
        endHead: head,
      }),
    );
  });
  const curves = ['straight', 'elbow', 'curved'] as const;
  curves.forEach((curve, i) => {
    const x = 1140 + i * 250;
    elements.push(
      caption(`e_cap_curve_${curve}`, x, 60, 220, curve),
      createElement.line({
        id: `e_line_curve_${curve}`,
        frame: { x, y: 120, w: 220, h: 260 },
        points: [
          { x: 0, y: 0 },
          { x: 220, y: 260 },
        ],
        stroke: { color: { token: 'secondary' }, width: 5 },
        curve,
        endHead: 'triangle',
      }),
    );
  });
  elements.push(
    createElement.line({
      id: 'e_line_multi_curved',
      frame: { x: 1140, y: 470, w: 720, h: 200 },
      points: [
        { x: 0, y: 200 },
        { x: 180, y: 0 },
        { x: 360, y: 160 },
        { x: 540, y: 20 },
        { x: 720, y: 180 },
      ],
      stroke: { color: { token: 'accent' }, width: 6, cap: 'round' },
      curve: 'curved',
      startHead: 'circle',
      endHead: 'arrow',
    }),
    createElement.line({
      id: 'e_line_dashed',
      frame: { x: 1140, y: 760, w: 720, h: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
      stroke: { color: { token: 'text' }, width: 4, dash: 'dashed' },
      endHead: 'triangle',
    }),
    createElement.line({
      id: 'e_line_dotted',
      frame: { x: 1140, y: 840, w: 720, h: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
      stroke: { color: { token: 'muted' }, width: 6, dash: 'dotted', cap: 'round' },
    }),
    createElement.line({
      id: 'e_line_rotated',
      frame: { x: 240, y: 820, w: 400, h: 120 },
      rotation: -10,
      flipH: true,
      points: [
        { x: 0, y: 120 },
        { x: 400, y: 0 },
      ],
      stroke: { color: { value: '#e5484d' }, width: 6 },
      endHead: 'triangle',
    }),
  );
  return createSlide({ id: 's_ref_lines', name: 'Lines', elements });
}

const outline = { outline: '1px dashed rgba(127, 127, 127, 0.6)' };

function textSlide(dir: 'ltr' | 'rtl'): Slide {
  const he = dir === 'rtl';
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const k = he ? 'he' : 'en';
  const marks: Paragraph = {
    dir,
    align: 'start',
    styleRef: 'body',
    runs: [
      { text: t('Plain, ', 'רגיל, ') },
      { text: t('bold', 'מודגש'), marks: { weight: 700 } },
      { text: ', ' },
      { text: t('italic', 'נטוי'), marks: { italic: true } },
      { text: ', ' },
      { text: t('underline', 'קו תחתון'), marks: { underline: true } },
      { text: ', ' },
      { text: t('strike', 'קו חוצה'), marks: { strike: true } },
      { text: ', ' },
      { text: t('colour', 'צבע'), marks: { color: { token: 'primary' } } },
      { text: ', ' },
      { text: t('highlight', 'הדגשה'), marks: { highlight: { token: 'accent', alpha: 0.35 } } },
      { text: ', x' },
      { text: '2', marks: { script: 'sup' } },
      { text: ', H' },
      { text: '2', marks: { script: 'sub' } },
      { text: 'O, ' },
      { text: 'upper', marks: { case: 'upper', letterSpacing: 4 } },
      { text: ', ' },
      { text: 'Space Grotesk', marks: { font: 'Space Grotesk', size: 34 } },
      { text: ', ' },
      {
        text: t('a link', 'קישור'),
        marks: { link: 'https://example.com', color: { token: 'secondary' }, underline: true },
      },
      { text: t(' and 3.5% of 1,200 (approx.)', ' ו-3.5% מתוך 1,200 (בערך).') },
    ],
  };
  const list = (text: string, kind: 'bullet' | 'number', level: number): Paragraph => ({
    dir,
    align: 'start',
    styleRef: 'body',
    list: {
      kind,
      level,
      ...(kind === 'bullet' && level === 0 ? { color: { token: 'accent' } } : {}),
    },
    runs: [{ text }],
  });
  const box = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    init: Partial<Parameters<typeof createElement.text>[0]>,
  ) =>
    createElement.text({
      id: `e_${k}_${id}`,
      frame: { x, y, w, h },
      content: richText(''),
      css: outline,
      ...init,
    });
  const long = t(
    'Shrink keeps a long text inside its box by scaling the type and the spacing together, as the box asks.',
    'כיווץ שומר טקסט ארוך בתוך התיבה שלו: האותיות והמרווחים קטנים יחד, עד שהכול נכנס.',
  );
  return createSlide({
    id: `s_ref_text_${k}`,
    name: t('Text', 'טקסט'),
    elements: [
      box('title', 80, 40, 1760, 100, {
        content: richText(
          t('Text rendering: styles, marks and lists', 'רינדור טקסט: סגנונות, סימונים ורשימות'),
          {
            dir,
            styleRef: 'title',
          },
        ),
        css: undefined,
      }),
      box('marks', 80, 160, 1760, 110, { content: { paragraphs: [marks] } }),
      box('lists', 80, 300, 820, 360, {
        content: {
          paragraphs: [
            list(t('First point', 'נקודה ראשונה'), 'bullet', 0),
            list(t('A detail under it', 'פירוט מתחתיה'), 'bullet', 1),
            list(t('Second point', 'נקודה שנייה'), 'bullet', 0),
            list(t('Step one', 'שלב ראשון'), 'number', 0),
            list(t('Step two', 'שלב שני'), 'number', 0),
            list(t('Sub-step', 'תת-שלב'), 'number', 1),
            list(t('Sub-step', 'תת-שלב'), 'number', 1),
            list(t('Step three', 'שלב שלישי'), 'number', 0),
          ],
        },
      }),
      ...(['start', 'center', 'end', 'justify'] as const).map((align, i) =>
        box(`align_${align}`, 960, 300 + i * 90, 880, 80, {
          content: richText(
            align === 'justify'
              ? t(
                  'Justified text spreads its words to fill every line except the last one, here.',
                  'טקסט מיושר לשני הצדדים פורש את המילים שלו על כל שורה חוץ מהאחרונה.',
                )
              : t(`Aligned ${align}`, `מיושר ל-${align}`),
            { dir, align, styleRef: 'caption' },
          ),
        }),
      ),
      ...(['top', 'middle', 'bottom'] as const).map((vAlign, i) =>
        box(`valign_${vAlign}`, 80 + i * 280, 700, 260, 160, {
          vAlign,
          padding: { top: 12, right: 12, bottom: 12, left: 12 },
          content: richText(vAlign, { dir, align: 'center', styleRef: 'caption' }),
        }),
      ),
      box('shrink', 960, 680, 420, 120, {
        autoFit: 'shrink',
        content: richText(long, { dir, styleRef: 'body' }),
      }),
      box('grow', 1420, 680, 420, 60, {
        autoFit: 'growHeight',
        content: richText(
          t(
            'Grows: this box became taller than its frame, which is one line high.',
            'גדלה: התיבה הזו גבוהה מהמסגרת שלה, שגובהה שורה אחת בלבד.',
          ),
          {
            dir,
            styleRef: 'caption',
          },
        ),
      }),
      box('nowrap', 960, 840, 300, 60, {
        wrap: false,
        content: richText(
          t('One line that never wraps, ever', 'שורה אחת שלעולם לא נשברת, אף פעם'),
          {
            dir,
            styleRef: 'caption',
          },
        ),
      }),
      box('columns', 80, 900, 820, 140, {
        columns: 2,
        content: richText(
          t(
            'Two columns: the text flows from the first column into the second when the first one is full of words.',
            'שתי עמודות: הטקסט זורם מהעמודה הראשונה לשנייה כשהראשונה מתמלאת במילים.',
          ),
          { dir, styleRef: 'caption' },
        ),
      }),
      box('mixed', 1320, 880, 520, 160, {
        content: {
          paragraphs: [
            {
              dir: 'rtl',
              align: 'start',
              styleRef: 'caption',
              runs: [{ text: 'עברית עם English ו-123 באמצע.' }],
            },
            {
              dir: 'ltr',
              align: 'start',
              styleRef: 'caption',
              runs: [{ text: 'English with עברית and 4.5% inside.' }],
            },
            { dir: 'auto', align: 'start', styleRef: 'caption', runs: [] },
            {
              dir: 'auto',
              align: 'start',
              styleRef: 'caption',
              runs: [
                {
                  text: t(
                    'auto: direction from the first strong letter',
                    'אוטומטי: הכיוון מהאות החזקה הראשונה',
                  ),
                },
              ],
            },
          ],
        },
      }),
    ],
  });
}

function imagesSlide(): Slide {
  const L = referenceAssets.landscape;
  const P = referenceAssets.portrait;
  const row1 = 60;
  const row2 = 420;
  const row3 = 760;
  const frame = (x: number, y: number) => ({ x, y, w: 400, h: 260 });
  return createSlide({
    id: 's_ref_images',
    name: 'Images',
    elements: [
      createElement.image({ id: 'e_img_cover', frame: frame(60, row1), assetId: P, fit: 'cover' }),
      caption('e_cap_cover', 60, row1 + 268, 400, 'portrait, cover'),
      createElement.image({
        id: 'e_img_contain',
        frame: frame(520, row1),
        assetId: P,
        fit: 'contain',
        css: outline,
      }),
      caption('e_cap_contain', 520, row1 + 268, 400, 'portrait, contain'),
      createElement.image({ id: 'e_img_fill', frame: frame(980, row1), assetId: P, fit: 'fill' }),
      caption('e_cap_fill', 980, row1 + 268, 400, 'portrait, fill'),
      createElement.image({
        id: 'e_img_crop',
        frame: frame(1440, row1),
        assetId: L,
        crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        fit: 'cover',
      }),
      caption('e_cap_crop', 1440, row1 + 268, 400, 'crop: top-right quarter'),
      createElement.image({
        id: 'e_img_ellipse',
        frame: frame(60, row2),
        assetId: L,
        mask: { kind: 'ellipse' },
      }),
      caption('e_cap_ellipse', 60, row2 + 268, 400, 'mask: ellipse'),
      createElement.image({
        id: 'e_img_rounded',
        frame: frame(520, row2),
        assetId: L,
        mask: { kind: 'rounded', radius: 40 },
        border: { color: { token: 'primary' }, width: 8 },
      }),
      caption('e_cap_rounded', 520, row2 + 268, 400, 'rounded + border'),
      createElement.image({
        id: 'e_img_star',
        frame: frame(980, row2),
        assetId: L,
        mask: { kind: 'shape', preset: 'star5' },
        border: { color: { token: 'accent' }, width: 6 },
      }),
      caption('e_cap_star', 980, row2 + 268, 400, 'mask: star + border'),
      createElement.image({
        id: 'e_img_dashed',
        frame: frame(1440, row2),
        assetId: L,
        border: { color: { token: 'text' }, width: 6, dash: 'dashed' },
        effects: { shadow: { x: 0, y: 16, blur: 32, color: { value: '#000000', alpha: 0.35 } } },
      }),
      caption('e_cap_dashed', 1440, row2 + 268, 400, 'dashed border + shadow'),
      createElement.image({
        id: 'e_img_gray',
        frame: frame(60, row3),
        assetId: L,
        adjust: { grayscale: 1, contrast: 1.2 },
      }),
      caption('e_cap_gray', 60, row3 + 268, 400, 'grayscale, contrast'),
      createElement.image({
        id: 'e_img_warm',
        frame: frame(520, row3),
        assetId: L,
        adjust: { temperature: 0.8, brightness: 1.1 },
      }),
      caption('e_cap_warm', 520, row3 + 268, 400, 'warm, brighter'),
      createElement.image({
        id: 'e_img_flip',
        frame: frame(980, row3),
        assetId: L,
        flipH: true,
        rotation: -6,
      }),
      caption('e_cap_flip', 980, row3 + 268, 400, 'flipped, rotated'),
      createElement.image({
        id: 'e_img_pending',
        frame: frame(1440, row3),
        prompt: 'A calm lake at dawn',
      }),
      caption('e_cap_pending', 1440, row3 + 268, 400, 'placeholder (prompt)'),
    ],
  });
}

function effectsSlide(): Slide {
  const shadow = { x: 0, y: 20, blur: 40, color: { value: '#000000', alpha: 0.45 } };
  return createSlide({
    id: 's_ref_effects',
    name: 'Background and effects',
    background: {
      fill: { kind: 'image', assetId: referenceAssets.landscape, fit: 'cover' },
      blur: 12,
      dim: 0.25,
      overlay: {
        kind: 'linear',
        angle: 90,
        stops: [
          { color: { token: 'primary', alpha: 0.7 }, at: 0 },
          { color: { token: 'primary', alpha: 0 }, at: 0.6 },
        ],
      },
    },
    elements: [
      createElement.text({
        id: 'e_fx_title',
        frame: { x: 100, y: 80, w: 1200, h: 140 },
        content: richText('Background: image, blur, dim, overlay', {
          dir: 'ltr',
          styleRef: 'title',
          marks: { color: { token: 'bg' } },
        }),
        effects: { shadow: { x: 0, y: 4, blur: 12, color: { value: '#000000', alpha: 0.5 } } },
      }),
      createElement.shape({
        id: 'e_fx_shadow',
        frame: { x: 100, y: 320, w: 300, h: 200 },
        fill: solid('bg'),
        effects: { shadow, radius: 24 },
      }),
      createElement.shape({
        id: 'e_fx_spread',
        frame: { x: 480, y: 320, w: 300, h: 200 },
        fill: solid('bg'),
        effects: { shadow: { ...shadow, spread: 12 }, radius: 24 },
      }),
      createElement.shape({
        id: 'e_fx_opacity',
        frame: { x: 860, y: 320, w: 300, h: 200 },
        fill: solid('accent'),
        opacity: 0.5,
      }),
      createElement.shape({
        id: 'e_fx_blur',
        frame: { x: 1240, y: 320, w: 300, h: 200 },
        fill: solid('secondary'),
        effects: { blur: 10 },
      }),
      createElement.group({
        id: 'e_fx_group',
        frame: { x: 300, y: 640, w: 600, h: 300 },
        rotation: 8,
        children: [
          createElement.shape({
            id: 'e_fx_group_card',
            frame: { x: 0, y: 0, w: 600, h: 300 },
            geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.12] },
            fill: solid('bg'),
            effects: { shadow },
          }),
          createElement.text({
            id: 'e_fx_group_text',
            frame: { x: 40, y: 40, w: 520, h: 220 },
            vAlign: 'middle',
            content: richText('A rotated group: a card and its text move together.', {
              dir: 'ltr',
              styleRef: 'heading',
            }),
          }),
        ],
      }),
      createElement.shape({
        id: 'e_fx_flipped_group_ref',
        frame: { x: 1100, y: 640, w: 300, h: 300 },
        geometry: { kind: 'preset', preset: 'chevron' },
        fill: solid('primary'),
        flipH: true,
        stroke: { color: { token: 'bg' }, width: 6 },
      }),
    ],
  });
}

const HTML_CARD = `<div class="card" dir="rtl">
  <img data-asset="${referenceAssets.landscape}" alt="">
  <div class="body"><h3>אובייקט HTML</h3><p>משתני התבנית: <b>primary</b> ו-<i>font-heading</i>.</p></div>
</div>`;

const HTML_CARD_STYLES = `.card { display: flex; gap: 20px; height: 100%; box-sizing: border-box; padding: 20px;
  border-radius: var(--radius); background: var(--color-surface); box-shadow: var(--shadow); }
.card img { width: 160px; height: 160px; object-fit: cover; border-radius: 12px; }
.card h3 { margin: 0 0 8px; font: 700 34px var(--font-heading); color: var(--color-primary); }
.card p { margin: 0; font-size: 22px; }
.card::after { content: ""; position: absolute; inset-inline-end: 24px; bottom: 24px; width: 24px; height: 24px;
  border-radius: 50%; background: var(--color-accent); }`;

const HTML_SCRIPT = `<canvas id="c" width="400" height="200"></canvas>
<script>
  const g = document.getElementById('c').getContext('2d');
  const css = getComputedStyle(document.documentElement);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? css.getPropertyValue('--color-primary') : css.getPropertyValue('--color-accent');
    g.fillRect(i * 40 + 4, 200 - (i + 1) * 18, 32, (i + 1) * 18);
  }
  g.fillStyle = css.getPropertyValue('--color-text');
  g.font = '600 22px sans-serif';
  g.fillText('drawn by a script', 8, 28);
</script>`;

const LUCIDE_ROCKET =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';

const BLACK_ICON =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><rect x="7" y="7" width="10" height="10" fill="#FFF"/></svg>';

function htmlSlide(): Slide {
  return createSlide({
    id: 's_ref_html',
    name: 'HTML, SVG and CSS',
    css: `@keyframes ref-pulse { 50% { opacity: 0.4; } }
[data-name="scoped"] { outline: 6px dashed var(--color-accent); outline-offset: 10px; }`,
    elements: [
      caption(
        'e_cap_html',
        60,
        40,
        600,
        'html, no scripts: shadow root, theme variables, data-asset',
      ),
      createElement.html({
        id: 'e_html_card',
        frame: { x: 60, y: 90, w: 600, h: 300 },
        markup: HTML_CARD,
        styles: HTML_CARD_STYLES,
        natural: { w: 600, h: 300 },
      }),
      caption('e_cap_html_scaled', 720, 40, 600, 'the same, natural 600x300 scaled to 450x225'),
      createElement.html({
        id: 'e_html_scaled',
        frame: { x: 720, y: 90, w: 450, h: 225 },
        markup: HTML_CARD,
        styles: HTML_CARD_STYLES,
        natural: { w: 600, h: 300 },
      }),
      caption('e_cap_script', 1260, 40, 600, 'html with scripts: sandboxed frame'),
      createElement.html({
        id: 'e_html_script',
        frame: { x: 1360, y: 90, w: 400, h: 200 },
        hasScripts: true,
        markup: HTML_SCRIPT,
        natural: { w: 400, h: 200 },
      }),
      caption(
        'e_cap_svg',
        60,
        460,
        800,
        'svg: currentColor icon, recoloured icon, black → primary',
      ),
      createElement.svg({
        id: 'e_svg_rocket',
        frame: { x: 60, y: 520, w: 160, h: 160 },
        markup: LUCIDE_ROCKET,
      }),
      createElement.svg({
        id: 'e_svg_rocket_accent',
        frame: { x: 260, y: 520, w: 160, h: 160 },
        markup: LUCIDE_ROCKET,
        colorOverrides: { currentColor: { token: 'accent' } },
      }),
      createElement.svg({
        id: 'e_svg_black',
        frame: { x: 460, y: 520, w: 160, h: 160 },
        markup: BLACK_ICON,
        colorOverrides: { '#000000': { token: 'primary' } },
      }),
      createElement.svg({
        id: 'e_svg_asset',
        frame: { x: 660, y: 520, w: 160, h: 160 },
        assetId: referenceAssets.icon,
      }),
      caption('e_cap_css', 960, 460, 900, 'css passthrough and slide css'),
      createElement.text({
        id: 'e_css_text',
        frame: { x: 960, y: 520, w: 880, h: 120 },
        content: richText('Outlined text', {
          dir: 'ltr',
          styleRef: 'display',
          marks: { color: { value: 'transparent' } },
        }),
        css: {
          '-webkit-text-stroke': '3px var(--color-primary)',
          'text-shadow': '6px 6px 0 rgba(0,0,0,0.12)',
        },
      }),
      createElement.shape({
        id: 'e_css_clip',
        frame: { x: 960, y: 720, w: 300, h: 260 },
        fill: solid('secondary'),
        css: { 'clip-path': 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
      }),
      createElement.shape({
        id: 'e_css_blend',
        frame: { x: 1180, y: 760, w: 300, h: 200 },
        fill: solid('accent'),
        css: { 'mix-blend-mode': 'multiply' },
      }),
      createElement.shape({
        id: 'e_css_scoped',
        name: 'scoped',
        frame: { x: 1580, y: 760, w: 240, h: 200 },
        fill: solid('surface'),
      }),
      createElement.text({
        id: 'e_css_note',
        frame: { x: 60, y: 760, w: 820, h: 220 },
        content: richText(
          'The dashed outline on the last box comes from the slide css, scoped to this slide. The diamond is a clip-path; the yellow box multiplies.',
          { dir: 'ltr', styleRef: 'caption' },
        ),
      }),
    ],
  });
}

function tableSlide(): Slide {
  const cell = (text: string, dir: Paragraph['dir'] = 'auto') => ({
    content: richText(text, { dir }),
  });
  return createSlide({
    id: 's_ref_table',
    name: 'Table, chart, media',
    elements: [
      createElement.table({
        id: 'e_tbl',
        frame: { x: 60, y: 60, w: 900, h: 420 },
        rows: [84, 84, 84, 84, 84],
        cols: [300, 300, 300],
        dir: 'rtl',
        style: { headerRow: true, bandedRows: true, firstColumn: true },
        cells: [
          [cell('רבעון', 'rtl'), cell('הכנסות', 'rtl'), cell('צמיחה', 'rtl')],
          [cell('Q1'), cell('1.2M'), cell('+4%')],
          [cell('Q2'), cell('1.4M'), cell('+17%')],
          [
            cell('Q3'),
            { ...cell('ממוזג לשתי עמודות', 'rtl'), colSpan: 2, fill: solid('accent', 0.3) },
            { ...cell(''), merged: true },
          ],
          [
            cell('Q4'),
            cell('1.9M'),
            {
              ...cell('+21%'),
              borders: { bottom: { color: { token: 'primary' }, width: 4 } },
              vAlign: 'bottom',
            },
          ],
        ],
      }),
      createElement.chart({
        id: 'e_chart',
        frame: { x: 1040, y: 60, w: 820, h: 420 },
        chartType: 'column',
        data: {
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [{ name: '2026', values: [3, 5, 4, 7] }],
        },
        options: {
          title: 'Revenue by quarter',
          legend: { show: true, position: 'bottom' },
          axes: { x: { show: true }, y: { show: true } },
          labels: false,
        },
      }),
      createElement.video({
        id: 'e_video',
        frame: { x: 60, y: 560, w: 720, h: 405 },
        assetId: referenceAssets.clip,
        poster: { assetId: referenceAssets.poster },
        effects: { radius: 24 },
      }),
      createElement.audio({
        id: 'e_audio',
        frame: { x: 860, y: 700, w: 320, h: 80 },
        assetId: referenceAssets.clip,
      }),
      createElement.image({
        id: 'e_img_bg_fill_shape',
        frame: { x: 1260, y: 560, w: 600, h: 405 },
        assetId: referenceAssets.landscape,
        mask: { kind: 'shape', preset: 'hexagon' },
      }),
    ],
  });
}

/** The built-in library of SPEC appendix B; the first fourteen have Hebrew. */
const BUILTIN_FAMILIES = [
  'Heebo',
  'Rubik',
  'Assistant',
  'Noto Sans Hebrew',
  'IBM Plex Sans Hebrew',
  'Open Sans',
  'Alef',
  'Varela Round',
  'Frank Ruhl Libre',
  'David Libre',
  'Noto Serif Hebrew',
  'Secular One',
  'Suez One',
  'Karantina',
  'Inter',
  'Poppins',
  'Montserrat',
  'Manrope',
  'DM Sans',
  'Space Grotesk',
  'Playfair Display',
  'DM Serif Display',
  'JetBrains Mono',
];

function fontsSlide(): Slide {
  return createSlide({
    id: 's_ref_fonts',
    name: 'Built-in fonts',
    elements: BUILTIN_FAMILIES.map((font, i) => {
      const hebrew = i < 14;
      const col = i < 12 ? 0 : 1;
      const row = i < 12 ? i : i - 12;
      return createElement.text({
        id: `e_font_${i}`,
        frame: { x: 60 + col * 920, y: 40 + row * 84, w: 880, h: 76 },
        vAlign: 'middle',
        content: {
          paragraphs: [
            {
              dir: 'ltr',
              align: 'start',
              styleRef: 'body',
              runs: [
                { text: `${font}  `, marks: { font, size: 34 } },
                { text: hebrew ? 'שלום עולם · Aa 123 ' : 'Aa Bb 123 ', marks: { font, size: 34 } },
                { text: 'Bold', marks: { font, size: 34, weight: 700 } },
              ],
            },
          ],
        },
      });
    }),
  });
}

/** Slides for visual regression of the renderer. */
export function referenceDeck(): Deck {
  const theme = createBaseTheme();
  theme.colors.surface = '#eef1f6';
  const deck = createDeck({
    id: '01K6REFERENCERENDERER00000',
    title: 'Renderer reference',
    lang: 'en',
    dir: 'ltr',
    now: NOW,
    theme,
    slides: [
      shapesSlide(),
      linesSlide(),
      textSlide('ltr'),
      textSlide('rtl'),
      imagesSlide(),
      effectsSlide(),
      htmlSlide(),
      tableSlide(),
      fontsSlide(),
    ],
  });
  deck.assets = Object.fromEntries(ASSETS.map((a) => [a.id, a]));
  return deck;
}
