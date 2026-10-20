import { createDeckApi, startTurn, type LintFinding } from '@slidr/agent-tools';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Background,
  type Deck,
  type Element,
  type Slide,
} from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { applyTemplate } from '@slidr/templates';
import { builtInSamples, builtInTemplates, sampleDeck } from '@slidr/templates/builtin';
import { beforeAll, describe, expect, test } from 'vitest';
import { testAssetUrl } from '../dev/slides/testAssets';
import { registerBuiltinFonts } from '../fonts';
import { DesignCheck } from './check';
import { createLintService, lintSlides, measureDeckSlide } from './deckLint';

// End to end, in the engine WebView2 uses: slides are rendered with the built-in fonts, measured
// from the DOM and judged, through the same service the Deck API calls after every write.

/** Test pictures drawn on a canvas, as the dev pages do: no binary files. */
function picture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  draw(canvas.getContext('2d')!, 960, 540);
  return canvas.toDataURL('image/jpeg', 0.9);
}

const SNOW = 'c1'.repeat(32);
const NIGHT = 'c2'.repeat(32);
const pictures: Record<string, () => string> = {
  // A pale, slightly uneven picture: white text over it is hard to read.
  [SNOW]: () =>
    picture((g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#f4f1e8');
      sky.addColorStop(1, '#dfe6ee');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
    }),
  [NIGHT]: () =>
    picture((g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1020');
      sky.addColorStop(1, '#1d2e3c');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
    }),
};
const urls = new Map<string, string | undefined>();
function resolveAsset(asset: AssetMeta): string | undefined {
  if (!urls.has(asset.id)) urls.set(asset.id, pictures[asset.id]?.() ?? testAssetUrl(asset.id));
  return urls.get(asset.id);
}

const service = createLintService(resolveAsset);

function deckOf(slides: Slide[], lang: 'he' | 'en'): Deck {
  const deck = createDeck({ lang, slides });
  for (const id of Object.keys(pictures)) {
    deck.assets[id] = {
      id,
      file: `${id}.jpg`,
      mime: 'image/jpeg',
      kind: 'image',
      bytes: 1,
      origin: 'upload',
      width: 960,
      height: 540,
    };
  }
  return deck;
}

/** The findings of one slide of the given elements, as `rule element element`. */
async function lint(
  elements: Element[],
  init: Partial<Slide> = {},
  lang: 'he' | 'en' = 'he',
): Promise<LintFinding[]> {
  const slide = createSlide({ id: 's_1', ...init, elements });
  return service.lint(deckOf([slide], lang), ['s_1'], 'agent');
}
const brief = (findings: LintFinding[]) => findings.map((f) => [f.rule, ...f.elementIds].join(' '));
const of = <F extends LintFinding>(findings: F[], rule: string) =>
  findings.filter((f) => f.rule === rule);

const he = (text: string, styleRef: 'title' | 'body' = 'body', color?: string) =>
  richText(text, {
    dir: 'rtl',
    styleRef,
    ...(color ? { marks: { color: { value: color } } } : {}),
  });
const en = (text: string, styleRef: 'title' | 'body' = 'body', color?: string) =>
  richText(text, {
    dir: 'ltr',
    styleRef,
    ...(color ? { marks: { color: { value: color } } } : {}),
  });

const photo = (assetId: string, dim?: number): Background => ({
  fill: { kind: 'image', assetId, fit: 'cover' },
  ...(dim ? { dim } : {}),
});

beforeAll(() => registerBuiltinFonts());

