import { expect, test } from '@playwright/test';
import { audit } from './a11y-helpers';
import { openApp } from './arrange-helpers';

/*
 * The accessibility audit (WG13-T06, UI-06, DSN-08): axe-core on a surface of the app, in the
 * light and the dark scheme and in Hebrew and English, held to no fault of serious or critical
 * impact: names and roles of controls, contrast, `lang` and `dir`.
 *
 * THIS IS STILL ONE SURFACE, NOT THE AUDIT OF THE APP: the editor as it opens. The other
 * surfaces are added by the commits that follow this one.
 *
 * A fault this finds is fixed in the app, not left out of the audit. A fault that is found and
 * not fixed yet is written in `OPEN`, with its reason: the test holds a surface to exactly
 * those and no other, so a new fault fails it, and so does fixing one of them, until it is
 * taken off the list. With the list empty a passing test says what it is meant to say: no fault.
 */

/** Faults of serious or critical impact that are known and open, by rule and by element. */
const OPEN: { rule: string; impact: string; target: string }[] = [];

const byRule = (a: { rule: string }, b: { rule: string }) => a.rule.localeCompare(b.rule);

const combinations = (['he', 'en'] as const).flatMap((lang) =>
  (['light', 'dark'] as const).map((theme) => ({ lang, theme })),
);

for (const { lang, theme } of combinations) {
  test.describe(`${lang}, ${theme}`, () => {
    test('the editor as it opens', async ({ page }) => {
      await openApp(page, { lang, theme });
      // The page says its language and its direction, which every reading of it starts from.
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
      const found = (await audit(page)).map(({ rule, impact, target }) => ({
        rule,
        impact,
        target,
      }));
      expect(found.sort(byRule)).toEqual([...OPEN].sort(byRule));
    });
  });
}
