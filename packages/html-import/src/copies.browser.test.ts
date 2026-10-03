/**
 * The two ways to keep a region as HTML, measured against each other (PLAN WG9A-T06b; the gap
 * ADR-005 left open). Every fixture is turned into one `html` element, once from its original
 * markup and stylesheets and once from computed styles, and each copy is compared with the
 * source by the guard. The figures printed are the ones ADR-017 quotes.
 */
import { createDeck } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { htmlItem } from './convert';
import { startConversion } from './engine';
import * as fixtures from './fixtures';
import { copySubtree, type CopyStrategy } from './htmlCopy';
import { loadHtml } from './service';
import { testHost, testImage, withAssets } from './testing';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('HTML copies', () => {
  it('compares the markup copy and the computed-style copy of every fixture', async () => {
    const host = testHost();
    const png = testImage(640, 400);
    const bytes = new Uint8Array(await (await fetch(png)).arrayBuffer());
    const asset = await host.storeAsset(bytes, { mime: 'image/png' });
    const deck = withAssets(createDeck({ lang: 'en' }), [asset]);
    const cases: Record<string, string> = {
      englishAbsolute: fixtures.englishAbsolute,
      hebrewFlex: fixtures.hebrewFlex,
      gridCards: fixtures.gridCards,
      gradients: fixtures.gradients,
      images: fixtures.images(png),
      nestedScale: fixtures.nestedScale,
      stacking: fixtures.stacking,
      hidden: fixtures.hidden,
      pseudo: fixtures.pseudo,
      tables: fixtures.tables,
      themeUse: fixtures.themeUse,
      passthrough: fixtures.passthrough,
    };
    const same: Record<CopyStrategy, string[]> = { markup: [], computed: [] };
    const bytesOf: Record<CopyStrategy, number> = { markup: 0, computed: 0 };
    const lines: string[] = [];

    for (const [name, html] of Object.entries(cases)) {
      const loaded = await loadHtml(html, deck, host, deck.size);
      const conversion = await startConversion(loaded.root, {
        deck,
        host,
        foreign: false,
        behind: 'slide',
      });
      try {
        const { proposal } = conversion;
        const row: string[] = [name];
        for (const strategy of ['markup', 'computed'] as const) {
          const item = htmlItem(
            proposal.space,
            loaded.root,
            true,
            'the whole slide',
            () => `e_${strategy}`,
          );
          const copy = await copySubtree(loaded.root, strategy, {
            deep: true,
            parentScale: 1,
            foreign: false,
            storeImage: () => Promise.resolve(asset.id),
          });
          if (item.element.type !== 'html') throw new Error('not html');
          item.element.markup = copy.markup;
          if (copy.styles) item.element.styles = copy.styles;
          item.element.natural = copy.natural;
          proposal.items = [item];
          delete proposal.background;
          const verdict = await conversion.judge({ fit: false });
          const size = copy.markup.length + (copy.styles?.length ?? 0);
          bytesOf[strategy] += size;
          if (verdict.faithful) same[strategy].push(name);
          row.push(
            `${strategy}: ${verdict.faithful ? 'same' : `differs (${verdict.diffPixels} px)`}, ${(size / 1024).toFixed(1)} KB`,
          );
        }
        lines.push(row.join(' | '));
      } finally {
        conversion.dispose();
        loaded.dispose();
      }
    }
    const total = Object.keys(cases).length;
    console.log(
      [
        ...lines,
        `markup copy: ${same.markup.length} of ${total} look like the source, ${(bytesOf.markup / 1024).toFixed(0)} KB in all`,
        `computed-style copy: ${same.computed.length} of ${total} look like the source, ${(bytesOf.computed / 1024).toFixed(0)} KB in all`,
      ].join('\n'),
    );
    // The original markup is the copy the guard tries first: it has to hold for every fixture.
    expect(same.markup).toHaveLength(total);
    // The computed-style copy is the fallback for markup that cannot travel; it holds for most.
    expect(same.computed.length).toBeGreaterThanOrEqual(6);
    expect(bytesOf.markup).toBeLessThan(bytesOf.computed);
  });
});
