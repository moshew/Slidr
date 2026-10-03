/**
 * The built-in templates in the engine WebView2 uses: every layout of every template with
 * content on it, in Hebrew and in English, through the real renderer and the real lint
 * (the acceptance criteria of WG7), and the reference decks rebuilt from the templates, for
 * the index page of `docs/reference-decks`.
 */
import type { LintFinding } from '@slidr/agent-tools';
import { CommandBus, type Deck } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { renderSlideOffscreen } from '@slidr/renderer';
import { applyTemplate } from '@slidr/templates';
import { builtInSamples, builtInTemplates, sampleDeck } from '@slidr/templates/builtin';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { registerBuiltinFonts } from '../fonts';
import { createLintService } from '../lint/deckLint';
import { pictureAssets, pictureUrl } from './pictures';

const templates = builtInTemplates();
const lint = createLintService(pictureUrl);
const LANGUAGES = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;

interface RebuiltSlide {
  name: string;
  layout: string;
  /** The slide as the renderer draws it, with pictures as `images/<file>`. */
  html: string;
  lint: Pick<LintFinding, 'rule' | 'severity' | 'message'>[];
}
const rebuilt: Record<string, RebuiltSlide[]> = {};
const switches: { from: string; to: string; lang: string; errors: string[] }[] = [];
const fixtures: Record<string, string[]> = {};

const brief = (finding: LintFinding) => `${finding.rule}: ${finding.message.slice(0, 160)}`;
const errors = (findings: LintFinding[]) => findings.filter((f) => f.severity === 'error');

/** The static markup of a slide, for a page that shows it without the app. */
async function markup(deck: Deck, slideId: string): Promise<string> {
  const slide = deck.slides.find((s) => s.id === slideId)!;
  const rendered = await renderSlideOffscreen({
    deck,
    slide,
    mode: 'thumbnail',
    resolveAsset: pictureUrl,
  });
  try {
    let html = rendered.root.outerHTML;
    for (const asset of Object.values(pictureAssets)) {
      const url = pictureUrl(asset);
      if (url) html = html.split(url).join(`images/${asset.name}`);
    }
    return html;
  } finally {
    rendered.dispose();
  }
}

beforeAll(async () => {
  await page.viewport(1920, 1080);
  registerBuiltinFonts();
});

afterAll(async () => {
  // In a hook the path is taken from the root of the repository.
  await commands.writeFile(
    'apps/desktop/test-results/templates/rebuilt-report.json',
    JSON.stringify({ rebuilt, switches, fixtures }, null, 2),
  );
});

describe.each(templates.map((template) => [template.theme.id, template] as const))(
  'the %s template',
  (id, template) => {
    const samples = builtInSamples[id]!;

    test.each(LANGUAGES)(
      'every layout passes the lint with no error, in $lang',
      { timeout: 120_000 },
      async ({ lang, dir }) => {
        const deck = sampleDeck(template, samples[lang], { lang, dir });
        // Every layout is shown by the sample, so a clean sample is fourteen clean layouts.
        const shown = new Set(deck.slides.map((slide) => slide.layoutId));
        expect(template.layouts.filter((layout) => !shown.has(layout.id))).toEqual([]);

        const slides: RebuiltSlide[] = [];
        const found: string[] = [];
        for (const slide of deck.slides) {
          const findings = await lint.lint(deck, [slide.id], 'all');
          found.push(...errors(findings).map((f) => `"${slide.name}" ${brief(f)}`));
          slides.push({
            name: slide.name ?? slide.id,
            layout: slide.layoutId ?? '',
            html: await markup(deck, slide.id),
            lint: findings.map(({ rule, severity, message }) => ({ rule, severity, message })),
          });
        }
        rebuilt[`${id}.${lang}`] = slides;
        expect(found).toEqual([]);
      },
    );

    test(
      'switching the sample decks of the model to it leaves one known error',
      { timeout: 120_000 },
      async () => {
        const found: string[] = [];
        for (const [name, make] of Object.entries(fixtureDecks)) {
          // The test decks of the renderer hold findings of their own, by design (ADR-018).
          if (name === 'allElementsDeck' || name === 'referenceDeck') continue;
          const before = make();
          const bus = new CommandBus(before, { validate: true });
          bus.batch(applyTemplate(before, template));
          const ids = bus.deck.slides.map((s) => s.id);
          const findings = await lint.lint(bus.deck, ids, 'all');
          for (const finding of errors(findings)) {
            found.push(`${name} ${finding.rule} ${finding.elementIds.join(',')}`);
          }
          expect(bus.undoStack).toHaveLength(1);
        }
        fixtures[id] = found;
        // These decks have no layouts, so a switch only changes their theme. Their opening
        // title sits in a box drawn by hand for two lines of the base theme's display style
        // (112px); a template that sets its display larger overflows that one box, and nothing
        // else. Reported in ADR-039 as it is: the lint is right about it.
        expect(found.filter((f) => !/ L01 e_(he|en)_hero_title$/.test(f))).toEqual([]);
      },
    );
  },
);

describe('switching between the built-in templates', () => {
  // A measurement, not a criterion: a deck written for the frames and the type sizes of one
  // template, moved to another. What it finds goes to the report.
  test('every sample deck on every other template', { timeout: 300_000 }, async () => {
    for (const from of templates) {
      for (const to of templates) {
        if (from === to) continue;
        for (const { lang, dir } of LANGUAGES) {
          const deck = sampleDeck(from, builtInSamples[from.theme.id]![lang], { lang, dir });
          const bus = new CommandBus(deck, { validate: true });
          bus.batch(applyTemplate(deck, to));
          const ids = bus.deck.slides.map((s) => s.id);
          const findings = await lint.lint(bus.deck, ids, 'all');
          switches.push({
            from: from.theme.id,
            to: to.theme.id,
            lang,
            errors: errors(findings).map(brief),
          });
          // Whatever the lint says, the switch is one step and takes every slide along.
          expect(
            bus.deck.slides.every((slide) => to.layouts.some((l) => l.id === slide.layoutId)),
          ).toBe(true);
          bus.undo();
          expect(bus.deck).toEqual(deck);
        }
      }
    }
  });
});
