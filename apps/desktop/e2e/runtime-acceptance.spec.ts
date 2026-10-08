import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { CommandBus } from '@slidr/model';
import { FHD, openApp, setCurrentSlide, show } from './runtime-app-helpers';

// The acceptance of WG8 (PLAN): the same runtime runs in the editor's preview, in present mode
// and in the exported file, and one step gives the same keyframes in all three; `start` and
// `end` turn around in an RTL deck; and a timeline written through `animation_set`, called on the
// Deck API with no agent, plays the same in the three.

test.use({ viewport: FHD });

/** Long enough to be read while it plays, in a page that is driven from outside. */
const SLOW = 4000;

interface Playing {
  id: string | null;
  delay: number;
  duration: number;
  easing: string;
  keyframes: Record<string, unknown>[];
}

/**
 * The animations running under `root` that move something: the holds, which only keep an element
 * hidden until its turn, are left out. Sorted, so two views of one step compare as lists.
 */
const playing = (page: Page, root: string): Promise<Playing[]> =>
  page.evaluate((selector) => {
    const within = document.querySelector(selector);
    const timing = new Set(['offset', 'computedOffset', 'easing', 'composite', 'visibility']);
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => ({
        effect: a.effect as KeyframeEffect,
        target: (a.effect as KeyframeEffect).target,
      }))
      .filter(({ target }) => target !== null && within?.contains(target))
      .map(({ effect, target }) => ({
        id: target?.closest('[data-element-id]')?.getAttribute('data-element-id') ?? null,
        delay: Number(effect.getTiming().delay),
        duration: Number(effect.getTiming().duration),
        easing: String(effect.getTiming().easing),
        keyframes: effect.getKeyframes().map((k): Record<string, unknown> => ({ ...k })),
      }))
      .filter((a) => a.keyframes.some((k) => Object.keys(k).some((name) => !timing.has(name))))
      .sort((a, b) => `${a.id}${a.delay}`.localeCompare(`${b.id}${b.delay}`));
  }, root);

/** Writes the animations of the last slide through the Deck API, as an agent's tool call would. */
async function animate(page: Page) {
  return page.evaluate(async (duration) => {
    const path = '/src/dev/runtime/deckApi.ts';
    const { callTool } = (await import(/* @vite-ignore */ path)) as {
      callTool: (bus: CommandBus, name: string, input: unknown) => Promise<{ ok: boolean }>;
    };
    return callTool(window.slidr!.bus, 'animation_set', {
      slideId: 's_probe_c',
      steps: [
        { elementId: 'r_title', preset: 'flyIn', direction: 'start', duration, easing: 'ease-in' },
        {
          elementId: 'r_home',
          preset: 'wipe',
          direction: 'end',
          trigger: 'withPrevious',
          delay: 250,
          duration,
        },
        {
          elementId: 'r_home',
          category: 'emphasis',
          preset: 'pulse',
          trigger: 'withPrevious',
          delay: 500,
          duration,
        },
      ],
      transition: { type: 'push', duration },
    });
  }, SLOW);
}

for (const [deck, sign] of [
  ['probe', 1],
  ['probe-rtl', -1],
] as const) {
  test(`one step, the same keyframes in the editor, in the show and in the file (${deck})`, async ({
    page,
    browser,
  }) => {
    await openApp(page, { deck });
    expect(await animate(page)).toMatchObject({ ok: true });
    await setCurrentSlide(page, 's_probe_c');

    // ---- The editor: the preview of the panel, on the Stage's own slide ----
    await page.getByTestId('activity-bar').getByRole('button', { name: 'אנימציות' }).click();
    await page.locator('[data-group="1"]').getByRole('button', { name: 'ניגון השלב הזה' }).click();
    const inEditor = await playing(page, '[data-testid="stage-frame"]');
    expect(inEditor.map((a) => a.id)).toEqual(['r_home', 'r_home', 'r_title']);
    // The title flies towards `start`: from the right in a left-to-right deck, from the left in
    // a right-to-left one. The wipe travels towards `end`, the other way.
    const title = inEditor.find((a) => a.id === 'r_title')!;
    expect(Math.sign(parseFloat(String(title.keyframes[0]?.translate)))).toBe(sign);
    expect(title).toMatchObject({ delay: 0, duration: SLOW, easing: 'ease-in' });
    const wipe = inEditor.find((a) => 'clipPath' in (a.keyframes[0] ?? {}))!;
    expect(wipe.delay).toBe(250);
    // inset(top right bottom left): the side that is cut at the start is the side it travels to.
    const cut = String(wipe.keyframes[0]?.clipPath).match(/calc\([^)]*\)/g)!;
    expect(cut[sign === 1 ? 1 : 3]).toMatch(/^calc\(100%/);
    expect(cut[sign === 1 ? 3 : 1]).toMatch(/^calc\(0%/);

    // The transition, as the editor previews it.
    await page.getByTestId('activity-bar').getByRole('button', { name: 'מעברים' }).click();
    await expect(page.getByTestId('transitions-panel')).toBeVisible();
    await page
      .getByTestId('transition-editor')
      .getByRole('button', { name: 'ניגון המעבר' })
      .click();
    const transitionInEditor = await playing(page, '[data-testid="transition-preview"]');
    expect(transitionInEditor).toHaveLength(2);

    // ---- Present mode ----
    await page.getByTestId('stage-surface').focus();
    await page.keyboard.press('Shift+F5');
    await show(page);
    await page.evaluate(() => {
      const view = document.querySelector('[data-testid="present"]')!;
      view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const inShow = await playing(page, '[data-testid="present"]');
    expect(inShow).toEqual(inEditor);
    // The transition into the slide, coming from the one before it: back to the start of this
    // slide, back again to the end of that one, and forwards.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.evaluate(() => {
      const view = document.querySelector('[data-testid="present"]')!;
      view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(await page.getByTestId('present').getAttribute('data-slide')).toBe('3');
    const transitionInShow = await playing(page, '[data-testid="present"]');
    expect(transitionInShow.map((a) => a.keyframes)).toEqual(
      transitionInEditor.map((a) => a.keyframes),
    );
    expect(transitionInShow[0]?.duration).toBe(SLOW);
    await page.keyboard.press('Escape');

    // ---- The exported file ----
    await page.getByTestId('file-menu-trigger').click();
    await page.getByRole('menuitem', { name: 'ייצוא HTML…', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-run').click(),
    ]);
    const file = test.info().outputPath('acceptance.html');
    await download.saveAs(file);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const opened = await context.newPage();
    await opened.goto(pathToFileURL(file).href);
    await opened.waitForSelector('html.slidr-ready');
    type Show = {
      slidr: { setState: (s: { slide: number; step: number }) => void; next: () => void };
    };
    // The hidden slide is not in the file: the last slide is the third.
    await opened.evaluate(() => {
      const { slidr } = window as unknown as Show;
      slidr.setState({ slide: 2, step: 0 });
      slidr.next();
    });
    const inFile = await playing(opened, '.slidr-stage');
    expect(inFile).toEqual(inEditor);
    await opened.evaluate(() => {
      const { slidr } = window as unknown as Show;
      slidr.setState({ slide: 1, step: 99 });
      slidr.next();
    });
    const transitionInFile = await playing(opened, '.slidr-stage');
    expect(transitionInFile.map((a) => a.keyframes)).toEqual(
      transitionInEditor.map((a) => a.keyframes),
    );
    await context.close();
  });
}
