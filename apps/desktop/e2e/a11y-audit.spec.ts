import { expect, test } from '@playwright/test';
import { audit } from './a11y-helpers';
import { openApp } from './arrange-helpers';

/*
 * The accessibility audit (WG13-T06, UI-06, DSN-08): axe-core on a surface of the app, in the
 * light and the dark scheme and in Hebrew and English, held to no fault of serious or critical
 * impact: names and roles of controls, contrast, `lang` and `dir`.
 *
 * THIS IS A FIRST SLICE, NOT THE AUDIT OF THE APP. One surface is audited: the editor as it
 * opens. Every other surface (the panels of the Activity Bar, the tool sets of row B, popovers,
 * menus, dialogs, the welcome screen, the settings, the shortcut map, present mode) is not
 * audited yet, and neither are focus order, focus kept in a dialog and returned from it, and
 * visible focus, which axe-core does not judge.
 *
 * A fault this finds is fixed in the app, not left out of the audit. The faults in `OPEN` are
 * found and NOT YET FIXED: the test holds the surface to exactly those and no other, so a new
 * fault fails it, and so does fixing one of them: whoever fixes it takes it off the list. When the
 * list is empty the test says what it is meant to say: no fault.
 */

/** Faults of serious or critical impact that are known and open, by rule and by element. */
const OPEN = [
  {
    // The "new slide" button sits inside the listbox of the Filmstrip, which may hold options only.
    rule: 'aria-required-children',
    impact: 'critical',
    target: 'div[role="listbox"]',
  },
  {
    // The listbox of the Filmstrip has no name of its own: the name is on the region around it.
    rule: 'aria-input-field-name',
    impact: 'serious',
    target: 'div[role="listbox"]',
  },
];

const byRule = (a: { rule: string }, b: { rule: string }) => a.rule.localeCompare(b.rule);

const combinations = (['he', 'en'] as const).flatMap((lang) =>
  (['light', 'dark'] as const).map((theme) => ({ lang, theme })),
);

for (const { lang, theme } of combinations) {
  test.describe(`${lang}, ${theme}`, () => {
    test('the editor as it opens has the open faults of the Filmstrip and no other', async ({
      page,
    }) => {
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
