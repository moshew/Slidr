import { createDeck, type Theme } from '@slidr/model';
import { it } from 'vitest';
import { page } from 'vitest/browser';
import { cardBox } from '../../../apps/desktop/src/objects/card';
import fixture from './card-variants.fixture.json';
import { convertHtml } from './service';
import { testHost } from './testing';

it('finds the minimal native card markup', async () => {
  await page.viewport(1920, 1080);
  const deck = createDeck({ lang: 'he', theme: fixture.theme as Theme });
  const host = testHost();
  const noRole = fixture.html.replaceAll(' data-role="body"', '');
  const face = 'border-radius:24px;border:5px solid var(--color-text);';
  const variants = [
    ['original', fixture.html],
    ['no-role', noRole],
    ['no-border', noRole.replace(face, 'border-radius:24px;')],
    ['square', noRole.replace(face, 'border:5px solid var(--color-text);')],
    ['border-2', noRole.replace(face, 'border-radius:24px;border:2px solid var(--color-text);')],
    ['border-4', noRole.replace(face, 'border-radius:24px;border:4px solid var(--color-text);')],
    ['radius-16', noRole.replace(face, 'border-radius:16px;border:5px solid var(--color-text);')],
    ['radius-20', noRole.replace(face, 'border-radius:20px;border:5px solid var(--color-text);')],
    ['radius-23', noRole.replace(face, 'border-radius:23px;border:5px solid var(--color-text);')],
    ['radius-25', noRole.replace(face, 'border-radius:25px;border:5px solid var(--color-text);')],
  ] as const;
  const results = [];
  for (const [name, html] of variants) {
    const r = await convertHtml(html, deck, host, deck.size);
    const groups = r.slide.elements.filter((e) => e.type === 'group');
    results.push({
      name,
      fallbacks: r.guard.fallbacks.map((f) => f.reason),
      groups: groups.length,
      cardBoxes: groups.filter((g) => cardBox(g)).length,
      faces: groups.map((g) => g.children[0]?.type),
    });
  }
  throw new Error(JSON.stringify(results));
});