describe('L01: overflowing text', () => {
  test('Hebrew text that is taller than its box', async () => {
    const body = createElement.text({
      id: 'e_body',
      frame: { x: 1360, y: 340, w: 400, h: 100 },
      content: he(
        'הטקסט הזה ארוך מדי בשביל התיבה שלו: הוא נשבר לכמה שורות, והשורות האחרונות יוצאות מתחת לתיבה.',
      ),
    });
    const [finding] = of(await lint([body]), 'L01');
    expect(finding?.elementIds).toEqual(['e_body']);
    expect(finding?.message).toMatch(
      /^The text is \d+px taller than its box \(frame\.h is 100\)\. Shorten the text, make the frame taller, or set autoFit to "shrink"\.$/,
    );
  });

  test('English text kept on one line that is wider than its box', async () => {
    const line = createElement.text({
      id: 'e_line',
      frame: { x: 160, y: 340, w: 300, h: 60 },
      wrap: false,
      content: en('One line that never wraps, whatever its box'),
    });
    const [finding] = of(await lint([line], {}, 'en'), 'L01');
    expect(finding?.message).toMatch(
      /^The text is \d+px wider than its box \(frame\.w is 300\): wrap is off/,
    );
  });

  test('text that fits, text that shrinks to fit and a box that grows are fine', async () => {
    const long = 'כיווץ שומר טקסט ארוך בתוך התיבה שלו: האותיות והמרווחים קטנים יחד, עד שהכול נכנס.';
    const findings = await lint([
      createElement.text({
        id: 'e_fits',
        frame: { x: 160, y: 100, w: 1600, h: 200 },
        content: he(long),
      }),
      createElement.text({
        id: 'e_shrinks',
        frame: { x: 1000, y: 400, w: 700, h: 100 },
        autoFit: 'shrink',
        content: he(long),
      }),
      createElement.text({
        id: 'e_grows',
        frame: { x: 160, y: 600, w: 700, h: 40 },
        autoFit: 'growHeight',
        content: he(long),
      }),
    ]);
    expect(of(findings, 'L01')).toEqual([]);
  });

  test('shrink that takes the text under 24px is an L04 that says why', async () => {
    const [finding] = of(
      await lint([
        createElement.text({
          id: 'e_tiny',
          frame: { x: 1000, y: 400, w: 500, h: 90 },
          autoFit: 'shrink',
          content: he(
            'כיווץ שומר טקסט ארוך בתוך התיבה שלו: האותיות והמרווחים קטנים יחד, עד שהכול נכנס. וכאן יש עוד משפט שלם.',
          ),
        }),
      ]),
      'L04',
    );
    expect(finding?.message).toMatch(
      /^The smallest text here is drawn at [\d.]+px; the minimum readable size is 24px\. autoFit "shrink" scaled the text to \d+% to fit its box/,
    );
  });
});

describe('L05: contrast against what is really under the text', () => {
  const title = (content = he('כותרת על תמונה', 'title', '#ffffff')) =>
    createElement.text({ id: 'e_title', frame: { x: 160, y: 400, w: 1600, h: 160 }, content });

  test('white text over a pale photo behind the slide', async () => {
    const [finding] = of(await lint([title()], { background: photo(SNOW) }), 'L05');
    expect(finding?.elementIds).toEqual(['e_title']);
    expect(finding?.message).toMatch(
      /^Text in #ffffff has a contrast of 1\.\d+:1 against what is under it \(#[ef][0-9a-f]{5}\); 72px text needs 3:1/,
    );
  });

  test('the same text over a dark photo, and over the pale one once it is dimmed', async () => {
    expect(of(await lint([title()], { background: photo(NIGHT) }), 'L05')).toEqual([]);
    expect(of(await lint([title()], { background: photo(SNOW, 0.6) }), 'L05')).toEqual([]);
  });

  test('text over an image element and over a gradient, in English', async () => {
    const findings = await lint(
      [
        createElement.image({
          id: 'e_photo',
          frame: { x: 960, y: 0, w: 960, h: 1080 },
          assetId: SNOW,
        }),
        createElement.text({
          id: 'e_on_photo',
          frame: { x: 1040, y: 200, w: 800, h: 100 },
          content: en('White on a pale photo', 'body', '#ffffff'),
        }),
        createElement.shape({
          id: 'e_fade',
          frame: { x: 96, y: 600, w: 800, h: 120 },
          fill: {
            kind: 'linear',
            angle: 90,
            stops: [
              { color: { value: '#101828' }, at: 0 },
              { color: { value: '#f8fafc' }, at: 1 },
            ],
          },
        }),
        createElement.text({
          id: 'e_on_fade',
          frame: { x: 116, y: 630, w: 760, h: 60 },
          content: en('White text across a gradient that ends pale', 'body', '#ffffff'),
        }),
        createElement.text({
          id: 'e_plain',
          frame: { x: 96, y: 200, w: 800, h: 100 },
          content: en('Dark text on the white slide'),
        }),
      ],
      {},
      'en',
    );
    expect(of(findings, 'L05').map((f) => f.elementIds)).toEqual([['e_on_photo'], ['e_on_fade']]);
  });
});

