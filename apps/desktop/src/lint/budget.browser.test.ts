import { lintSlide } from '@slidr/lint';
import type { AssetMeta } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { measureSlide, renderSlideOffscreen } from '@slidr/renderer';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { expect, test } from 'vitest';
import { testAssetUrl } from '../dev/slides/testAssets';
import { registerBuiltinFonts } from '../fonts';

// LNT-01: the lint of a slide takes under 100ms. In a file of its own, so that the first pass
// starts as the first lint of a session does: no font loaded and no picture decoded yet.

const resolveAsset = (asset: AssetMeta) => testAssetUrl(asset.id);

interface Timing {
  slide: string;
  /** Rendering out of sight and waiting for fonts, images and two frames. */
  render: number;
  /** Reading the DOM, and painting and reading what is under the text. */
  measure: number;
  /** The nine rules. */
  rules: number;
}

async function pass(): Promise<Timing[]> {
  const times: Timing[] = [];
  for (const make of [...Object.values(fixtureDecks), referenceDeck]) {
    const deck = make();
    for (const slide of deck.slides) {
      const t0 = performance.now();
      const rendered = await renderSlideOffscreen({ deck, slide, mode: 'thumbnail', resolveAsset });
      const t1 = performance.now();
      const measured = await measureSlide(rendered.root);
      const t2 = performance.now();
      lintSlide(deck, slide, measured, 'agent');
      const t3 = performance.now();
      rendered.dispose();
      times.push({ slide: slide.id, render: t1 - t0, measure: t2 - t1, rules: t3 - t2 });
    }
  }
  return times;
}

function summary(times: Timing[]) {
  const stats = (pick: (t: Timing) => number) => {
    const sorted = times.map(pick).sort((a, b) => a - b);
    const round = (v: number) => Math.round(v * 10) / 10;
    return { median: round(sorted[Math.floor(sorted.length / 2)]!), max: round(sorted.at(-1)!) };
  };
  return {
    slides: times.length,
    render: stats((t) => t.render),
    measure: stats((t) => t.measure),
    rules: stats((t) => t.rules),
    measureAndRules: stats((t) => t.measure + t.rules),
    whole: stats((t) => t.render + t.measure + t.rules),
  };
}

test('a slide is measured and judged in under 100ms', async () => {
  registerBuiltinFonts();
  const first = summary(await pass());
  const times = await pass();
  const warm = summary(times);
  console.log(`lint, ms per slide, first pass: ${JSON.stringify(first)}`);
  console.log(`lint, ms per slide, warm: ${JSON.stringify(warm)}`);
  console.log(
    times
      .map(
        (t) =>
          `${t.slide}: ${t.render.toFixed(1)} + ${t.measure.toFixed(1)} + ${t.rules.toFixed(2)}`,
      )
      .join('\n'),
  );
  // The engine itself (LNT-01: measurements and model in, findings out), on every slide.
  expect(warm.measureAndRules.max).toBeLessThan(100);
  expect(first.measureAndRules.median).toBeLessThan(100);
  // And with the rendering it needs first, on a typical slide.
  expect(warm.whole.median).toBeLessThan(100);
});
