/**
 * The built-in templates in the engine WebView2 uses: every layout of every template with
 * content on it, in Hebrew and in English, through the real renderer and the real lint
 * (the acceptance criteria of WG7, in `acceptance.ts`), and the sample decks rebuilt from the
 * templates, for the index page of `docs/reference-decks`.
 */
import { builtInSamples, builtInTemplates } from '@slidr/templates/builtin';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import {
  acceptTemplate,
  brief,
  emptyReport,
  knownSwitchError,
  LANGUAGES,
  prepare,
  switchErrors,
} from './acceptance';

const templates = builtInTemplates();
const report = emptyReport();

beforeAll(prepare);

afterAll(async () => {
  // In a hook the path is taken from the root of the repository.
  await commands.writeFile(
    'apps/desktop/test-results/templates/rebuilt-report.json',
    JSON.stringify(report, null, 2),
  );
});

describe.each(templates.map((template) => [template.theme.id, template] as const))(
  'the %s template',
  (id, template) => acceptTemplate(id, template, builtInSamples[id]!, { report }),
);

describe('switching between the built-in templates', () => {
  // A deck written for the frames and the type sizes of one template, moved to another. The
  // templates seat the same roles, so the text of a slide finds its place. What is left is the
  // one thing a single template seats and the others do not: the photographs of the marketing
  // template's cards. They stay where they were (nothing is deleted by a switch), the text of
  // the other template's cards lands on them, and the lint reports its contrast.
  test('every sample deck on every other template', { timeout: 900_000 }, async () => {
    const unexpected: string[] = [];
    for (const from of templates) {
      for (const to of templates) {
        if (from === to) continue;
        for (const language of LANGUAGES) {
          const { findings, cameFrom } = await switchErrors(
            { template: from, samples: builtInSamples[from.theme.id]! },
            to,
            language,
          );
          report.switches.push({
            from: from.theme.id,
            to: to.theme.id,
            lang: language.lang,
            errors: findings.map(brief),
          });
          unexpected.push(
            ...findings
              .filter((f) => !knownSwitchError(f, cameFrom))
              .map((f) => `${from.theme.id} to ${to.theme.id}, ${language.lang}: ${brief(f)}`),
          );
        }
      }
    }
    expect(unexpected).toEqual([]);
  });
});