describe('L06: overlapping text boxes', () => {
  test('text drawn over text', async () => {
    const findings = await lint([
      createElement.text({
        id: 'e_title',
        frame: { x: 160, y: 300, w: 1600, h: 120 },
        content: he('כותרת השקף', 'title'),
      }),
      createElement.text({
        id: 'e_body',
        frame: { x: 160, y: 340, w: 1600, h: 200 },
        content: he('שורה שיושבת על הכותרת'),
      }),
    ]);
    const [finding] = of(findings, 'L06');
    expect(finding?.elementIds).toEqual(['e_title', 'e_body']);
    expect(finding?.message).toMatch(/are drawn over each other in a \d+x\d+px area/);
  });

  test('the same frame, Hebrew from the right and English from the left: no collision', async () => {
    const frame = { x: 160, y: 300, w: 1600, h: 120 };
    const findings = await lint([
      createElement.text({ id: 'e_he', frame, content: he('מימין') }),
      createElement.text({ id: 'e_en', frame, content: en('From the left') }),
    ]);
    expect(of(findings, 'L06')).toEqual([]);
  });
});

describe('L02 and L03: the slide and its safe margins', () => {
  test('an element off the slide, and text cut by the edge', async () => {
    const findings = await lint(
      [
        createElement.image({
          id: 'e_lost',
          frame: { x: 2000, y: 100, w: 400, h: 300 },
          assetId: SNOW,
        }),
        createElement.text({
          id: 'e_cut',
          frame: { x: 1500, y: 500, w: 900, h: 100 },
          wrap: false,
          content: en('This line runs off the right edge of the slide'),
        }),
      ],
      {},
      'en',
    );
    expect(of(findings, 'L02').map((f) => f.elementIds)).toEqual([['e_lost'], ['e_cut']]);
    expect(of(findings, 'L02')[1]?.message).toMatch(
      /^The text reaches \d+px past the right edge of the slide/,
    );
    // Off the slide is L02's alone.
    expect(of(findings, 'L03')).toEqual([]);
  });

  test('Hebrew text in the right margin; English in the same frame stays inside', async () => {
    const frame = { x: 1000, y: 300, w: 880, h: 100 };
    const hebrew = await lint([
      createElement.text({ id: 'e_text', frame, content: he('טקסט בשוליים') }),
    ]);
    expect(of(hebrew, 'L03')[0]?.message).toMatch(
      /^The text reaches 56px past the right edge of the safe area/,
    );
    const english = await lint(
      [createElement.text({ id: 'e_text', frame, content: en('Inside') })],
      {},
      'en',
    );
    expect(of(english, 'L03')).toEqual([]);
  });

  test('English text in the left and bottom margins', async () => {
    const findings = await lint(
      [
        createElement.text({
          id: 'e_footer',
          frame: { x: 40, y: 1010, w: 600, h: 50 },
          content: en('Source: customer survey'),
        }),
      ],
      {},
      'en',
    );
    expect(of(findings, 'L03')[0]?.message).toMatch(
      /^The text reaches 56px past the left edge and \d+px past the bottom edge of the safe area/,
    );
  });

  test('a full-bleed image is not flagged, and fills the slide', async () => {
    const findings = await lint(
      [
        createElement.image({
          id: 'e_photo',
          frame: { x: -20, y: -20, w: 1960, h: 1120 },
          assetId: NIGHT,
        }),
        createElement.text({
          id: 'e_title',
          frame: { x: 160, y: 400, w: 1600, h: 160 },
          content: he('תמונה מלאה עם כותרת', 'title', '#ffffff'),
        }),
      ],
      { archetype: 'fullImage' },
    );
    expect(brief(findings)).toEqual([]);
  });
});

