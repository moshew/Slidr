/**
 * Decks for the runtime's dev page (WG8, WG9B):
 *
 * - `reference`: the renderer's reference deck with a transition into every slide and a timeline
 *   on every slide. It shows each transition and each animation preset at least once, and it is
 *   the deck the review file is exported from.
 * - `probe`: three small slides with short, known timelines, for the end-to-end tests.
 * - `auto`: two slides that advance by themselves.
 *
 * `-rtl` after a name gives the same deck in a right-to-left document.
 */
import {
  createBaseTheme,
  createDeck,
  createElement,
  createSlide,
  richText,
  type AnimationStep,
  type Deck,
  type Paragraph,
  type Transition,
} from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { shapePresets } from '@slidr/renderer';
import { referenceDeck } from '@slidr/renderer/fixtures';

type StepInit = Partial<AnimationStep> & Pick<AnimationStep, 'elementId' | 'preset'>;

/** A timeline from short descriptions: an entrance that follows the step before it, unless said. */
function timeline(prefix: string, steps: StepInit[]): AnimationStep[] {
  return steps.map((step, i) => ({
    id: `${prefix}_${i}`,
    trigger: 'afterPrevious',
    category: 'entrance',
    duration: 500,
    delay: 0,
    easing: 'ease-out',
    ...step,
  }));
}

const into = (type: string, rest: Partial<Transition> = {}): Transition => ({
  type,
  duration: 700,
  easing: 'ease-in-out',
  advance: { onClick: true },
  ...rest,
});

/** The same step on several elements, each a little after the one before. */
function cascade(ids: string[], step: Omit<StepInit, 'elementId'>, gap = 100): StepInit[] {
  return ids.map((elementId, i) => ({
    ...step,
    elementId,
    trigger: i === 0 ? (step.trigger ?? 'afterPrevious') : 'withPrevious',
    delay: (step.delay ?? 0) + i * gap,
  }));
}

function shapes(): StepInit[] {
  return [
    ...shapePresets.flatMap((preset, i): StepInit[] => [
      {
        elementId: `e_shape_${preset}`,
        preset: 'pop',
        trigger: i === 0 ? 'afterPrevious' : 'withPrevious',
        delay: i * 45,
        duration: 450,
      },
      {
        elementId: `e_cap_${preset}`,
        preset: 'fade',
        trigger: 'withPrevious',
        delay: i * 45 + 150,
        duration: 300,
      },
    ]),
    { elementId: 'e_shape_rot', preset: 'rise' },
    { elementId: 'e_shape_flip', preset: 'flyIn', direction: 'start', trigger: 'withPrevious' },
    { elementId: 'e_shape_path', preset: 'zoom', trigger: 'withPrevious' },
    {
      elementId: 'e_shape_rot',
      category: 'emphasis',
      preset: 'spin',
      trigger: 'onClick',
      duration: 900,
      easing: 'ease-in-out',
    },
    { elementId: 'e_shape_flip', category: 'emphasis', preset: 'pulse', trigger: 'withPrevious' },
    { elementId: 'e_shape_path', category: 'emphasis', preset: 'wiggle', trigger: 'withPrevious' },
    {
      elementId: 'e_shape_rot',
      category: 'exit',
      preset: 'flyOut',
      direction: 'end',
      trigger: 'onClick',
      easing: 'ease-in',
    },
    { elementId: 'e_shape_flip', category: 'exit', preset: 'zoom', trigger: 'withPrevious' },
    { elementId: 'e_shape_path', category: 'exit', preset: 'sink', trigger: 'withPrevious' },
  ];
}

function lines(): StepInit[] {
  const heads = ['none', 'arrow', 'triangle', 'circle', 'diamond', 'bar'];
  const curves = ['straight', 'elbow', 'curved'];
  return [
    ...heads.flatMap((head, i): StepInit[] => [
      {
        elementId: `e_cap_head_${head}`,
        preset: 'fade',
        trigger: i === 0 ? 'afterPrevious' : 'withPrevious',
        delay: i * 120,
        duration: 300,
      },
      {
        elementId: `e_line_${head}_thin`,
        preset: 'wipe',
        direction: 'end',
        trigger: 'withPrevious',
        delay: i * 120,
      },
      {
        elementId: `e_line_${head}_thick`,
        preset: 'wipe',
        direction: 'start',
        trigger: 'withPrevious',
        delay: i * 120 + 150,
      },
    ]),
    ...curves.flatMap((curve, i): StepInit[] => [
      {
        elementId: `e_cap_curve_${curve}`,
        preset: 'fade',
        trigger: i === 0 ? 'onClick' : 'withPrevious',
        delay: i * 200,
      },
      {
        elementId: `e_line_curve_${curve}`,
        preset: 'wipe',
        direction: 'down',
        trigger: 'withPrevious',
        delay: i * 200,
        duration: 600,
      },
    ]),
    {
      elementId: 'e_line_multi_curved',
      preset: 'wipe',
      direction: 'end',
      trigger: 'onClick',
      duration: 1000,
      easing: 'ease-in-out',
    },
    { elementId: 'e_line_dashed', preset: 'flyIn', direction: 'end' },
    { elementId: 'e_line_dotted', preset: 'flyIn', direction: 'start', trigger: 'withPrevious' },
    { elementId: 'e_line_rotated', preset: 'rise' },
  ];
}

