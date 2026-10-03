/**
 * Sample decks for tests (WG1-T12): Hebrew, English, mixed-direction, and one that uses every
 * element type. Ids and dates are fixed, so two calls give equal decks. The assets are table
 * entries only: no files stand behind them.
 */
import { createBaseTheme, createDeck, createElement, createSlide, richText } from '../factories';
import type { AssetMeta, Deck, Layout, Paragraph, Slide } from '../schema';

const NOW = new Date('2026-10-03T08:00:00.000Z');

const TITLE = { x: 160, y: 140, w: 1600, h: 160 };
const BODY = { x: 160, y: 340, w: 1600, h: 600 };

function bullets(lines: string[], dir: Paragraph['dir']): Paragraph[] {
  return lines.map((text) => ({
    dir,
    align: 'start',
    styleRef: 'body',
    list: { kind: 'bullet', level: 0 },
    runs: [{ text }],
  }));
}

function titleAndBullets(id: string, title: string, lines: string[], dir: Paragraph['dir']): Slide {
  return createSlide({
    id: `s_${id}`,
    name: title,
    elements: [
      createElement.text({
        id: `e_${id}_title`,
        role: 'title',
        frame: TITLE,
        content: richText(title, { dir, styleRef: 'title' }),
      }),
      createElement.text({
        id: `e_${id}_body`,
        role: 'body',
        frame: BODY,
        content: { paragraphs: bullets(lines, dir) },
      }),
    ],
  });
}

function hero(id: string, title: string, subtitle: string, dir: Paragraph['dir']): Slide {
  return createSlide({
    id: `s_${id}`,
    name: title,
    background: { fill: { kind: 'solid', color: { token: 'primary' } } },
    elements: [
      createElement.text({
        id: `e_${id}_title`,
        role: 'title',
        frame: { x: 160, y: 360, w: 1600, h: 240 },
        vAlign: 'bottom',
        content: richText(title, { dir, styleRef: 'display', marks: { color: { token: 'bg' } } }),
      }),
      createElement.text({
        id: `e_${id}_subtitle`,
        role: 'subtitle',
        frame: { x: 160, y: 630, w: 1600, h: 120 },
        content: richText(subtitle, {
          dir,
          styleRef: 'heading',
          marks: { color: { token: 'bg' } },
        }),
      }),
    ],
    transition: { type: 'fade', duration: 400, easing: 'ease-out', advance: { onClick: true } },
  });
}

export function hebrewDeck(): Deck {
  return createDeck({
    id: '01K6FIXTUREHEBREW000000000',
    title: 'תוכנית עבודה לרבעון',
    lang: 'he',
    now: NOW,
    slides: [
      hero('he_hero', 'תוכנית עבודה לרבעון הרביעי', 'מה נבנה, מתי, ומי אחראי', 'rtl'),
      titleAndBullets(
        'he_goals',
        'שלוש המטרות',
        ['להשיק את העורך החדש', 'לקצר את זמן הטעינה בחצי', 'להגיע לאלף משתמשים פעילים'],
        'rtl',
      ),
      createSlide({
        id: 's_he_number',
        name: 'מספר גדול',
        elements: [
          createElement.text({
            id: 'e_he_number_value',
            role: 'number',
            frame: { x: 160, y: 300, w: 1600, h: 320 },
            content: richText('87%', { dir: 'rtl', align: 'center', styleRef: 'display' }),
          }),
          createElement.text({
            id: 'e_he_number_caption',
            role: 'caption',
            frame: { x: 160, y: 660, w: 1600, h: 100 },
            content: richText('מהלקוחות חידשו את המנוי', {
              dir: 'rtl',
              align: 'center',
              styleRef: 'caption',
            }),
          }),
        ],
      }),
    ],
  });
}

export function englishDeck(): Deck {
  return createDeck({
    id: '01K6FIXTUREENGLISH00000000',
    title: 'Quarterly plan',
    lang: 'en',
    now: NOW,
    slides: [
      hero('en_hero', 'Plan for the fourth quarter', 'What we build, when, and who owns it', 'ltr'),
      titleAndBullets(
        'en_goals',
        'Three goals',
        ['Ship the new editor', 'Halve the loading time', 'Reach a thousand active users'],
        'ltr',
      ),
      titleAndBullets(
        'en_risks',
        'Risks',
        ['The import engine is new', 'Two people are out in November'],
        'ltr',
      ),
    ],
  });
}

