import { expect, test, type Page } from '@playwright/test';
import {
  element,
  idle,
  isVisible,
  openDeck,
  setState,
  stateOf,
  stepAndRead,
  watchErrors,
  type ShowWindow,
} from './runtime-helpers';

// The runtime in a real browser (WG8-T01..T03), on its dev page /dev/runtime.html. The slides are
// drawn by SlideRenderer, as in present mode; the `probe` deck has short timelines whose every
// step is named here (see src/dev/runtime/decks.ts).

const firstX = (keyframes: Record<string, unknown>[]) =>
  parseFloat(String(keyframes[0]?.translate));

const items = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-element-id="p_list"] li'),
      (li) => getComputedStyle(li).visibility,
    ),
  );

test('plays the lead-in and then waits for a click', async ({ page }) => {
  const noErrors = watchErrors(page);
  await openDeck(page, 'probe');
  expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
  await idle(page);
  expect(await isVisible(page, element('p_title'))).toBe(true);
  expect(await isVisible(page, element('p_box1'))).toBe(false);
  expect(await items(page)).toEqual(['hidden', 'hidden', 'hidden']);
  // The slide has six clicks: the boxes, three paragraphs, an emphasis and the exits.
  const steps = await page.evaluate(() => (window as ShowWindow).slidrDev?.player.steps());
  expect(steps).toBe(6);
  expect(await page.evaluate(() => (window as ShowWindow).slidrDev?.warnings)).toEqual([]);
  noErrors();
});

test('a step brings its elements in, and going back undoes it at once', async ({ page }) => {
  await openDeck(page, 'probe');
  await idle(page);
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 0, step: 1 });
  await expect.poll(() => isVisible(page, element('p_box1'))).toBe(true);
  await idle(page);
  // Nothing of the animation is left on the element: only the renderer's own styles.
  const after = await page.evaluate(() => {
    const box = document.querySelector('[data-element-id="p_box2"]');
    const style = getComputedStyle(box as Element);
    return {
      translate: style.translate,
      opacity: style.opacity,
      animations: box?.getAnimations().length,
    };
  });
  expect(after).toEqual({ translate: 'none', opacity: '0.5', animations: 0 });

  await page.keyboard.press('ArrowLeft');
  expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
  expect(await isVisible(page, element('p_box1'))).toBe(false);
  expect(
    await page.evaluate(() => document.getAnimations().some((a) => a.playState === 'running')),
  ).toBe(false);
});

test('an animated element keeps its rotation and its opacity', async ({ page }) => {
  await openDeck(page, 'probe');
  await idle(page);
  const playing = await stepAndRead(page);
  const box = playing.find((a) => a.id === 'p_box2');
  // The box moves by `translate`; its own `transform`, which rotates it, is not animated.
  expect(Object.keys(box?.keyframes[0] ?? {})).toContain('translate');
  expect(Object.keys(box?.keyframes[0] ?? {})).not.toContain('transform');
  const transform = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('[data-element-id="p_box2"]') as Element).transform,
  );
  expect(transform).toMatch(/^matrix\(0\.96/);
});

test('paragraphs come one click at a time', async ({ page }) => {
  await openDeck(page, 'probe');
  await setState(page, 0, 1);
  await page.keyboard.press('ArrowRight');
  await idle(page);
  expect(await items(page)).toEqual(['visible', 'hidden', 'hidden']);
  await page.keyboard.press('PageDown');
  await page.keyboard.press(' ');
  await idle(page);
  expect(await items(page)).toEqual(['visible', 'visible', 'visible']);
  expect(await stateOf(page)).toEqual({ slide: 0, step: 4 });
  await page.keyboard.press('PageUp');
  expect(await items(page)).toEqual(['visible', 'visible', 'hidden']);
});