describe('the service', () => {
  test('lints the slides asked for, in order, and leaves nothing in the page', async () => {
    const deck = fixtureDecks.hebrewDeck();
    const findings = await service.lint(
      deck,
      ['s_he_number', 'no_such_slide', 's_he_hero'],
      'agent',
    );
    expect([...new Set(findings.map((f) => f.slideId))]).toEqual(['s_he_number', 's_he_hero']);
    expect(document.querySelector('[data-slide-id]')).toBeNull();
    expect(await service.lint(deck, [], 'all')).toEqual([]);
  });

  test('is what a write tool of the Deck API returns (LNT-04)', async () => {
    const bus = new CommandBus(fixtureDecks.englishDeck(), { validate: true });
    const api = createDeckApi(bus, { lint: service });
    const turn = startTurn('sess', { kind: 'deck' });
    const result = await api.call(turn, 'element_update', {
      elementId: 'e_en_goals_body',
      patch: { frame: { h: 60 } },
    });
    if (!result.ok) throw new Error(result.error.message);
    const lint = result.data.lint as LintFinding[];
    expect(brief(lint)).toEqual(['L01 e_en_goals_body', 'L07', 'L16']);
    expect(lint.every((f) => f.slideId === 's_en_goals')).toBe(true);

    const all = await api.call(turn, 'deck_lint', {});
    if (!all.ok) throw new Error(all.error.message);
    const slides = (all.data.findings as LintFinding[]).map((f) => f.slideId);
    expect([...new Set(slides)]).toEqual(['s_en_hero', 's_en_goals', 's_en_risks']);
  });
});

describe('the example decks (PLAN, WG7 acceptance)', () => {
  /** `slide rule element...` of every finding of a deck. */
  async function findingsOf(deck: Deck, severity?: LintFinding['severity']): Promise<string[]> {
    const ids = deck.slides.map((s) => s.id);
    return (await service.lint(deck, ids, 'agent'))
      .filter((f) => !severity || f.severity === severity)
      .map((f) => [f.slideId, f.rule, ...f.elementIds].join(' '));
  }

  test('the Hebrew, English and mixed decks have no error, and these warnings', async () => {
    const { hebrewDeck, englishDeck, mixedDeck } = fixtureDecks;
    for (const make of [hebrewDeck, englishDeck, mixedDeck]) {
      expect(await findingsOf(make(), 'error')).toEqual([]);
    }
    // Every slide is text alone on an empty background, which is what L07 and L16 are for; the
    // base theme's caption style is 22px.
    expect(await findingsOf(hebrewDeck())).toEqual([
      's_he_hero L07',
      's_he_hero L16',
      's_he_goals L07',
      's_he_goals L16',
      's_he_number L04 e_he_number_caption',
      's_he_number L07',
      's_he_number L16',
    ]);
    expect(await findingsOf(englishDeck())).toEqual([
      's_en_hero L07',
      's_en_hero L16',
      's_en_goals L07',
      's_en_goals L16',
      's_en_risks L07',
      's_en_risks L16',
    ]);
    expect(await findingsOf(mixedDeck())).toEqual([
      's_mx_summary L07',
      's_mx_summary L16',
      's_mx_quote L07',
      's_mx_quote L16',
    ]);
  });

  test('the two decks of test material have these errors, each of them real', async () => {
    // Not designed slides: one of every element type, and the renderer's reference slides.
    expect(await findingsOf(fixtureDecks.allElementsDeck(), 'error')).toEqual([
      // Dark text on the blue end of a gradient, and dark table text straight on a dark photo.
      's_all L05 e_shape',
      's_all L05 e_table',
    ]);
    expect(await findingsOf(referenceDeck(), 'error')).toEqual([
      // A caption that wraps to a second line in a one-line box.
      's_ref_shapes L01 e_cap_wedgeRoundRectCallout',
      // `wrap: false` text that is wider than its box, in both directions.
      's_ref_text_en L01 e_en_nowrap',
      // A link in the secondary colour on white: 3.38:1.
      's_ref_text_en L05 e_en_marks',
      's_ref_text_he L01 e_he_nowrap',
      's_ref_text_he L05 e_he_marks',
      // A muted caption in the drop shadow of the image above it.
      's_ref_images L05 e_cap_dashed',
      // Titles and captions that take two lines where the frame has room for one.
      's_ref_effects L01 e_fx_title',
      's_ref_html L01 e_cap_html',
    ]);
  });
});

