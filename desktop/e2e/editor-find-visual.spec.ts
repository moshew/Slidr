import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';
import { bar, count, query, replacement, status } from './editor-find-helpers';

/*
 * Screenshots for the design gate (DSN-09) of the find bar: the find row with the marks on the
 * Stage, the replace row with a remark, and the bar after "replace all" and without a match, in
 * both themes, both directions and both target resolutions. Written to test-results/editor/ to be
 * looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/find-${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const text = {
  he: {
    word: 'רבעון',
    other: 'חודש',
    absent: 'שנה',
    title: ['תוכנית ה', 'רבע', 'ון'],
    body: ['רבעון ראשון: צמיחה של 12%', 'ברבעון השני נשיק את Slidr', 'יעד: רבעון שלישי רווחי'],
    card: 'יעדי רבעון',
    locked: 'רבעון נעול',
  },
  en: {
    word: 'quarter',
    other: 'month',
    absent: 'year',
    title: ['The ', 'quar', 'ter plan'],
    body: [
      'First quarter: growth of 12%',
      'In the second quarter we launch Slidr',
      'Goal: a profitable third quarter',
    ],
    card: 'Quarter goals',
    locked: 'A locked quarter',
  },
};

/** A slide with the word in a title of three runs, in a list, on a filled card and in a locked box. */
async function populate(page: Page, lang: 'he' | 'en') {
  await page.evaluate((t) => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    const base = { rotation: 0, opacity: 1 };
    const para = (runs: { text: string; marks?: { weight: number } }[], extra = {}) => ({
      dir: 'auto' as const,
      align: 'start' as const,
      runs,
      ...extra,
    });
    const box = (
      id: string,
      frame: { x: number; y: number; w: number; h: number },
      paragraphs: ReturnType<typeof para>[],
      extra = {},
    ) => ({
      type: 'element.add' as const,
      slideId,
      element: {
        id,
        type: 'text' as const,
        frame,
        ...base,
        autoFit: 'none' as const,
        vAlign: 'top' as const,
        content: { paragraphs },
        ...extra,
      },
    });
    const [start = '', bold = '', end = ''] = t.title;
    bus.batch([
      box('e_title', { x: 160, y: 200, w: 1600, h: 120 }, [
        para([{ text: start }, { text: bold, marks: { weight: 800 } }, { text: end }], {
          styleRef: 'title',
        }),
      ]),
      box(
        'e_body',
        { x: 160, y: 380, w: 1000, h: 300 },
        t.body.map((line) => para([{ text: line }], { list: { kind: 'bullet', level: 0 } })),
      ),
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_card',
          type: 'shape',
          frame: { x: 1240, y: 380, w: 520, h: 300 },
          ...base,
          geometry: { kind: 'preset', preset: 'roundRect' },
          fill: { kind: 'solid', color: { token: 'primary' } },
          content: {
            paragraphs: [para([{ text: t.card }], { align: 'center', styleRef: 'heading' })],
          },
        },
      },
      box('e_locked', { x: 160, y: 780, w: 1600, h: 80 }, [para([{ text: t.locked }])], {
        locked: true,
      }),
    ]);
  }, text[lang]);
  await page.getByTestId('stage-surface').locator('[data-element-id="e_locked"]').waitFor();
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** The bar with some room around it. */
async function closeUp(page: Page) {
  const box = (await bar(page).boundingBox())!;
  const pad = 16;
  return {
    x: Math.max(0, box.x - pad),
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the find bar over the Stage: ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await populate(page, lang);
        const t = text[lang];
        const region = (await page.getByTestId('stage').boundingBox())!;

        // The find row, on the second of six matches; the others are marked softly.
        await page.keyboard.press('Control+f');
        await query(page).fill(t.word);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await expect(count(page)).toHaveText('2 / 6');
        await settle(page);
        await page.screenshot({ path: out(`step-${name}`), clip: region });

        // The replace row, on the match in the locked box, with the keyboard in the replace field.
        await page.keyboard.press('Control+h');
        await page.keyboard.press('Shift+Enter');
        await page.keyboard.press('Shift+Enter');
        await expect(count(page)).toHaveText('6 / 6');
        await replacement(page).fill(t.other);
        await expect(status(page)).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`replace-${name}`), clip: region });

        // After "replace all": what was done, and the one match the lock kept.
        await page.getByTestId('find-replace-all').click();
        await expect(count(page)).toHaveText('1');
        await page.mouse.move(region.x + region.width / 2, region.y + region.height - 40);
        await settle(page);
        await page.screenshot({ path: out(`outcome-${name}`), clip: await closeUp(page) });

        // No match.
        await query(page).fill(t.absent);
        await expect(count(page)).not.toHaveText('1');
        await settle(page);
        await page.screenshot({ path: out(`none-${name}`), clip: await closeUp(page) });
      });
    }
  }
}
