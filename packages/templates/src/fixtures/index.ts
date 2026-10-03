/**
 * TEST FIXTURES, not designs. Two small templates for the tests of the template engine: enough
 * archetypes, repeated roles, decorations of every mirrored kind and one hand-drawn layout to
 * exercise creating slides, mirroring and switching. The real templates are WG7-T04.
 *
 * Ids are fixed, so two calls give equal templates. `paper` is drawn left-to-right and `night`
 * right-to-left, so that both are also used in the direction they were not drawn for.
 */
import {
  createElement,
  richText,
  type Frame,
  type Layout,
  type Paragraph,
  type Placeholder,
  type RichText,
  type Slide,
  type Theme,
} from '@slidr/model';
import { createSlide, type LayoutContent } from '../createSlide';
import { deckFromTemplate } from '../deck';
import { copyJson } from '../json';
import type { Template } from '../template';

const box = (x: number, y: number, w: number, h: number): Frame => ({ x, y, w, h });

function place(
  id: string,
  role: Placeholder['role'],
  frame: Frame,
  rest: Partial<Placeholder> = {},
): Placeholder {
  return { id, role, frame, ...rest };
}

/** A small seeded generator, so the ids of the sample slides are the same on every call. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample slides made by the engine itself, so every element sits on its placeholder. */
function sampleSlides(
  template: Template,
  seed: number,
  slides: [layoutId: string, name: string, content: LayoutContent][],
): Slide[] {
  const lang = template.dir === 'rtl' ? 'he' : 'en';
  const deck = deckFromTemplate(template, { lang, dir: template.dir });
  const random = seeded(seed);
  for (const [layoutId, name, content] of slides) {
    const { slide, unplaced } = createSlide(deck, { layoutId, name, content }, { random });
    if (unplaced.length > 0) throw new Error(`${layoutId} has no place for ${unplaced.join(', ')}`);
    deck.slides.push(slide);
  }
  return deck.slides;
}