/** Hebrew with English words, numbers, punctuation and a URL, and paragraphs of both directions. */
export function mixedDeck(): Deck {
  return createDeck({
    id: '01K6FIXTUREMIXED0000000000',
    title: 'סיכום Sprint 14',
    lang: 'he',
    now: NOW,
    slides: [
      titleAndBullets(
        'mx_summary',
        'סיכום Sprint 14 (גרסה 2.3)',
        [
          'ה-API החדש עלה ל-production ב-12.10.',
          'זמן התגובה ירד מ-480ms ל-190ms (‎-60%).',
          'התיעוד נמצא ב-https://docs.example.com/api/v2.',
        ],
        'auto',
      ),
      createSlide({
        id: 's_mx_quote',
        name: 'ציטוט',
        elements: [
          createElement.text({
            id: 'e_mx_quote_he',
            role: 'quote',
            frame: { x: 160, y: 200, w: 1600, h: 300 },
            content: {
              paragraphs: [
                {
                  dir: 'rtl',
                  align: 'start',
                  styleRef: 'heading',
                  runs: [
                    { text: 'הלקוח אמר: ' },
                    {
                      text: '"It just works"',
                      marks: { italic: true, color: { token: 'primary' } },
                    },
                    { text: ', וזה כל מה שרצינו.' },
                  ],
                },
              ],
            },
          }),
          createElement.text({
            id: 'e_mx_quote_en',
            role: 'body',
            frame: { x: 160, y: 560, w: 1600, h: 300 },
            content: {
              paragraphs: [
                {
                  dir: 'ltr',
                  align: 'start',
                  styleRef: 'body',
                  runs: [
                    { text: 'The Hebrew word ' },
                    { text: 'שלום', marks: { weight: 700 } },
                    { text: ' means both hello and peace (see items 1-3).' },
                  ],
                },
              ],
            },
          }),
        ],
      }),
    ],
  });
}

const fakeSha = (digit: string) => digit.repeat(64);

export const fixtureAssets = {
  photo: fakeSha('1'),
  icon: fakeSha('2'),
  clip: fakeSha('3'),
  poster: fakeSha('4'),
  sound: fakeSha('5'),
  font: fakeSha('6'),
  /** In the asset table but used by nothing: a save drops it. */
  unused: fakeSha('7'),
} as const;

function asset(id: string, ext: string, mime: string, rest: Partial<AssetMeta>): AssetMeta {
  return { id, file: `${id}.${ext}`, mime, kind: 'image', bytes: 1024, origin: 'upload', ...rest };
}

const fixtureLayout: Layout = {
  id: 'l_text_image',
  name: 'Text and image',
  archetype: 'textImage',
  placeholders: [
    { id: 'p_title', role: 'title', frame: { x: 160, y: 140, w: 760, h: 160 }, styleRef: 'title' },
    { id: 'p_body', role: 'body', frame: { x: 160, y: 340, w: 760, h: 600 }, styleRef: 'body' },
    { id: 'p_image', role: 'image', frame: { x: 1000, y: 0, w: 920, h: 1080 } },
  ],
  decorations: [
    createElement.shape({
      id: 'e_layout_bar',
      frame: { x: 160, y: 100, w: 120, h: 8 },
      fill: { kind: 'solid', color: { token: 'accent' } },
    }),
  ],
};