/** The two text slides differ in what waits for a click: the Hebrew list comes one line a click. */
function text(k: 'en' | 'he'): StepInit[] {
  const id = (name: string) => `e_${k}_${name}`;
  return [
    k === 'en'
      ? { elementId: id('title'), preset: 'rise', textBy: 'word' }
      : { elementId: id('title'), preset: 'pop', textBy: 'char', duration: 400 },
    k === 'en'
      ? {
          elementId: id('marks'),
          preset: 'fade',
          textBy: 'char',
          trigger: 'onClick',
          duration: 400,
        }
      : { elementId: id('marks'), preset: 'rise', textBy: 'word', trigger: 'onClick' },
    {
      elementId: id('lists'),
      preset: 'rise',
      direction: 'start',
      textBy: 'paragraph',
      trigger: k === 'en' ? 'afterPrevious' : 'onClick',
      duration: 350,
    },
    { elementId: id('align_start'), preset: 'flyIn', direction: 'end', trigger: 'onClick' },
    { elementId: id('align_center'), preset: 'zoom', trigger: 'withPrevious', delay: 100 },
    {
      elementId: id('align_end'),
      preset: 'flyIn',
      direction: 'start',
      trigger: 'withPrevious',
      delay: 200,
    },
    {
      elementId: id('align_justify'),
      preset: 'wipe',
      direction: 'end',
      trigger: 'withPrevious',
      delay: 300,
      duration: 700,
    },
    ...cascade([id('valign_top'), id('valign_middle'), id('valign_bottom')], {
      preset: 'pop',
      trigger: 'onClick',
    }),
    { elementId: id('shrink'), preset: 'blur' },
    { elementId: id('grow'), preset: 'zoom', textBy: 'word', trigger: 'withPrevious' },
    { elementId: id('nowrap'), preset: 'flyIn', direction: 'start', trigger: 'withPrevious' },
    { elementId: id('columns'), preset: 'fade', textBy: 'word', duration: 300 },
    // Hebrew, English and numbers in one line: the words keep their order while they move.
    { elementId: id('mixed'), preset: 'rise', textBy: 'word', trigger: 'withPrevious' },
    {
      elementId: id('title'),
      category: 'emphasis',
      preset: 'pulse',
      trigger: 'onClick',
      duration: 600,
    },
    {
      elementId: id('marks'),
      category: 'emphasis',
      preset: 'flash',
      textBy: 'word',
      trigger: 'withPrevious',
      duration: 600,
    },
    ...cascade([id('valign_top'), id('valign_middle'), id('valign_bottom')], {
      category: 'exit',
      preset: 'sink',
      trigger: 'onClick',
      easing: 'ease-in',
    }),
    {
      elementId: id('nowrap'),
      category: 'exit',
      preset: 'flyOut',
      direction: 'end',
      trigger: 'withPrevious',
      easing: 'ease-in',
    },
  ];
}

