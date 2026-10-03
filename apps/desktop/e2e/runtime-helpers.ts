import { expect, type Page } from '@playwright/test';
import type { ExportResult } from '../../../packages/html-export/src';
import type { Player, PlayerState } from '../../../packages/runtime/src';

// Helpers for the runtime and export suites (WG8, WG9B): the dev page /dev/runtime.html, and
// files exported from it. Both expose the same player: the page as `slidrDev.player`, a file as
// `slidr`.

export type ShowWindow = Window & {
  slidrDev?: { player: Player; warnings: string[]; exportDeck: () => Promise<ExportResult> };
  slidr?: Player;
};

export async function openDeck(page: Page, deck: string, rest = ''): Promise<void> {
  await page.goto(`/dev/runtime.html?deck=${deck}${rest}`);
  await page.waitForSelector('html[data-ready="true"]');
}

export const stateOf = (page: Page): Promise<PlayerState> =>
  page.evaluate(() => {
    const w = window as ShowWindow;
    return (w.slidrDev?.player ?? w.slidr)!.state;
  });

export const setState = (page: Page, slide: number, step: number): Promise<void> =>
  page.evaluate(
    (state) => {
      const w = window as ShowWindow;
      (w.slidrDev?.player ?? w.slidr)!.setState(state);
    },
    { slide, step },
  );

/** Resolves once nothing is animating: what is left are the holds of hidden elements. */
export const idle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

export const isVisible = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el !== null && getComputedStyle(el).visibility === 'visible';
  }, selector);

export const element = (id: string) => `[data-element-id="${id}"]`;

/** Collects uncaught errors of the page; call the result at the end of the test. */
export function watchErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return () => expect(errors).toEqual([]);
}

export interface Playing {
  /** The element, or the slide, the animation belongs to. */
  id: string | null;
  delay: number;
  duration: number;
  keyframes: Record<string, unknown>[];
}

/**
 * Takes one step forward and returns the animations it started, read in the same task, before
 * a frame has passed. Holds, which only keep an element hidden, are left out.
 */
export const stepAndRead = (page: Page): Promise<Playing[]> =>
  page.evaluate(() => {
    const w = window as ShowWindow;
    (w.slidrDev?.player ?? w.slidr)!.next();
    const timing = new Set(['offset', 'computedOffset', 'easing', 'composite', 'visibility']);
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const effect = a.effect as KeyframeEffect;
        const target = effect.target;
        const owner = target?.closest('[data-element-id], [data-slide]');
        return {
          id: owner?.getAttribute('data-element-id') ?? owner?.getAttribute('data-slide') ?? null,
          delay: Number(effect.getTiming().delay),
          duration: Number(effect.getTiming().duration),
          keyframes: effect.getKeyframes().map((k): Record<string, unknown> => ({ ...k })),
        };
      })
      .filter((a) => a.keyframes.some((k) => Object.keys(k).some((name) => !timing.has(name))));
  });

/** The share of pixels that differ visibly between two screenshots of the same size. */
export async function differingShare(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const load = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no 2d context');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const x = await load(first ?? '');
      const y = await load(second ?? '');
      if (x.width !== y.width || x.height !== y.height) return 1;
      let differing = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        const delta =
          Math.abs((x.data[i] ?? 0) - (y.data[i] ?? 0)) +
          Math.abs((x.data[i + 1] ?? 0) - (y.data[i + 1] ?? 0)) +
          Math.abs((x.data[i + 2] ?? 0) - (y.data[i + 2] ?? 0));
        if (delta > 96) differing++;
      }
      return differing / (x.width * x.height);
    },
    [a.toString('base64'), b.toString('base64')],
  );
}