test('emphasis leaves an element as it was, and an exit takes it away', async ({ page }) => {
  await openDeck(page, 'probe');
  await setState(page, 0, 4);
  const pulse = await stepAndRead(page);
  expect(pulse.map((a) => a.id)).toEqual(['p_box1']);
  expect(Object.keys(pulse[0]?.keyframes[0] ?? {})).toContain('scale');
  await idle(page);
  expect(await isVisible(page, element('p_box1'))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await idle(page);
  expect(await isVisible(page, element('p_box1'))).toBe(false);
  expect(await isVisible(page, element('p_box2'))).toBe(false);
  expect(await isVisible(page, element('p_title'))).toBe(true);
});

for (const [deck, sign] of [
  ['probe', 1],
  ['probe-rtl', -1],
] as const) {
  test(`start and end follow the reading direction (${deck})`, async ({ page }) => {
    await openDeck(page, deck);
    await idle(page);
    const boxes = await stepAndRead(page);
    // `start`: towards the left in LTR, so the box comes from the right. RTL mirrors it.
    expect(Math.sign(firstX(boxes.find((a) => a.id === 'p_box1')?.keyframes ?? []))).toBe(sign);
    expect(Math.sign(firstX(boxes.find((a) => a.id === 'p_box2')?.keyframes ?? []))).toBe(-sign);

    await setState(page, 0, 6);
    const slides = await stepAndRead(page);
    // A push towards the start: the slide that comes in starts on the end side.
    const incoming = slides.find((a) => a.id === 's_probe_b');
    const outgoing = slides.find((a) => a.id === 's_probe_a');
    expect(Math.sign(firstX(incoming?.keyframes ?? []))).toBe(sign);
    expect(Math.sign(parseFloat(String(outgoing?.keyframes[1]?.translate)))).toBe(-sign);
  });
}

test('moving on plays the transition, and hidden slides are skipped', async ({ page }) => {
  const noErrors = watchErrors(page);
  await openDeck(page, 'probe');
  await setState(page, 0, 6);
  const shown = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="viewport"] section'))
        .map((s, i) => (getComputedStyle(s).display === 'none' ? -1 : i))
        .filter((i) => i >= 0),
    );
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 1, step: 0 });
  expect(await shown()).toEqual([0, 1]);
  await idle(page);
  expect(await shown()).toEqual([1]);
  // Back: the slide before, as it was left, with no transition.
  await page.keyboard.press('ArrowLeft');
  expect(await stateOf(page)).toEqual({ slide: 0, step: 6 });
  expect(await shown()).toEqual([0]);
  expect(await isVisible(page, element('p_box1'))).toBe(false);

  await setState(page, 1, 2);
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 3, step: 0 });
  await idle(page);
  // Past the last slide is the end of the show: a black screen over it, and the slide under it.
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 3, step: 0, ended: true });
  await expect(page.locator('[data-testid="viewport"] [data-slidr-end]')).toBeVisible();
  expect(await shown()).toEqual([3]);
  // Nothing more comes after it, and a step back is the last slide again.
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 3, step: 0, ended: true });
  await page.keyboard.press('ArrowLeft');
  expect(await stateOf(page)).toEqual({ slide: 3, step: 0 });
  await expect(page.locator('[data-slidr-end]')).toHaveCount(0);
  noErrors();
});

test('words of one direction animate as boxes, and the text comes back whole', async ({ page }) => {
  await openDeck(page, 'probe');
  const result = await page.evaluate(() => {
    const player = (window as ShowWindow).slidrDev?.player;
    const title = document.querySelector('[data-element-id="q_title"]') as HTMLElement;
    const before = title.innerHTML;
    player?.goTo(1);
    const parts = Array.from(title.querySelectorAll<HTMLElement>('[data-slidr-part]'));
    return {
      before,
      words: parts.map((p) => p.textContent),
      boxes: parts.every((p) => getComputedStyle(p).display === 'inline-block'),
      delays: parts.map((p) => Number(p.getAnimations()[0]?.effect?.getTiming().delay)),
    };
  });
  expect(result.words).toEqual(['Words', 'come', 'in', 'one', 'by', 'one']);
  expect(result.boxes).toBe(true);
  expect(result.delays).toEqual([0, 40, 80, 120, 160, 200]);
  await idle(page);
  const after = await page.evaluate(() => ({
    html: document.querySelector('[data-element-id="q_title"]')?.innerHTML,
    parts: document.querySelectorAll('[data-slidr-part]').length,
  }));
  expect(after).toEqual({ html: result.before, parts: 0 });
});

test('words of mixed directions keep their places', async ({ page }) => {
  await openDeck(page, 'probe');
  await setState(page, 1, 0);
  const result = await page.evaluate(() => {
    const player = (window as ShowWindow).slidrDev?.player;
    const paragraph = document.querySelector('[data-element-id="q_mixed"] p') as HTMLElement;
    const text = paragraph.firstChild as Text;
    const range = document.createRange();
    const before = Array.from(text.data.matchAll(/\S+/g), (m) => {
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      return Math.round(range.getBoundingClientRect().left);
    });
    player?.next();
    const parts = Array.from(paragraph.querySelectorAll<HTMLElement>('[data-slidr-part]'));
    return {
      before,
      after: parts.map((p) => Math.round(p.getBoundingClientRect().left)),
      inline: parts.every((p) => getComputedStyle(p).display === 'inline'),
      properties: Object.keys(
        (parts[0]?.getAnimations()[0]?.effect as KeyframeEffect).getKeyframes()[0] ?? {},
      ),
    };
  });
  // Two English words inside a Hebrew line would swap as boxes: the words stay inline instead,
  // exactly where they were, and the zoom they cannot do becomes a fade.
  expect(result.inline).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.properties).toContain('opacity');
  expect(result.properties).not.toContain('scale');
});