function images(): StepInit[] {
  const row1 = ['cover', 'contain', 'fill', 'crop'];
  const row3 = ['gray', 'warm', 'flip', 'pending'];
  const captions = (names: string[], delay: number): StepInit[] =>
    cascade(
      names.map((n) => `e_cap_${n}`),
      { preset: 'fade', trigger: 'withPrevious', delay, duration: 300 },
      120,
    );
  return [
    ...cascade(
      row1.map((n) => `e_img_${n}`),
      { preset: 'zoom' },
      120,
    ),
    ...captions(row1, 250),
    { elementId: 'e_img_ellipse', preset: 'flyIn', direction: 'end', trigger: 'onClick' },
    {
      elementId: 'e_img_rounded',
      preset: 'flyIn',
      direction: 'down',
      trigger: 'withPrevious',
      delay: 120,
    },
    {
      elementId: 'e_img_star',
      preset: 'flyIn',
      direction: 'up',
      trigger: 'withPrevious',
      delay: 240,
    },
    {
      elementId: 'e_img_dashed',
      preset: 'flyIn',
      direction: 'start',
      trigger: 'withPrevious',
      delay: 360,
    },
    ...captions(['ellipse', 'rounded', 'star', 'dashed'], 500),
    { elementId: 'e_img_gray', preset: 'blur', trigger: 'onClick', duration: 700 },
    {
      elementId: 'e_img_warm',
      preset: 'wipe',
      direction: 'down',
      trigger: 'withPrevious',
      delay: 150,
    },
    { elementId: 'e_img_flip', preset: 'pop', trigger: 'withPrevious', delay: 300 },
    { elementId: 'e_img_pending', preset: 'fade', trigger: 'withPrevious', delay: 450 },
    ...captions(row3, 600),
    {
      elementId: 'e_img_star',
      category: 'emphasis',
      preset: 'spin',
      trigger: 'onClick',
      duration: 900,
      easing: 'ease-in-out',
    },
    { elementId: 'e_img_flip', category: 'emphasis', preset: 'wiggle', trigger: 'withPrevious' },
    { elementId: 'e_img_dashed', category: 'emphasis', preset: 'bounce', trigger: 'withPrevious' },
    ...cascade(
      row1.map((n) => `e_img_${n}`),
      {
        category: 'exit',
        preset: 'flyOut',
        direction: 'up',
        trigger: 'onClick',
        easing: 'ease-in',
      },
      80,
    ),
  ];
}

function effects(): StepInit[] {
  return [
    { elementId: 'e_fx_title', preset: 'wipe', direction: 'end', duration: 800 },
    ...cascade(['e_fx_shadow', 'e_fx_spread', 'e_fx_opacity', 'e_fx_blur'], {
      preset: 'rise',
      trigger: 'onClick',
    }),
    { elementId: 'e_fx_group', preset: 'pop', trigger: 'onClick', duration: 600 },
    {
      elementId: 'e_fx_flipped_group_ref',
      preset: 'flyIn',
      direction: 'end',
      trigger: 'withPrevious',
      delay: 150,
    },
    {
      elementId: 'e_fx_opacity',
      category: 'emphasis',
      preset: 'flash',
      trigger: 'onClick',
      duration: 800,
    },
    {
      elementId: 'e_fx_blur',
      category: 'emphasis',
      preset: 'pulse',
      trigger: 'withPrevious',
      duration: 800,
    },
    {
      elementId: 'e_fx_group',
      category: 'emphasis',
      preset: 'wiggle',
      trigger: 'withPrevious',
      duration: 800,
    },
    { elementId: 'e_fx_shadow', category: 'exit', preset: 'blur', trigger: 'onClick' },
    { elementId: 'e_fx_spread', category: 'exit', preset: 'zoom', trigger: 'withPrevious' },
    {
      elementId: 'e_fx_group',
      category: 'exit',
      preset: 'flyOut',
      direction: 'down',
      trigger: 'withPrevious',
      easing: 'ease-in',
    },
  ];
}

function html(): StepInit[] {
  return [
    { elementId: 'e_html_card', preset: 'flyIn', direction: 'end' },
    { elementId: 'e_html_scaled', preset: 'zoom', trigger: 'withPrevious', delay: 150 },
    { elementId: 'e_html_script', preset: 'fade', trigger: 'withPrevious', delay: 300 },
    ...cascade(['e_svg_rocket', 'e_svg_rocket_accent', 'e_svg_black', 'e_svg_asset'], {
      preset: 'pop',
      trigger: 'onClick',
    }),
    { elementId: 'e_css_text', preset: 'rise', textBy: 'char', trigger: 'onClick' },
    { elementId: 'e_css_clip', preset: 'zoom' },
    { elementId: 'e_css_blend', preset: 'fade', trigger: 'withPrevious', delay: 150 },
    { elementId: 'e_css_scoped', preset: 'flyIn', direction: 'up', trigger: 'withPrevious' },
    { elementId: 'e_css_note', preset: 'fade', textBy: 'word', duration: 300 },
    { elementId: 'e_svg_rocket', category: 'emphasis', preset: 'bounce', trigger: 'onClick' },
    {
      elementId: 'e_svg_rocket_accent',
      category: 'emphasis',
      preset: 'spin',
      trigger: 'withPrevious',
      duration: 800,
    },
    { elementId: 'e_css_scoped', category: 'emphasis', preset: 'shake', trigger: 'withPrevious' },
  ];
}