/** One slide with every element type, plus the slide-level features: timeline, transition, notes, CSS. */
export function allElementsDeck(): Deck {
  const a = fixtureAssets;
  const slide = createSlide({
    id: 's_all',
    name: 'All element types',
    layoutId: fixtureLayout.id,
    background: {
      fill: { kind: 'image', assetId: a.photo, fit: 'cover' },
      overlay: {
        kind: 'linear',
        angle: 180,
        stops: [
          { color: { value: '#000000', alpha: 0 }, at: 0 },
          { color: { value: '#000000', alpha: 0.6 }, at: 1 },
        ],
      },
      blur: 8,
      dim: 0.2,
    },
    elements: [
      createElement.text({
        id: 'e_text',
        name: 'title',
        role: 'title',
        frame: { x: 80, y: 60, w: 900, h: 120 },
        content: richText('כל סוגי האובייקטים', { dir: 'rtl', styleRef: 'title' }),
        autoFit: 'shrink',
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
        css: { 'text-shadow': '0 2px 8px rgba(0,0,0,.4)' },
      }),
      createElement.image({
        id: 'e_image',
        name: 'hero-image',
        role: 'image',
        frame: { x: 1040, y: 60, w: 800, h: 450 },
        assetId: a.photo,
        crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
        mask: { kind: 'rounded', radius: 24 },
        adjust: { brightness: 1.1, saturation: 0.9 },
        alt: 'A mountain at sunrise',
        effects: { shadow: { x: 0, y: 12, blur: 32, color: { value: '#000', alpha: 0.3 } } },
      }),
      createElement.image({
        id: 'e_image_pending',
        frame: { x: 1040, y: 540, w: 380, h: 214 },
        prompt: 'An abstract blue gradient, soft light',
      }),
      createElement.shape({
        id: 'e_shape',
        frame: { x: 80, y: 220, w: 300, h: 200 },
        rotation: 15,
        geometry: { kind: 'preset', preset: 'roundRect', adjust: [0.2] },
        fill: {
          kind: 'linear',
          angle: 45,
          stops: [
            { color: { token: 'primary' }, at: 0 },
            { color: { token: 'accent' }, at: 1 },
          ],
        },
        stroke: { color: { token: 'text' }, width: 2, dash: 'dashed' },
        content: richText('Shape', { dir: 'ltr', align: 'center' }),
      }),
      createElement.line({
        id: 'e_line',
        frame: { x: 420, y: 240, w: 300, h: 120 },
        points: [
          { x: 0, y: 0 },
          { x: 300, y: 120 },
        ],
        endHead: 'arrow',
      }),
      createElement.svg({
        id: 'e_svg_asset',
        frame: { x: 760, y: 220, w: 96, h: 96 },
        assetId: a.icon,
        colorOverrides: { '#000000': { token: 'primary' } },
      }),
      createElement.svg({
        id: 'e_svg_inline',
        frame: { x: 880, y: 220, w: 96, h: 96 },
        markup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      }),
      createElement.group({
        id: 'e_group',
        name: 'card',
        frame: { x: 80, y: 460, w: 400, h: 240 },
        children: [
          createElement.shape({
            id: 'e_group_bg',
            frame: { x: 0, y: 0, w: 400, h: 240 },
            fill: { kind: 'solid', color: { token: 'surface' } },
            effects: { radius: 16 },
          }),
          createElement.text({
            id: 'e_group_text',
            frame: { x: 24, y: 24, w: 352, h: 192 },
            content: richText('Inside a group', { dir: 'ltr', styleRef: 'body' }),
          }),
        ],
      }),
      createElement.table({
        id: 'e_table',
        frame: { x: 520, y: 460, w: 480, h: 240 },
        rows: [80, 80, 80],
        cols: [240, 240],
        dir: 'rtl',
        cells: [
          ['רבעון', 'הכנסות'],
          ['Q3', '1.2M'],
          ['Q4', '1.6M'],
        ].map((row) => row.map((text) => ({ content: richText(text) }))),
      }),
      createElement.chart({
        id: 'e_chart',
        frame: { x: 80, y: 740, w: 620, h: 300 },
        chartType: 'column',
        data: {
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [
            { name: '2025', values: [3, 5, 4, 7] },
            { name: '2026', values: [4, 6, null, 9] },
          ],
        },
      }),
      createElement.video({
        id: 'e_video',
        frame: { x: 740, y: 740, w: 480, h: 270 },
        assetId: a.clip,
        poster: { assetId: a.poster },
        muted: true,
        trim: { startMs: 0, endMs: 5000 },
      }),
      createElement.audio({
        id: 'e_audio',
        frame: { x: 1260, y: 800, w: 320, h: 64 },
        assetId: a.sound,
      }),
      createElement.html({
        id: 'e_html',
        frame: { x: 1440, y: 540, w: 400, h: 214 },
        markup: '<div class="badge">חדש <b>New</b></div>',
        styles: '.badge { font: 600 32px var(--font-heading); color: var(--color-primary); }',
        natural: { w: 400, h: 214 },
      }),
    ],
    timeline: [
      {
        id: 'a_title',
        elementId: 'e_text',
        trigger: 'onClick',
        category: 'entrance',
        preset: 'rise',
        direction: 'up',
        duration: 500,
        delay: 0,
        easing: 'ease-out',
        textBy: 'word',
      },
      {
        id: 'a_card',
        elementId: 'e_group',
        trigger: 'afterPrevious',
        category: 'entrance',
        preset: 'fade',
        duration: 400,
        delay: 100,
        easing: 'ease-out',
      },
    ],
    transition: {
      type: 'push',
      direction: 'start',
      duration: 500,
      easing: 'ease-in-out',
      advance: { onClick: true, afterMs: 8000 },
    },
    notes: richText('להזכיר את הנתונים של הרבעון הקודם.', { dir: 'rtl' }),
    css: '@keyframes pulse { 50% { opacity: .5 } }',
  });

  const deck = createDeck({
    id: '01K6FIXTUREALLELEMENTS0000',
    title: 'All element types',
    lang: 'he',
    now: NOW,
    theme: createBaseTheme(),
    layouts: [fixtureLayout],
    slides: [slide, createSlide({ id: 's_empty', name: 'Empty', hidden: true })],
  });
  deck.assets = Object.fromEntries(
    [
      asset(a.photo, 'jpg', 'image/jpeg', { width: 2400, height: 1600, name: 'mountain.jpg' }),
      asset(a.icon, 'svg', 'image/svg+xml', { kind: 'svg', width: 24, height: 24 }),
      asset(a.clip, 'mp4', 'video/mp4', {
        kind: 'video',
        width: 1920,
        height: 1080,
        durationMs: 9000,
      }),
      asset(a.poster, 'png', 'image/png', {
        width: 1920,
        height: 1080,
        origin: 'ai',
        lineage: { prompt: 'A poster frame', provider: 'codex-cli' },
      }),
      asset(a.sound, 'mp3', 'audio/mpeg', { kind: 'audio', durationMs: 12000 }),
      asset(a.font, 'woff2', 'font/woff2', {
        kind: 'font',
        origin: 'import',
        font: { family: 'Example Sans', weight: '400', style: 'normal' },
      }),
      asset(a.unused, 'png', 'image/png', { width: 64, height: 64 }),
    ].map((meta) => [meta.id, meta]),
  );
  return deck;
}

export const fixtureDecks = { hebrewDeck, englishDeck, mixedDeck, allElementsDeck };