test('Hebrew characters animate in reading order', async ({ page }) => {
  await openDeck(page, 'probe');
  await setState(page, 1, 1);
  const result = await page.evaluate(() => {
    const player = (window as ShowWindow).slidrDev?.player;
    const box = document.querySelector('[data-element-id="q_chars"]') as HTMLElement;
    player?.next();
    const parts = Array.from(box.querySelectorAll<HTMLElement>('[data-slidr-part]'));
    return {
      text: parts.map((p) => p.textContent).join(''),
      lefts: parts.map((p) => p.getBoundingClientRect().left),
      delays: parts.map((p) => Number(p.getAnimations()[0]?.effect?.getTiming().delay)),
      boxes: parts.every((p) => getComputedStyle(p).display === 'inline-block'),
    };
  });
  expect(result.text).toBe('שלוםעולם');
  expect(result.boxes).toBe(true);
  // Right to left on screen, and the first letter starts first.
  expect(result.lefts).toEqual([...result.lefts].sort((a, b) => b - a));
  expect(result.delays).toEqual([...result.delays].sort((a, b) => a - b));
});

test('a click moves on, and a linked element jumps to its slide', async ({ page }) => {
  await openDeck(page, 'probe');
  await idle(page);
  await page.getByTestId('viewport').click({ position: { x: 600, y: 600 } });
  expect(await stateOf(page)).toEqual({ slide: 0, step: 1 });
  await setState(page, 3, 0);
  await page.locator(element('r_home')).click();
  expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
});

test('the address follows the slide, and opens it', async ({ page }) => {
  await openDeck(page, 'probe', '#2');
  expect(await stateOf(page)).toEqual({ slide: 1, step: 0 });
  await setState(page, 3, 0);
  expect(new URL(page.url()).hash).toBe('#4');
  await page.evaluate(() => (location.hash = '#1'));
  await expect.poll(() => stateOf(page)).toEqual({ slide: 0, step: 0 });
});

test('a deck with advance.afterMs goes on by itself, and ignores clicks', async ({ page }) => {
  await openDeck(page, 'auto');
  // A click is not a step here; the timer is.
  await page.getByTestId('viewport').click({ position: { x: 600, y: 600 } });
  expect((await stateOf(page)).slide).toBe(0);
  await expect.poll(() => stateOf(page)).toEqual({ slide: 0, step: 1 });
  await expect.poll(() => stateOf(page)).toEqual({ slide: 1, step: 0 });
  await page.waitForTimeout(700);
  expect(await stateOf(page)).toEqual({ slide: 1, step: 0 });
});

test('the stage is fitted into the window and centred', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await openDeck(page, 'probe', '&bare');
  const fit = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="viewport"]') as HTMLElement;
    const stage = viewport.firstElementChild as HTMLElement;
    const v = viewport.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { width: s.width, height: s.height, left: s.left - v.left, top: s.top - v.top };
  });
  expect(fit.width).toBeCloseTo(1000, 0);
  expect(fit.height).toBeCloseTo(562.5, 0);
  expect(fit.left).toBeCloseTo(0, 0);
  expect(fit.top).toBeCloseTo((900 - 562.5) / 2, 0);
});

test('the player leaves the slides as the renderer drew them', async ({ page }) => {
  await openDeck(page, 'probe');
  await setState(page, 1, 0);
  const left = await page.evaluate(() => {
    const player = (window as ShowWindow).slidrDev?.player;
    player?.next();
    player?.destroy();
    return {
      animations: document.getAnimations().length,
      parts: document.querySelectorAll('[data-slidr-part]').length,
    };
  });
  expect(left).toEqual({ animations: 0, parts: 0 });
});

test('a deck from the model plays as it is', async ({ page }) => {
  const noErrors = watchErrors(page);
  // The model's own fixture: a timeline with word animation and a transition, in an RTL deck.
  await openDeck(page, 'all-elements');
  await idle(page);
  expect(await isVisible(page, element('e_text'))).toBe(false);
  await page.keyboard.press('ArrowRight');
  expect(await stateOf(page)).toEqual({ slide: 0, step: 1 });
  await idle(page);
  expect(await isVisible(page, element('e_text'))).toBe(true);
  expect(await isVisible(page, element('e_group'))).toBe(true);
  expect(await page.evaluate(() => (window as ShowWindow).slidrDev?.warnings)).toEqual([]);
  noErrors();
});