function table(): StepInit[] {
  return [
    // A table by paragraph: the grid stands, and the cells fill in one after the other.
    { elementId: 'e_tbl', preset: 'fade', textBy: 'paragraph', duration: 140 },
    { elementId: 'e_chart', preset: 'zoom', trigger: 'onClick' },
    { elementId: 'e_video', preset: 'flyIn', direction: 'up', trigger: 'withPrevious', delay: 150 },
    { elementId: 'e_audio', preset: 'pop', trigger: 'withPrevious', delay: 300 },
    {
      elementId: 'e_img_bg_fill_shape',
      preset: 'wipe',
      direction: 'down',
      trigger: 'withPrevious',
      delay: 300,
      duration: 700,
    },
  ];
}

function fonts(): StepInit[] {
  return Array.from({ length: 23 }, (_, i) => ({
    elementId: `e_font_${i}`,
    preset: 'rise',
    direction: i < 12 ? ('end' as const) : ('start' as const),
    trigger: i === 0 ? ('afterPrevious' as const) : ('withPrevious' as const),
    delay: i * 60,
    duration: 400,
  }));
}

const REFERENCE: Record<string, { transition: Transition; steps: () => StepInit[] }> = {
  s_ref_shapes: { transition: into('fade'), steps: shapes },
  s_ref_lines: { transition: into('push', { direction: 'start' }), steps: lines },
  s_ref_text_en: { transition: into('wipe', { direction: 'start' }), steps: () => text('en') },
  s_ref_text_he: { transition: into('cover', { direction: 'start' }), steps: () => text('he') },
  s_ref_images: { transition: into('reveal', { direction: 'start' }), steps: images },
  s_ref_effects: { transition: into('zoom'), steps: effects },
  s_ref_html: {
    transition: into('flip', { direction: 'start', duration: 900 }),
    steps: html,
  },
  s_ref_table: { transition: into('push', { direction: 'up' }), steps: table },
  s_ref_fonts: { transition: into('fade', { duration: 900 }), steps: fonts },
};

/** The reference deck, animated. */
export function animatedReferenceDeck(): Deck {
  const deck = referenceDeck();
  deck.meta.title = 'Slidr reference deck: transitions and animations';
  deck.slides = deck.slides.map((slide) => {
    const show = REFERENCE[slide.id];
    if (!show) return slide;
    return { ...slide, transition: show.transition, timeline: timeline(slide.id, show.steps()) };
  });
  return deck;
}

// ---- The probe deck ----

const NOW = new Date('2026-10-03T08:00:00.000Z');

const bullets = (lines: string[], dir: Paragraph['dir']): Paragraph[] =>
  lines.map((line) => ({
    dir,
    align: 'start',
    styleRef: 'body',
    list: { kind: 'bullet', level: 0 },
    runs: [{ text: line }],
  }));