function bullets(dir: Paragraph['dir'], ...lines: string[]): RichText {
  return {
    paragraphs: lines.map((text) => ({
      dir,
      align: 'start',
      list: { kind: 'bullet', level: 0 },
      runs: [{ text }],
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Paper: light, drawn left-to-right

const paperTheme: Theme = {
  id: 'test_paper',
  name: 'Test · Paper',
  colors: {
    bg: '#fbf8f1',
    surface: '#efe9db',
    text: '#22201c',
    muted: '#6f6a5f',
    primary: '#b4432e',
    secondary: '#2e5d6b',
    accent: '#d9a441',
    chart: ['#b4432e', '#2e5d6b', '#d9a441', '#6f6a5f'],
  },
  fonts: {
    heading: { he: 'Frank Ruhl Libre', latin: 'Playfair Display' },
    body: { he: 'Assistant', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 128,
      weight: 700,
      lineHeight: 1.05,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 76, weight: 700, lineHeight: 1.1, color: { token: 'text' } },
    heading: {
      font: 'heading',
      size: 48,
      weight: 600,
      lineHeight: 1.2,
      color: { token: 'primary' },
    },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.45, color: { token: 'text' } },
    caption: { font: 'body', size: 22, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 8,
  shadow: { x: 0, y: 8, blur: 24, color: { value: '#000000', alpha: 0.12 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [{ fill: { kind: 'solid', color: { token: 'surface' } } }],
};

const PAPER_TITLE = box(96, 80, 1728, 140);

const paperLayouts: Layout[] = [
  {
    id: 'l_paper_hero',
    name: 'Hero',
    archetype: 'hero',
    background: {
      fill: {
        kind: 'linear',
        angle: 90,
        stops: [
          { color: { token: 'bg' }, at: 0 },
          { color: { token: 'surface' }, at: 1 },
        ],
      },
    },
    placeholders: [
      place('p_title', 'title', box(96, 320, 1100, 260), { styleRef: 'display', vAlign: 'bottom' }),
      place('p_subtitle', 'subtitle', box(96, 610, 1100, 120), { styleRef: 'heading' }),
      place('p_image', 'image', box(1280, 0, 640, 1080)),
    ],
    decorations: [
      createElement.shape({
        id: 'd_paper_hero_bar',
        frame: box(96, 270, 160, 12),
        fill: { kind: 'solid', color: { token: 'accent' } },
      }),
      createElement.shape({
        id: 'd_paper_hero_tilt',
        frame: box(1180, 820, 200, 200),
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
      }),
    ],
  },
  {
    id: 'l_paper_section',
    name: 'Section',
    archetype: 'section',
    placeholders: [
      place('p_number', 'number', box(160, 260, 1600, 120), {
        styleRef: 'heading',
        align: 'center',
      }),
      place('p_title', 'title', box(160, 400, 1600, 200), {
        styleRef: 'display',
        align: 'center',
        vAlign: 'middle',
      }),
    ],
    decorations: [
      createElement.line({
        id: 'd_paper_section_arrow',
        frame: box(200, 700, 400, 0),
        points: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
        ],
        stroke: { color: { token: 'muted' }, width: 4 },
        endHead: 'arrow',
      }),
    ],
  },
  {
    id: 'l_paper_text_image',
    name: 'Text and image',
    archetype: 'textImage',
    placeholders: [
      place('p_title', 'title', box(96, 80, 860, 160), { styleRef: 'title' }),
      place('p_body', 'body', box(96, 280, 860, 720), { styleRef: 'body' }),
      place('p_image', 'image', box(1056, 80, 768, 920)),
    ],
    decorations: [],
  },
  {
    id: 'l_paper_cards3',
    name: 'Three cards',
    archetype: 'cards',
    placeholders: [
      place('p_title', 'title', PAPER_TITLE, { styleRef: 'title' }),
      place('p_card1', 'body', box(128, 312, 480, 596), { styleRef: 'body' }),
      place('p_card2', 'body', box(720, 312, 480, 596), { styleRef: 'body' }),
      place('p_card3', 'body', box(1312, 312, 480, 596), { styleRef: 'body' }),
    ],
    decorations: [
      // A group: its children are mirrored inside it, and its own box is not flipped.
      createElement.group({
        id: 'd_paper_cards3',
        frame: box(96, 280, 1728, 660),
        children: [0, 592, 1184].map((x, i) =>
          createElement.shape({
            id: `d_paper_cards3_${i + 1}`,
            frame: box(x, 0, 544, 660),
            fill: { kind: 'solid', color: { token: 'surface' } },
            effects: { radius: 8 },
          }),
        ),
      }),
    ],
  },
  {
    id: 'l_paper_cards4',
    name: 'Four cards',
    archetype: 'cards',
    placeholders: [
      place('p_title', 'title', PAPER_TITLE, { styleRef: 'title' }),
      place('p_card1', 'body', box(96, 300, 396, 620), { styleRef: 'body' }),
      place('p_card2', 'body', box(540, 300, 396, 620), { styleRef: 'body' }),
      place('p_card3', 'body', box(984, 300, 396, 620), { styleRef: 'body' }),
      place('p_card4', 'body', box(1428, 300, 396, 620), { styleRef: 'body' }),
    ],
    decorations: [],
  },
  {
    id: 'l_paper_big_number',
    name: 'Big number',
    archetype: 'bigNumber',
    placeholders: [
      place('p_number', 'number', box(96, 240, 1728, 360), {
        styleRef: 'display',
        align: 'center',
        vAlign: 'middle',
      }),
      place('p_caption', 'caption', box(96, 640, 1728, 120), {
        styleRef: 'heading',
        align: 'center',
      }),
    ],
    decorations: [],
  },
  {
    id: 'l_paper_quote',
    name: 'Quote',
    archetype: 'quote',
    placeholders: [
      place('p_quote', 'quote', box(280, 240, 1400, 440), {
        styleRef: 'heading',
        vAlign: 'middle',
      }),
      place('p_attribution', 'attribution', box(280, 720, 1400, 80), { styleRef: 'caption' }),
    ],
    decorations: [
      // Text is moved, never flipped; its padding changes sides with it.
      createElement.text({
        id: 'd_paper_quote_mark',
        frame: box(96, 200, 160, 200),
        padding: { top: 0, right: 24, bottom: 0, left: 8 },
        content: richText('“', { dir: 'ltr', styleRef: 'display' }),
      }),
    ],
  },
  {
    id: 'l_paper_timeline',
    name: 'Timeline',
    archetype: 'timeline',
    placeholders: [
      place('p_title', 'title', PAPER_TITLE, { styleRef: 'title' }),
      place('p_when1', 'caption', box(96, 360, 520, 60), { styleRef: 'caption' }),
      place('p_when2', 'caption', box(700, 360, 520, 60), { styleRef: 'caption' }),
      place('p_when3', 'caption', box(1304, 360, 520, 60), { styleRef: 'caption' }),
      place('p_what1', 'body', box(96, 520, 520, 400), { styleRef: 'body' }),
      place('p_what2', 'body', box(700, 520, 520, 400), { styleRef: 'body' }),
      place('p_what3', 'body', box(1304, 520, 520, 400), { styleRef: 'body' }),
    ],
    decorations: [
      createElement.line({
        id: 'd_paper_timeline_axis',
        frame: box(96, 460, 1728, 0),
        points: [
          { x: 0, y: 0 },
          { x: 1728, y: 0 },
        ],
        stroke: { color: { token: 'primary' }, width: 6 },
        endHead: 'triangle',
      }),
    ],
  },
  {
    id: 'l_paper_chart',
    name: 'Chart',
    archetype: 'chart',
    placeholders: [
      place('p_title', 'title', PAPER_TITLE, { styleRef: 'title' }),
      place('p_chart', 'chart', box(96, 260, 1100, 740)),
      place('p_body', 'body', box(1244, 260, 580, 740), { styleRef: 'body' }),
      place('p_number', 'slideNumber', box(1700, 1010, 124, 40), {
        styleRef: 'caption',
        align: 'end',
      }),
    ],
    decorations: [],
  },
];

/** A light template drawn left-to-right, with two layouts of one archetype (three and four cards). */
export function paperTemplate(): Template {
  const template: Template = {
    theme: copyJson(paperTheme),
    description: 'Test fixture: light, drawn left-to-right.',
    dir: 'ltr',
    layouts: paperLayouts.map(copyJson),
  };
  template.sample = sampleSlides(template, 1, [
    [
      'l_paper_hero',
      'Hero',
      {
        title: richText('A quarter in review', { dir: 'ltr' }),
        subtitle: richText('What we built, and what comes next', { dir: 'ltr' }),
        image: { imagePrompt: 'A sunlit desk with paper and ink' },
      },
    ],
    [
      'l_paper_section',
      'Section',
      { number: richText('01', { dir: 'ltr' }), title: richText('Results', { dir: 'ltr' }) },
    ],
    [
      'l_paper_text_image',
      'Text and image',
      {
        title: richText('Three goals', { dir: 'ltr' }),
        body: bullets('ltr', 'Ship the editor', 'Halve the loading time', 'A thousand users'),
        image: { imagePrompt: 'A mountain path at sunrise' },
      },
    ],
    [
      'l_paper_cards3',
      'Three cards',
      {
        title: richText('How it works', { dir: 'ltr' }),
        body: ['Plan', 'Build', 'Look'].map((text) => richText(text, { dir: 'ltr' })),
      },
    ],
    [
      'l_paper_cards4',
      'Four cards',
      {
        title: richText('The team', { dir: 'ltr' }),
        body: ['Design', 'Model', 'Agent', 'Runtime'].map((text) => richText(text, { dir: 'ltr' })),
      },
    ],
    [
      'l_paper_big_number',
      'Big number',
      {
        number: richText('87%', { dir: 'ltr' }),
        caption: richText('of customers renewed', { dir: 'ltr' }),
      },
    ],
    [
      'l_paper_quote',
      'Quote',
      {
        quote: richText('It just works.', { dir: 'ltr' }),
        attribution: richText('A customer', { dir: 'ltr' }),
      },
    ],
    [
      'l_paper_timeline',
      'Timeline',
      {
        title: richText('The road so far', { dir: 'ltr' }),
        caption: ['2024', '2025', '2026'].map((text) => richText(text, { dir: 'ltr' })),
        body: ['Idea', 'Prototype', 'Launch'].map((text) => richText(text, { dir: 'ltr' })),
      },
    ],
    [
      'l_paper_chart',
      'Chart',
      {
        title: richText('Revenue by quarter', { dir: 'ltr' }),
        body: richText('Growth held through the year.', { dir: 'ltr' }),
      },
    ],
  ]);
  return template;
}

// ---------------------------------------------------------------------------------------------
// Night: dark, drawn right-to-left

const nightTheme: Theme = {
  id: 'test_night',
  name: 'Test · Night',
  colors: {
    bg: '#0f1220',
    surface: '#1b2036',
    text: '#f2f4fb',
    muted: '#9aa3c0',
    primary: '#7c8cff',
    secondary: '#2a3360',
    accent: '#ffcf5c',
    chart: ['#7c8cff', '#ffcf5c', '#5ad1b0', '#ff7a90', '#9aa3c0'],
  },
  fonts: {
    heading: { he: 'Rubik', latin: 'Space Grotesk' },
    body: { he: 'Heebo', latin: 'Manrope' },
  },
  textStyles: {
    display: { font: 'heading', size: 144, weight: 800, lineHeight: 1, color: { token: 'text' } },
    title: { font: 'heading', size: 84, weight: 700, lineHeight: 1.1, color: { token: 'text' } },
    heading: {
      font: 'heading',
      size: 52,
      weight: 600,
      lineHeight: 1.2,
      color: { token: 'accent' },
    },
    body: { font: 'body', size: 32, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 400, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 28,
  shadow: { x: 0, y: 20, blur: 48, color: { value: '#000000', alpha: 0.4 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [{ fill: { kind: 'solid', color: { token: 'secondary' } } }],
};

const NIGHT_TITLE = box(96, 96, 1728, 150);

const nightLayouts: Layout[] = [
  {
    id: 'l_night_hero',
    name: 'Hero',
    archetype: 'hero',
    background: {
      fill: {
        kind: 'radial',
        center: { x: 0.8, y: 0.3 },
        stops: [
          { color: { token: 'secondary' }, at: 0 },
          { color: { token: 'bg' }, at: 1 },
        ],
      },
    },
    placeholders: [
      place('p_title', 'title', box(724, 300, 1100, 300), {
        styleRef: 'display',
        vAlign: 'middle',
      }),
      place('p_subtitle', 'subtitle', box(724, 620, 1100, 120), { styleRef: 'title' }),
      place('p_image', 'image', box(0, 0, 640, 1080)),
    ],
    decorations: [
      createElement.shape({
        id: 'd_night_hero_dot',
        frame: box(1700, 120, 124, 124),
        geometry: { kind: 'preset', preset: 'ellipse' },
        fill: { kind: 'solid', color: { token: 'accent' } },
      }),
    ],
  },
  {
    id: 'l_night_section',
    name: 'Section',
    archetype: 'section',
    background: { fill: { kind: 'solid', color: { token: 'secondary' } } },
    // No placeholder for the section number: a number that comes here has nowhere to go.
    placeholders: [place('p_title', 'title', box(160, 420, 1600, 240), { styleRef: 'title' })],
    decorations: [],
  },
  {
    id: 'l_night_text_image',
    name: 'Text and image',
    archetype: 'textImage',
    placeholders: [
      place('p_title', 'title', box(964, 96, 860, 160), { styleRef: 'title' }),
      place('p_body', 'body', box(964, 296, 860, 688), { styleRef: 'body' }),
      place('p_image', 'image', box(96, 96, 772, 888)),
    ],
    decorations: [],
  },
  {
    id: 'l_night_cards',
    name: 'Cards',
    archetype: 'cards',
    // Drawn right-to-left: the first card is the rightmost.
    placeholders: [
      place('p_title', 'title', NIGHT_TITLE, { styleRef: 'title' }),
      place('p_card1', 'body', box(1264, 320, 560, 600), { styleRef: 'body', vAlign: 'middle' }),
      place('p_card2', 'body', box(680, 320, 560, 600), { styleRef: 'body', vAlign: 'middle' }),
      place('p_card3', 'body', box(96, 320, 560, 600), { styleRef: 'body', vAlign: 'middle' }),
    ],
    decorations: [],
  },
  {
    id: 'l_night_big_number',
    name: 'Big number',
    archetype: 'bigNumber',
    placeholders: [
      place('p_number', 'number', box(96, 200, 1728, 400), {
        styleRef: 'display',
        vAlign: 'bottom',
      }),
      place('p_caption', 'caption', box(96, 640, 1728, 100), { styleRef: 'body' }),
    ],
    decorations: [],
  },
  {
    id: 'l_night_quote',
    name: 'Quote',
    archetype: 'quote',
    // No placeholder for the attribution.
    placeholders: [
      place('p_quote', 'quote', box(200, 200, 1520, 560), {
        styleRef: 'title',
        align: 'center',
        vAlign: 'middle',
      }),
    ],
    decorations: [],
  },
  {
    id: 'l_night_table',
    name: 'Table',
    archetype: 'table',
    placeholders: [
      place('p_title', 'title', NIGHT_TITLE, { styleRef: 'title' }),
      place('p_table', 'table', box(96, 300, 1728, 660)),
    ],
    decorations: [],
  },
  {
    id: 'l_night_closing',
    name: 'Closing',
    archetype: 'closing',
    placeholders: [
      place('p_title', 'title', box(160, 360, 1600, 220), {
        styleRef: 'display',
        align: 'center',
        vAlign: 'middle',
      }),
      place('p_subtitle', 'subtitle', box(160, 620, 1600, 100), {
        styleRef: 'heading',
        align: 'center',
      }),
      place('p_logo', 'logo', box(1620, 920, 204, 80)),
    ],
    decorations: [],
  },
];

/**
 * The left-to-right "Text and image" of `night`, drawn by hand: the picture runs to the edge of
 * the slide instead of being the mirror of the right-to-left one.
 */
const nightTextImageLtr: Layout = {
  id: 'l_night_text_image',
  name: 'Text and image',
  archetype: 'textImage',
  placeholders: [
    place('p_title', 'title', box(96, 96, 860, 160), { styleRef: 'title' }),
    place('p_body', 'body', box(96, 296, 860, 688), { styleRef: 'body' }),
    place('p_image', 'image', box(1100, 0, 820, 1080)),
  ],
  decorations: [],
};

/**
 * A dark template drawn right-to-left. It has no timeline and no chart layout, its section and
 * quote layouts lack a role `paper` has, and one layout is hand-drawn for the other direction.
 */
export function nightTemplate(): Template {
  const template: Template = {
    theme: copyJson(nightTheme),
    description: 'Test fixture: dark, drawn right-to-left.',
    dir: 'rtl',
    layouts: nightLayouts.map(copyJson),
    flipped: [copyJson(nightTextImageLtr)],
  };
  template.sample = sampleSlides(template, 2, [
    [
      'l_night_hero',
      'פתיחה',
      {
        title: richText('סיכום הרבעון', { dir: 'rtl' }),
        subtitle: richText('מה בנינו ומה בדרך', { dir: 'rtl' }),
        image: { imagePrompt: 'עיר בלילה מלמעלה' },
      },
    ],
    ['l_night_section', 'מקטע', { title: richText('תוצאות', { dir: 'rtl' }) }],
    [
      'l_night_text_image',
      'טקסט ותמונה',
      {
        title: richText('שלוש מטרות', { dir: 'rtl' }),
        body: bullets('rtl', 'להשיק את העורך', 'לקצר את הטעינה', 'אלף משתמשים'),
        image: { imagePrompt: 'שביל בהר עם זריחה' },
      },
    ],
    [
      'l_night_cards',
      'כרטיסים',
      {
        title: richText('איך זה עובד', { dir: 'rtl' }),
        body: ['תכנון', 'בנייה', 'מבט'].map((text) => richText(text, { dir: 'rtl' })),
      },
    ],
    [
      'l_night_big_number',
      'מספר גדול',
      {
        number: richText('87%', { dir: 'rtl' }),
        caption: richText('מהלקוחות חידשו', { dir: 'rtl' }),
      },
    ],
    ['l_night_quote', 'ציטוט', { quote: richText('זה פשוט עובד.', { dir: 'rtl' }) }],
    ['l_night_table', 'טבלה', { title: richText('הכנסות לפי רבעון', { dir: 'rtl' }) }],
    [
      'l_night_closing',
      'סיום',
      {
        title: richText('תודה', { dir: 'rtl' }),
        subtitle: richText('שאלות?', { dir: 'rtl' }),
      },
    ],
  ]);
  return template;
}

export const fixtureTemplates = { paperTemplate, nightTemplate };
