import { expect, test } from '@playwright/test';
import { createElement, createSlide, richText, type Deck, type ShapeElement } from '@slidr/model';
import { deckFromTemplate } from '@slidr/templates';
import { builtInTemplates } from '@slidr/templates/builtin';
import { checked, collectErrors, deck, openCheck, shown, undo, undoSteps } from './design-helpers';
import { card, panel as templates } from './templates-helpers';

/*
 * A slide the agent drew on no layout, switched to another template from the Templates panel,
 * and what the Design check then says of it (THM-04, LNT-03). The slide holds a glow in the
 * colour of its first template as numbers, the way a deck holds it that was converted before
 * the link to the theme was kept: on a light template it was a dark blot under dark text.
 */

const FROZEN =
  'radial-gradient(circle, color(srgb 0.247059 0.101961 0.690196 / 0.8) 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat';

function drawnDeck(): Deck {
  const zohar = builtInTemplates().find((template) => template.theme.id === 'zohar')!;
  const base = deckFromTemplate(zohar, { lang: 'he' });
  const text = (id: string, y: number, h: number, words: string, styleRef: 'heading' | 'body') =>
    createElement.text({
      id,
      frame: { x: 1024, y, w: 800, h },
      content: richText(words, { styleRef }),
    });
  return {
    ...base,
    slides: [
      createSlide({
        id: 's_drawn',
        elements: [
          createElement.shape({
            id: 'e_glow',
            frame: { x: 1220, y: 60, w: 900, h: 900 },
            geometry: { kind: 'preset', preset: 'ellipse' },
            fill: { kind: 'css', value: FROZEN },
          }),
          createElement.shape({
            id: 'e_card',
            frame: { x: 96, y: 268, w: 810, h: 674 },
            fill: { kind: 'solid', color: { token: 'surface', alpha: 0.4 } },
            effects: { radius: zohar.theme.radius },
          }),
          text('e_line', 500, 55, 'תוספת משרות נטו בעולם עד 2030', 'heading'),
          text('e_body', 568, 90, '170 מיליון משרות חדשות מול 92 מיליון שייעלמו.', 'body'),
        ],
      }),
    ],
  };
}

/** The findings about colour among those the panel shows. */
const ofColour = async (page: Parameters<typeof shown>[0]) =>
  (await shown(page)).filter((finding) => /L05|L11/.test(finding));

test('a drawn slide follows a template it is switched to, and the check finds its text readable', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openCheck(page, { deck: drawnDeck() });
  expect(await ofColour(page)).toEqual([]);

  await page.locator('[data-panel="templates"]').click();
  await expect(templates(page)).toBeVisible();
  await card(page, 'defus').getByRole('button', { name: 'החלה על המצגת' }).click();
  await expect(card(page, 'defus')).toHaveAttribute('data-current', 'true');

  const after = await deck(page);
  const [glow, box] = after.slides[0]!.elements as ShapeElement[];
  expect(after.theme.id).toBe('defus');
  // The glow is the new template's surface, and the card has its square corners.
  expect(glow!.fill).toEqual({
    kind: 'css',
    value: FROZEN.replace(
      'color(srgb 0.247059 0.101961 0.690196 / 0.8)',
      'color-mix(in srgb, var(--color-surface) 80%, transparent)',
    ),
  });
  expect(box!.effects).toEqual({ radius: 0 });
  expect(await undoSteps(page)).toBe(1);

  await page.locator('[data-panel="lint"]').click();
  await checked(page);
  expect(await ofColour(page)).toEqual([]);

  await undo(page);
  const back = await deck(page);
  expect(back.theme.id).toBe('zohar');
  expect((back.slides[0]!.elements[0] as ShapeElement).fill).toEqual({
    kind: 'css',
    value: FROZEN,
  });
  expect(errors).toEqual([]);
});