/** Three slides, and a hidden one, with short timelines whose every step a test can name. */
export function probeDeck(): Deck {
  const dir = 'ltr';
  const first = createSlide({
    id: 's_probe_a',
    name: 'Steps',
    elements: [
      createElement.text({
        id: 'p_title',
        frame: { x: 160, y: 80, w: 1600, h: 120 },
        content: richText('Probe slide one', { dir, styleRef: 'title' }),
      }),
      createElement.shape({ id: 'p_box1', frame: { x: 160, y: 300, w: 300, h: 200 } }),
      createElement.shape({
        id: 'p_box2',
        frame: { x: 560, y: 300, w: 300, h: 200 },
        rotation: 15,
        opacity: 0.5,
        fill: { kind: 'solid', color: { token: 'accent' } },
      }),
      createElement.text({
        id: 'p_list',
        frame: { x: 160, y: 600, w: 1600, h: 300 },
        content: { paragraphs: bullets(['First', 'Second', 'Third'], dir) },
      }),
    ],
    timeline: timeline('a', [
      { elementId: 'p_title', preset: 'fade', duration: 200 },
      {
        elementId: 'p_box1',
        preset: 'flyIn',
        direction: 'start',
        trigger: 'onClick',
        duration: 300,
      },
      {
        elementId: 'p_box2',
        preset: 'flyIn',
        direction: 'end',
        trigger: 'withPrevious',
        duration: 300,
      },
      {
        elementId: 'p_list',
        preset: 'rise',
        textBy: 'paragraph',
        trigger: 'onClick',
        duration: 200,
      },
      {
        elementId: 'p_box1',
        category: 'emphasis',
        preset: 'pulse',
        trigger: 'onClick',
        duration: 200,
      },
      { elementId: 'p_box1', category: 'exit', preset: 'fade', trigger: 'onClick', duration: 200 },
      {
        elementId: 'p_box2',
        category: 'exit',
        preset: 'flyOut',
        direction: 'start',
        trigger: 'afterPrevious',
        duration: 200,
      },
    ]),
  });
  const second = createSlide({
    id: 's_probe_b',
    name: 'Text',
    transition: into('push', { direction: 'start', duration: 400 }),
    elements: [
      createElement.text({
        id: 'q_title',
        frame: { x: 160, y: 80, w: 1600, h: 120 },
        content: richText('Words come in one by one', { dir, styleRef: 'title' }),
      }),
      createElement.text({
        id: 'q_mixed',
        frame: { x: 160, y: 300, w: 1600, h: 120 },
        content: richText('עברית עם two English words ו-123 באמצע.', { dir: 'rtl' }),
      }),
      createElement.text({
        id: 'q_chars',
        frame: { x: 160, y: 500, w: 1600, h: 120 },
        content: richText('שלום עולם', { dir: 'rtl', styleRef: 'heading' }),
      }),
    ],
    timeline: timeline('b', [
      { elementId: 'q_title', preset: 'zoom', textBy: 'word', duration: 200 },
      { elementId: 'q_mixed', preset: 'zoom', textBy: 'word', trigger: 'onClick', duration: 200 },
      { elementId: 'q_chars', preset: 'pop', textBy: 'char', trigger: 'onClick', duration: 200 },
    ]),
  });
  const hidden = createSlide({
    id: 's_probe_hidden',
    name: 'Hidden',
    hidden: true,
    elements: [
      createElement.text({
        id: 'h_title',
        frame: { x: 160, y: 80, w: 1600, h: 120 },
        content: richText('Not part of the show', { dir, styleRef: 'title' }),
      }),
    ],
  });
  const third = createSlide({
    id: 's_probe_c',
    name: 'Links',
    transition: into('wipe', { direction: 'end', duration: 400 }),
    elements: [
      createElement.text({
        id: 'r_title',
        frame: { x: 160, y: 80, w: 1600, h: 120 },
        content: richText('Last slide', { dir, styleRef: 'title' }),
      }),
      createElement.shape({
        id: 'r_home',
        frame: { x: 160, y: 300, w: 300, h: 200 },
        link: { kind: 'slide', target: 's_probe_a' },
      }),
    ],
  });
  return createDeck({
    id: '01K6PROBERUNTIME0000000000',
    title: 'Runtime probe',
    lang: 'en',
    dir,
    now: NOW,
    theme: createBaseTheme(),
    slides: [first, second, hidden, third],
  });
}

/** Two slides that go on by themselves: a click does nothing, the timer does. */
export function autoDeck(): Deck {
  const advance = { onClick: false, afterMs: 300 };
  const slide = (id: string, title: string, steps: StepInit[]) =>
    createSlide({
      id,
      transition: { type: 'none', duration: 0, easing: 'linear', advance },
      elements: [
        createElement.text({
          id: `${id}_title`,
          frame: { x: 160, y: 80, w: 1600, h: 120 },
          content: richText(title, { dir: 'ltr', styleRef: 'title' }),
        }),
        createElement.shape({ id: `${id}_box`, frame: { x: 160, y: 300, w: 300, h: 200 } }),
      ],
      timeline: timeline(id, steps),
    });
  return createDeck({
    id: '01K6AUTORUNTIME00000000000',
    title: 'Runtime auto-advance',
    lang: 'en',
    dir: 'ltr',
    now: NOW,
    theme: createBaseTheme(),
    slides: [
      slide('s_auto_a', 'Goes on by itself', [
        { elementId: 's_auto_a_box', preset: 'fade', trigger: 'onClick', duration: 100 },
      ]),
      slide('s_auto_b', 'And stops at the end', []),
    ],
  });
}

const rtl = (deck: Deck): Deck => ({ ...deck, meta: { ...deck.meta, lang: 'he', dir: 'rtl' } });

const BASE: Record<string, () => Deck> = {
  reference: animatedReferenceDeck,
  probe: probeDeck,
  auto: autoDeck,
  'all-elements': fixtureDecks.allElementsDeck,
};

export const deckNames = [
  'reference',
  'reference-rtl',
  'probe',
  'probe-rtl',
  'auto',
  'all-elements',
];

export function deckByName(name: string): Deck | undefined {
  const base = BASE[name.replace(/-rtl$/, '')];
  if (!base) return undefined;
  return name.endsWith('-rtl') ? rtl(base()) : base();
}
