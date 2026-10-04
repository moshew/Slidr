/**
 * What a built-in template has to pass (the acceptance criteria of WG7), as tests a browser test
 * file asks for: every layout with content on it, in Hebrew and in English, through the real
 * renderer and the real lint; the model's sample decks switched to it; and a picture of its
 * sample deck in each language, for the eye. One template at a time, so a template that is
 * still being drawn is tried without the others.
 *
 * The pictures land in `apps/desktop/test-results/design/templates/`; the paths are given from
 * the folder of the test file, which is this one.
 */
import type { LintFinding } from '@slidr/agent-tools';
import { CommandBus, type Deck } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { renderSlideOffscreen, type OffscreenSlide } from '@slidr/renderer';
import { applyTemplate, type Template } from '@slidr/templates';
import { sampleDeck, type SampleSlide } from '@slidr/templates/builtin';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { registerBuiltinFonts } from '../fonts';
import { createLintService } from '../lint/deckLint';
import { pictureAssets, pictureUrl } from './pictures';

export const LANGUAGES = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;

export type Samples = Record<(typeof LANGUAGES)[number]['lang'], SampleSlide[]>;

export interface RebuiltSlide {
  name: string;
  layout: string;
  /** The slide as the renderer draws it, with pictures as `images/<file>`. */
  html: string;
  lint: Pick<LintFinding, 'rule' | 'severity' | 'message'>[];
}

/** What the tests of the templates found, for the index page of `docs/reference-decks`. */
export interface TemplateReport {
  /** By `<template>.<lang>`: the sample deck of the template, slide by slide. */
  rebuilt: Record<string, RebuiltSlide[]>;
  switches: { from: string; to: string; lang: string; errors: string[] }[];
  /** By template: the errors left on the model's sample decks after a switch to it. */
  fixtures: Record<string, string[]>;
}

export const emptyReport = (): TemplateReport => ({ rebuilt: {}, switches: [], fixtures: {} });

export const lint = createLintService(pictureUrl);

const SHOTS = '../../test-results/design/templates';

export const brief = (finding: LintFinding) => `${finding.rule}: ${finding.message.slice(0, 160)}`;
export const errors = (findings: LintFinding[]) => findings.filter((f) => f.severity === 'error');

/** Before the first test of a file: the viewport of a slide, and the fonts the templates name. */
export async function prepare(): Promise<void> {
  await page.viewport(1920, 1080);
  registerBuiltinFonts();
}

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

const SHEET = { columns: 4, gap: 8, ground: '#0e1014' };

/**
 * A picture of a whole deck: every slide small, four to a row, as a contact sheet. With `each`,
 * also every slide by itself at its full size, as `<name>-<nn>.png`.
 */
export async function contactSheet(deck: Deck, name: string, each = false): Promise<void> {
  const { columns, gap, ground } = SHEET;
  const k = (1920 - gap * (columns + 1)) / columns / 1920;
  const rows = Math.ceil(deck.slides.length / columns);
  const height = Math.ceil(rows * 1080 * k + gap * (rows + 1));
  const board = document.createElement('div');
  board.style.cssText = `position:fixed;left:0;top:0;width:1920px;height:${height}px;background:${ground};z-index:2147483647`;
  document.body.append(board);
  const drawn: OffscreenSlide[] = [];
  try {
    for (const [i, slide] of deck.slides.entries()) {
      const cell = document.createElement('div');
      const x = gap + (i % columns) * (1920 * k + gap);
      const y = gap + Math.floor(i / columns) * (1080 * k + gap);
      cell.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:1920px;height:1080px;transform:scale(${k});transform-origin:0 0`;
      board.append(cell);
      drawn.push(
        await renderSlideOffscreen(
          { deck, slide, mode: 'thumbnail', resolveAsset: pictureUrl },
          { parent: cell, hidden: false },
        ),
      );
    }
    await page.viewport(1920, height);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    if (each) {
      await page.viewport(1920, 1080);
      for (const [i, slide] of deck.slides.entries()) {
        const full = await renderSlideOffscreen(
          { deck, slide, mode: 'thumbnail', resolveAsset: pictureUrl },
          { parent: board, hidden: false },
        );
        full.container.style.zIndex = '1';
        try {
          await page.screenshot({
            path: `${SHOTS}/${name}-${String(i + 1).padStart(2, '0')}.png`,
          });
        } finally {
          full.dispose();
        }
      }
    }
  } finally {
    for (const slide of drawn) slide.dispose();
    board.remove();
    await page.viewport(1920, 1080);
  }
}

/** The errors the lint leaves on a sample deck of `from` once it is switched to `to`. */
export async function switchErrors(
  from: { template: Template; samples: Samples },
  to: Template,
  { lang, dir }: (typeof LANGUAGES)[number],
): Promise<{ findings: LintFinding[]; cameFrom: Map<string, string | undefined> }> {
  const deck = sampleDeck(from.template, from.samples[lang], { lang, dir });
  const cameFrom = new Map(deck.slides.map((slide) => [slide.id, slide.layoutId]));
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(applyTemplate(deck, to));
  const ids = bus.deck.slides.map((s) => s.id);
  const findings = errors(await lint.lint(bus.deck, ids, 'all'));
  // Whatever the lint says, the switch is one step and takes every slide along.
  expect(bus.deck.slides.every((slide) => to.layouts.some((l) => l.id === slide.layoutId))).toBe(
    true,
  );
  bus.undo();
  expect(bus.deck).toEqual(deck);
  return { findings, cameFrom };
}

export interface AcceptOptions {
  /** Where the findings go, for the index page. */
  report?: TemplateReport;
  /** Also a picture of every slide by itself, at its full size. */
  each?: boolean;
}

/** The tests of one template. Call inside a `describe` of the template, after `prepare`. */
export function acceptTemplate(
  id: string,
  template: Template,
  samples: Samples,
  { report = emptyReport(), each = false }: AcceptOptions = {},
): void {
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
      report.rebuilt[`${id}.${lang}`] = slides;
      await contactSheet(deck, `${id}.${lang}`, each);
      expect(found).toEqual([]);
    },
  );

  test(
    'switching the sample decks of the model to it leaves no error but the one known',
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
      report.fixtures[id] = found;
      // These decks have no layouts, so a switch only changes their theme. Their opening
      // title sits in a box drawn by hand for two lines of the base theme's display style
      // (112px); a template that sets its display larger overflows that one box, and nothing
      // else. Reported in ADR-039 as it is: the lint is right about it.
      expect(found.filter((f) => !/ L01 e_(he|en)_hero_title$/.test(f))).toEqual([]);
    },
  );

  test(
    'the same opening slide, once it names its archetype, takes the layout and leaves no error',
    { timeout: 120_000 },
    async () => {
      const found: string[] = [];
      for (const make of [fixtureDecks.hebrewDeck, fixtureDecks.englishDeck]) {
        const before = make();
        // What `slide_create_from_html` writes on a slide (ADR-026), and a slide drawn by
        // hand lacks: with it the title moves to the template's own frame.
        before.slides[0]!.archetype = 'hero';
        const bus = new CommandBus(before, { validate: true });
        bus.batch(applyTemplate(before, template));
        const opening = bus.deck.slides[0]!;
        expect(template.layouts.find((l) => l.id === opening.layoutId)?.archetype).toBe('hero');
        const findings = await lint.lint(bus.deck, [opening.id], 'all');
        found.push(...errors(findings).map(brief));
        bus.undo();
        expect(bus.deck).toEqual(before);
      }
      expect(found).toEqual([]);
    },
  );
}