describe("the user's design check: the rules that do not go back to the agent, and the fixes", () => {
  /** The findings of the whole set, with their fixes, and the bus the fixes run on. */
  async function check(elements: Element[], init: Partial<Slide> = {}, lang: 'he' | 'en' = 'he') {
    const slide = createSlide({ id: 's_1', ...init, elements });
    const bus = new CommandBus(deckOf([slide], lang), { validate: true });
    const run = () => lintSlides(bus.deck, ['s_1'], 'all', resolveAsset);
    return { bus, run, findings: await run() };
  }

  test('a fix puts its finding right, as one step, on the slide as it is really drawn', async () => {
    // Text that overflows its box, pale text on a pale photo, and a paragraph set the wrong way.
    const { bus, run, findings } = await check(
      [
        createElement.text({
          id: 'e_body',
          frame: { x: 1160, y: 200, w: 600, h: 60 },
          content: he('הטקסט הזה ארוך מדי בשביל התיבה שלו, ולכן הוא נשבר לשלוש שורות ויוצא ממנה.'),
        }),
        createElement.text({
          id: 'e_pale',
          frame: { x: 160, y: 600, w: 800, h: 100 },
          content: he('טקסט לבן על תצלום בהיר', 'title', '#ffffff'),
        }),
        createElement.text({
          id: 'e_turned',
          frame: { x: 160, y: 800, w: 900, h: 60 },
          content: richText('המשפט הזה כתוב בעברית.', { dir: 'ltr' }),
        }),
      ],
      { background: photo(SNOW) },
    );
    // And the photograph itself: 960 pixels wide, drawn across a slide of 1920.
    expect(brief(findings)).toEqual(['L01 e_body', 'L05 e_pale', 'L12', 'L15 e_turned']);
    for (const rule of ['L01', 'L05', 'L15']) {
      const [finding] = of(await run(), rule);
      const steps = bus.undoStack.length;
      bus.batch(finding!.fix!);
      expect(bus.undoStack).toHaveLength(steps + 1);
      expect(of(await run(), rule)).toEqual([]);
    }
    // What is left has no fix: the picture is as small as it was.
    const left = await run();
    expect(brief(left)).toEqual(['L12']);
    expect(left[0]).not.toHaveProperty('fix');
  });

  test('edges that nearly line up and gaps that are uneven are found on the drawn slide and fixed', async () => {
    const card = (id: string, x: number, y: number) =>
      createElement.shape({ id, frame: { x, y, w: 400, h: 260 } });
    const { bus, run, findings } = await check([
      card('e_1', 96, 200),
      card('e_2', 520, 203),
      card('e_3', 951, 200),
      card('e_4', 1400, 200),
    ]);
    // The second card sits 3px low: off at its top and at its bottom, and said once.
    expect(of(findings, 'L09').map((f) => f.message.slice(0, 16))).toEqual(['The top edges of']);
    bus.batch(of(findings, 'L09')[0]!.fix!);
    const spaced = of(await run(), 'L10');
    expect(spaced).toHaveLength(1);
    bus.batch(spaced[0]!.fix!);
    const after = await run();
    expect([...of(after, 'L09'), ...of(after, 'L10')]).toEqual([]);
    expect(bus.deck.slides[0]!.elements.map((e) => e.frame.x)).toEqual([
      96, 530.667, 965.333, 1400,
    ]);
  });

  test('a text its fix made taller still goes with its placeholder at the next switch of template', async () => {
    const template = (id: string) => builtInTemplates().find((t) => t.theme.id === id)!;
    const start = sampleDeck(template('tzuk'), builtInSamples.tzuk!.en, { lang: 'en', dir: 'ltr' });
    const bus = new CommandBus(start, { validate: true });
    // A longer closing line on the cards slide: four lines in a box of two.
    const slide = bus.deck.slides.find((s) => s.layoutId === 'l_tzuk_cards')!;
    const line = slide.elements.filter((e) => e.role === 'body')[3]!;
    bus.dispatch({
      type: 'text.set',
      slideId: slide.id,
      elementId: line.id,
      content: richText(
        'And the fourth: net revenue retention rose to 124%. Existing customers grow their fleets and add modules, quarter after quarter, and the customers who joined in the last two years already buy more than the ones who joined before them, in every region we sell in and in every size of warehouse, which is the best sign of all that the product holds its promise once it is on the floor.',
        { dir: 'ltr', styleRef: 'body' },
      ),
    });
    const now = () => bus.deck.slides.find((s) => s.id === slide.id)!;
    const box = () => now().elements.find((e) => e.id === line.id)!.frame;
    const seat = () =>
      bus.deck.layouts
        .find((l) => l.id === now().layoutId)!
        .placeholders.filter((p) => p.role === 'body')[3]!.frame;

    const [overflow] = of(await lintSlides(bus.deck, [slide.id], 'all', resolveAsset), 'L01');
    expect(overflow?.elementIds).toEqual([line.id]);
    bus.batch(overflow!.fix!);
    // The fix made the box taller, where the layout put it.
    const grown = box();
    expect(grown).toEqual({ ...seat(), h: grown.h });
    expect(grown.h).toBeGreaterThan(seat().h);

    // The box goes to the seat the other template has for it, as tall as its text made it; before,
    // it stayed across the cards of the new template, as an element the user had placed by hand.
    bus.batch(applyTemplate(bus.deck, template('zerem')));
    expect(now().layoutId).toBe('l_zerem_cards');
    expect(box()).toEqual({ ...seat(), h: grown.h });
    // And back: the box the fix left.
    bus.batch(applyTemplate(bus.deck, template('tzuk')));
    expect(box()).toEqual(grown);
  });

  describe('the check of the open deck, on slides as they are really drawn', () => {
    const checkOf = (elements: Element[]) => {
      const slide = createSlide({ id: 's_1', elements });
      const bus = new CommandBus(deckOf([slide], 'en'), { validate: true });
      const check = new DesignCheck(bus, (deck, s) => measureDeckSlide(deck, s, resolveAsset), {
        rest: 0,
      });
      const onElements = async () => (await check.check()).filter((f) => f.elementIds.length > 0);
      return { bus, check, onElements };
    };
    const small = (text: string, size: number) => richText(text, { dir: 'ltr', marks: { size } });

    test('small text made readable gets the box it needs: the warning does not come back as an error', async () => {
      // A footnote at 18px that fills the two lines of its box, as a conversion measures it.
      const { bus, check, onElements } = checkOf([
        createElement.text({
          id: 'e_small',
          frame: { x: 200, y: 200, w: 620, h: 96 },
          content: small(
            'A footnote set at eighteen pixels: it fills the two lines of the box it was given and not one line more than that, as drawn.',
            18,
          ),
        }),
        createElement.shape({ id: 'e_card', frame: { x: 900, y: 200, w: 600, h: 500 } }),
      ]);
      const before = await onElements();
      expect(brief(before)).toEqual(['L04 e_small']);
      expect(await check.fix(before[0]!, 'Fix')).toBe(true);
      // At 24px the text is taller than the box that fitted it. The same step made the box
      // taller; before, "Fix" left "L01: the text is 35px taller than its box", an error.
      expect(brief(await onElements())).toEqual([]);
      const after = bus.deck.slides[0]!.elements[0]!;
      expect(after.frame.h).toBeGreaterThan(96);
      expect(bus.undoStack).toHaveLength(1);
    });

    test('"fix all" leaves nothing a second "fix all" would fix', async () => {
      const card = (id: string, x: number, y: number) =>
        createElement.shape({ id, frame: { x, y, w: 400, h: 260 } });
      const { bus, check, onElements } = checkOf([
        card('e_1', 96, 300),
        card('e_2', 520, 303),
        card('e_3', 951, 300),
        card('e_4', 1400, 300),
        createElement.text({
          id: 'e_t1',
          frame: { x: 116, y: 320, w: 360, h: 60 },
          content: en('A heading that is far too long for the one line it has'),
        }),
        // Too small, and too long for its box at once: the box is fitted, then the size is
        // raised, and the box no longer fits. The fix of the box has to be tried again.
        createElement.text({
          id: 'e_t2',
          frame: { x: 540, y: 322, w: 360, h: 40 },
          content: small('Small print of the second card, set at sixteen', 16),
        }),
        createElement.text({
          id: 'e_t3',
          frame: { x: 971, y: 320, w: 360, h: 60 },
          content: en('Pale text', 'body', '#d9d9d9'),
        }),
      ]);
      expect((await onElements()).some((f) => f.severity === 'error')).toBe(true);
      expect(await check.fixAll('Fix all')).toBeGreaterThan(0);
      const left = await onElements();
      expect(left.filter((f) => f.severity === 'error')).toEqual([]);
      expect(left.filter((f) => f.fix && f.severity !== 'info')).toEqual([]);
      const settled = bus.deck;
      expect(await check.fixAll('Fix all')).toBe(0);
      expect(bus.deck).toBe(settled);
      expect(bus.undoStack).toHaveLength(1);
    });
  });

  test('the text a chart draws is judged for the user, and never for the agent', async () => {
    const chart = createElement.chart({
      id: 'e_chart',
      frame: { x: 160, y: 160, w: 1600, h: 760 },
      chartType: 'column',
      data: {
        categories: ['Q1', 'Q2', 'Q3'],
        series: [{ name: 'Revenue', values: [24, 26, 28] }],
      },
    });
    // The base theme draws a chart's text dark, and here the slide behind it is dark.
    const dark = { background: { fill: { kind: 'solid' as const, color: { value: '#14181d' } } } };
    const { findings } = await check([chart], dark, 'en');
    expect(brief(findings)).toEqual(['L04 e_chart', 'L05 e_chart']);
    expect(of(findings, 'L05')[0]?.message).toMatch(
      /^Text of the chart in #[0-9a-f]{6} has a contrast/,
    );
    expect(await lint([chart], dark, 'en')).toEqual([]);
    // On the theme's own ground the same chart reads; its 22px labels are the base theme's caption.
    expect(brief((await check([chart], {}, 'en')).findings)).toEqual(['L04 e_chart']);
  });

  test('the Deck API hands findings on without the commands that fix them', async () => {
    const [finding] = await lint([
      createElement.text({
        id: 'e_body',
        frame: { x: 1360, y: 340, w: 400, h: 60 },
        content: he('טקסט ארוך מדי בשביל תיבה של שורה אחת בלבד.'),
      }),
    ]);
    expect(finding?.rule).toBe('L01');
    expect(Object.keys(finding!).sort()).toEqual([
      'elementIds',
      'message',
      'rule',
      'severity',
      'slideId',
    ]);
  });
});
