/**
 * A deck the agent drew freely, switched between the built-in templates (THM-04), in the engine
 * WebView2 uses. The agent builds its slides on no layout (ADR-063: none of 49), so a switch
 * reaches them through the theme alone: through the tokens, and through what a slide holds of
 * the theme as a copy and `followTheme` hands over. The slide is written as HTML and converted,
 * switched, rendered, and judged by the real lint.
 *
 * The slide is the one a user's deck broke on: a figure and two lines of text over a glow in a
 * colour of the theme. On the template it was built for the glow is a shade darker than the
 * ground. Kept in that colour on a light template, it was a dark blot under dark text: the lint
 * reported the contrast, and its fix laid a black veil under white letters.
 */
import { createConversionService } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { CommandBus, type Deck, type ShapeElement, type Slide } from '@slidr/model';
import { applyTemplate, deckFromTemplate } from '@slidr/templates';
import { builtInTemplates } from '@slidr/templates/builtin';
import { beforeAll, describe, expect, test } from 'vitest';
import { brief, lint, prepare } from './acceptance';

const templates = builtInTemplates();
const zohar = templates.find((template) => template.theme.id === 'zohar')!;
const others = templates.filter((template) => template !== zohar);

const HTML = `<div dir="rtl" lang="he" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:var(--color-bg);font-family:var(--font-body);color:var(--color-text)">
  <div data-name="glow" style="position:absolute;left:1220px;top:60px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--color-surface) 80%, transparent) 0%, transparent 70%)"></div>
  <div data-name="card" style="position:absolute;left:96px;top:268px;width:810px;height:674px;box-sizing:border-box;border-radius:var(--radius);background:color-mix(in srgb, var(--color-surface) 40%, transparent);border:1px solid color-mix(in srgb, var(--color-secondary) 45%, transparent)"></div>
  <h1 data-role="title" style="position:absolute;right:96px;top:122px;margin:0;font:700 64px/1.15 var(--font-heading)">נוצרות יותר משרות</h1>
  <div data-role="number" dir="ltr" style="position:absolute;right:96px;top:268px;font:700 200px/1.06 var(--font-heading)">+78M</div>
  <p data-role="subtitle" style="position:absolute;right:96px;top:500px;margin:0;font:600 40px/1.2 var(--font-heading)">תוספת משרות נטו בעולם עד 2030</p>
  <p data-role="body" style="position:absolute;right:96px;top:568px;width:800px;margin:0;font-size:28px;line-height:1.5">170 מיליון משרות חדשות מול 92 מיליון שייעלמו, לפי הפורום הכלכלי העולמי.</p>
</div>`;

/** The glow as a deck holds it that was converted before the link to the theme was kept. */
const FROZEN =
  'radial-gradient(circle, color(srgb 0.247059 0.101961 0.690196 / 0.8) 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat';

let written: Slide;

const shape = (slide: Slide, name: string) =>
  slide.elements.find((e): e is ShapeElement => e.type === 'shape' && e.name === name)!;

/** A deck on Zohar with the one slide; `glow` replaces the CSS of its glow. */
function deckOf(glow?: string): Deck {
  const deck = deckFromTemplate(zohar, { lang: 'he' });
  const slide = structuredClone(written);
  if (glow) shape(slide, 'glow').fill = { kind: 'css', value: glow };
  return { ...deck, slides: [slide] };
}

/** What the lint says of colour once the deck is switched: unreadable text, and strays. */
async function colourFindings(deck: Deck): Promise<string[]> {
  const found = await lint.lint(deck, [deck.slides[0]!.id], 'all');
  return found.filter((f) => f.rule === 'L05' || f.rule === 'L11').map((f) => brief(f, deck));
}

beforeAll(async () => {
  await prepare();
  const conversion = createConversionService(testHost());
  const converted = await conversion.htmlToSlide(deckFromTemplate(zohar, { lang: 'he' }), {
    html: HTML,
  });
  expect(converted.editability).toBe(1);
  written = converted.slide;
});

describe('a slide drawn on no layout, switched to another template', () => {
  test('the conversion keeps the glow as CSS that follows the theme', () => {
    expect(shape(written, 'glow').fill).toEqual({
      kind: 'css',
      value:
        'radial-gradient(circle, color-mix(in srgb, var(--color-surface) 80%, transparent) 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat',
    });
    expect(shape(written, 'card').effects).toEqual({ radius: zohar.theme.radius });
  });

  test('it reads on every built-in template, and is drawn in none but the template', async () => {
    const left: string[] = [];
    for (const to of others) {
      const bus = new CommandBus(deckOf(), { validate: true });
      bus.batch(applyTemplate(bus.deck, to));
      const [slide] = bus.deck.slides;
      // The card has the corners of the template it is on.
      expect(shape(slide!, 'card').effects?.radius, to.theme.id).toBe(to.theme.radius);
      for (const finding of await colourFindings(bus.deck)) left.push(`${to.theme.id}: ${finding}`);
    }
    expect(left).toEqual([]);
  }, 300_000);

  test('a deck that holds the glow as the colour it was converted to follows as well', async () => {
    // What a switch of the theme alone leaves: the purple of Zohar under the ink of Defus.
    const defus = others.find((template) => template.theme.id === 'defus')!;
    const themeOnly = new CommandBus(deckOf(FROZEN), { validate: true });
    themeOnly.dispatch({ type: 'theme.replace', theme: structuredClone(defus.theme) });
    expect((await colourFindings(themeOnly.deck)).join('\n')).toMatch(/L05/);

    const left: string[] = [];
    for (const to of others) {
      const bus = new CommandBus(deckOf(FROZEN), { validate: true });
      bus.batch(applyTemplate(bus.deck, to));
      expect(shape(bus.deck.slides[0]!, 'glow').fill).toEqual(shape(written, 'glow').fill);
      for (const finding of await colourFindings(bus.deck)) left.push(`${to.theme.id}: ${finding}`);
      // One step, and the way back.
      bus.undo();
      expect(shape(bus.deck.slides[0]!, 'glow').fill).toEqual({ kind: 'css', value: FROZEN });
    }
    expect(left).toEqual([]);
  }, 300_000);
});
