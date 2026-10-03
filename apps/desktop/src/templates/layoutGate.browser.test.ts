/**
 * The design check against the built-in templates (SPEC 9.4; ADR-039, "needed outside the
 * scope"): a slide that `slide_create` builds from a layout exactly as the template drew it
 * must not be held by the check for what the template itself drew. Every layout of the three
 * templates goes through the real Deck API, the real renderer and lint, and the real
 * `TurnWatch`, in Hebrew and in English.
 */
import {
  createDeckApi,
  startTurn,
  type CaptureService,
  type LintFinding,
  type RoleContent,
} from '@slidr/agent-tools';
import { CommandBus, plainText, type PlaceholderRole } from '@slidr/model';
import { deckFromTemplate, type RoleFill } from '@slidr/templates';
import { builtInSamples, builtInTemplates, type SampleSlide } from '@slidr/templates/builtin';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { TurnWatch } from '../agent/qualityGate';
import { registerBuiltinFonts } from '../fonts';
import { createLintService } from '../lint/deckLint';
import { createLayoutService } from './layoutService';
import { pictureUrl } from './pictures';

const lint = createLintService(pictureUrl);
const LANGUAGES = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;

/** The render that comes back with the slide: what the check counts as the agent's look. */
const capture: CaptureService = {
  renderSlide: (_deck, _slideId, { width }) =>
    Promise.resolve({ mimeType: 'image/png', data: 'AAAA', width }),
  renderContactSheet: () => Promise.reject(new Error('not used')),
};

/** The words a slide may hold before the lint calls it too much text (L13). */
const WORD_LIMIT = 60;

/** The first words of a text. */
function cut(text: string, words: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, words).join(' ');
}

/**
 * The content of a sample slide as an agent hands it to `slide_create`: Markdown by role.
 * `words` shortens every text to its first words, so that the slide as a whole stays under the
 * limit of L13: how much a slide says is the agent's choice, not the layout's.
 */
function contentOf(sample: SampleSlide, words?: number) {
  const fill = (value: RoleFill): RoleContent => {
    if (!('paragraphs' in value)) return value;
    const text = plainText(value);
    return words === undefined ? text : cut(text, words);
  };
  const content: Partial<Record<PlaceholderRole, RoleContent | RoleContent[]>> = {};
  for (const [role, value] of Object.entries(sample.content)) {
    if (value === undefined) continue;
    content[role as PlaceholderRole] = Array.isArray(value)
      ? (value as readonly RoleFill[]).map(fill)
      : fill(value as RoleFill);
  }
  return content;
}

/** How many texts a sample puts on its slide. */
function texts(sample: SampleSlide): number {
  return Object.values(sample.content)
    .flatMap((value): readonly RoleFill[] =>
      value === undefined
        ? []
        : Array.isArray(value)
          ? (value as readonly RoleFill[])
          : [value as RoleFill],
    )
    .filter((value) => 'paragraphs' in value).length;
}

interface Held {
  template: string;
  lang: string;
  layout: string;
  content: 'sample' | 'brief';
  unseen: boolean;
  findings: string[];
}
const held: Held[] = [];
const rule = (finding: LintFinding) => finding.rule;

beforeAll(async () => {
  await page.viewport(1920, 1080);
  registerBuiltinFonts();
});

afterAll(async () => {
  await commands.writeFile(
    'apps/desktop/test-results/ai-finish/layout-gate.json',
    JSON.stringify(held, null, 2),
  );
});

describe.each(builtInTemplates().map((template) => [template.theme.id, template] as const))(
  'slide_create on the %s template',
  (id, template) => {
    test.each(LANGUAGES)(
      'every layout passes the design check in the first round, in $lang',
      { timeout: 180_000 },
      async ({ lang, dir }) => {
        const samples = builtInSamples[id]![lang];
        // Every layout is shown by the sample, so the sample covers the template.
        expect(new Set(samples.map((sample) => sample.layout)).size).toBe(template.layouts.length);

        for (const content of ['sample', 'brief'] as const) {
          for (const sample of samples) {
            const deck = deckFromTemplate(template, { lang, dir });
            // The pictures of the sample: the agent places assets the deck already has.
            deck.assets = { ...deck.assets, ...template.assets };
            const bus = new CommandBus(deck, { validate: true });
            const api = createDeckApi(bus, { layouts: createLayoutService(), lint, capture });
            const watch = new TurnWatch();
            const turn = startTurn('sess', { kind: 'deck' });
            bus.subscribe((event) => {
              if (event.kind === 'apply' && event.txId === turn.txId) watch.changed(event);
            });

            const words =
              content === 'brief'
                ? Math.max(1, Math.floor((WORD_LIMIT - 4) / Math.max(1, texts(sample))))
                : undefined;
            const result = await api.call(turn, 'slide_create', {
              layoutId: sample.layout,
              content: contentOf(sample, words),
            });
            if (!result.ok) throw new Error(`${sample.layout}: ${result.error.message}`);
            // The slide comes back with its picture, as a slide written as HTML does.
            expect(result.images).toHaveLength(1);
            watch.noteResult(result, watch.mark());

            const report = await watch.review(bus.deck, { lint, canLook: true });
            const findings = report.findings.map(rule);
            if (report.unseen.length > 0 || findings.length > 0) {
              held.push({
                template: id,
                lang,
                layout: sample.layout,
                content,
                unseen: report.unseen.length > 0,
                findings,
              });
            }
            expect(report.unseen, `${sample.layout} (${content})`).toEqual([]);
            // What the template drew is never what holds the turn: no missing visual, no
            // empty slide, no error. With the reference deck's own text a slide may still say
            // too much (L13), which is about the text and not about the layout.
            expect(
              findings.filter((found) => content === 'brief' || found !== 'L13'),
              `${sample.layout} (${content})`,
            ).toEqual([]);
            expect(bus.undoStack).toHaveLength(1);
          }
        }
      },
    );
  },
);
