import { expect, test, type Page } from '@playwright/test';
import { addElement, onStage, openApp, pageProblems } from './objects-helpers';

// The boundary between a deck and the editor that draws it (SEC-03, SEC-06), in the app's own
// page, with the app's own styles and under its content policy: the CSS and the markup of a deck
// style their slide and nothing of the editor. The rules themselves are tried one by one in
// `packages/renderer/src/boundary.browser.test.tsx`; this is the same promise where the user
// meets it.

/** What a deck would say to blank, restyle or re-letter the editor around its slide. */
const HIDE =
  '[data-testid], body, #root, #root *, button, * { display: none !important; opacity: 0 !important }';
const HOSTILE_CSS = [
  HIDE,
  `} ${HIDE} x {`,
  `@media all { } } ${HIDE} @media all {`,
  'a { content: "/*" } } ' + HIDE + ' /* "*/ x {',
  ':root, html, body { display: none !important; font-size: 3px !important }',
  // Names the editor's own page defines: its spinner, a property of its styles, its font.
  '@keyframes ui-spin { from { transform: none } to { transform: none } }',
  '@property --tw-border-style { syntax: "*"; inherits: false; initial-value: dashed }',
  '@property --tw-font-weight { syntax: "*"; inherits: false; initial-value: 900 }',
  '@font-face { font-family: "Inter Variable"; src: local("Courier New"); }',
  '@font-face { font-family: "Heebo Variable"; src: local("Courier New"); }',
  '@import url("data:text/css,*{display:none !important}");',
].join('\n');

const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <style>${HIDE} :root, :host, html { display: none !important }</style>
  <style>@keyframes ui-spin { to { transform: none } } @font-face { font-family: "Inter Variable"; src: local("Courier New"); }</style>
  <rect id="root" width="100" height="100" fill="#c81e1e"/>
</svg>`;

/** How the editor's own surfaces are drawn: whether they show, where, and in what letters. */
function chrome(page: Page) {
  return page.evaluate(() => {
    const spinner = document.createElement('div');
    spinner.className = 'animate-spin';
    document.body.append(spinner);
    const keyframes = spinner
      .getAnimations()
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes())
      .map((frame) => String(frame.transform));
    const root = getComputedStyle(document.documentElement);
    const registered = ['--tw-border-style', '--tw-font-weight'].map((name) =>
      getComputedStyle(spinner).getPropertyValue(name),
    );
    spinner.remove();
    const surfaces = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="top-tools-a"], [data-testid="top-tools-a"] button, [data-testid="top-tools-b"], [data-testid="window-controls"], [data-testid="stage-surface"]',
      ),
      (el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return [
          el.dataset.testid ?? el.localName,
          style.display,
          style.visibility,
          style.opacity,
          style.fontFamily,
          style.fontWeight,
          style.borderTopStyle,
          Math.round(box.width),
          Math.round(box.height),
        ].join(' | ');
      },
    );
    return {
      surfaces,
      keyframes,
      registered,
      rootFontSize: root.fontSize,
      rootDisplay: root.display,
    };
  });
}

test('the editor keeps its own look whatever the CSS and the markup of a deck say', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  // The editor is measured in its own letters both times: on a loaded machine the font of the
  // UI can arrive after the Stage is up, and the buttons are then a few pixels narrower.
  await page.evaluate(() => document.fonts.ready);
  const before = await chrome(page);
  expect(before.surfaces.length).toBeGreaterThan(5);
  expect(before.keyframes.join(' ')).toContain('rotate');

  await page.evaluate((css) => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'slide.update',
      slideId: selection.getState().currentSlideId!,
      patch: { css },
    });
  }, HOSTILE_CSS);
  await addElement(page, {
    id: 'e_hostile_svg',
    type: 'svg',
    frame: { x: 200, y: 200, w: 400, h: 400 },
    markup: HOSTILE_SVG,
  });
  await addElement(page, {
    id: 'e_hostile_html',
    type: 'html',
    frame: { x: 800, y: 200, w: 400, h: 400 },
    markup: `<style>${HIDE}</style><p>text</p>`,
    styles: `${HIDE} } ${HIDE}`,
    hasScripts: false,
  });
  await expect(onStage(page, 'e_hostile_svg').locator('[data-slidr-svg]')).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  expect(await chrome(page)).toEqual(before);
  await expect(page.getByTestId('top-tools-a')).toBeVisible();

  // The control: the same names loose in the page, where a deck's rules used to end up, do
  // change the editor. So the comparison above looks at what it should.
  await page.evaluate(() => {
    const loose = document.createElement('style');
    loose.textContent =
      '@keyframes ui-spin { from { transform: none } to { transform: none } } @property --tw-border-style { syntax: "*"; inherits: false; initial-value: dashed }';
    document.body.append(loose);
  });
  const loose = await chrome(page);
  expect(loose.keyframes).not.toEqual(before.keyframes);
  expect(loose.registered).not.toEqual(before.registered);
});

test('the CSS of a slide and the stylesheet of a picture style what they belong to', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, {
    id: 'e_box',
    type: 'shape',
    frame: { x: 200, y: 200, w: 300, h: 200 },
    geometry: { kind: 'preset', preset: 'rect' },
    fill: { kind: 'solid', color: { value: '#dddddd' } },
  });
  await addElement(page, {
    id: 'e_picture',
    type: 'svg',
    frame: { x: 700, y: 200, w: 300, h: 300 },
    markup:
      '<svg viewBox="0 0 10 10"><style>.mark { fill: rgb(10, 120, 60) }</style><defs><linearGradient id="g"><stop stop-color="#00f"/></linearGradient></defs><rect class="mark" width="5" height="5"/><rect y="5" width="10" height="5" fill="url(#g)"/></svg>',
  });
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'slide.update',
      slideId: selection.getState().currentSlideId!,
      patch: {
        css: '@keyframes nudge { to { opacity: 0.5 } } [data-element-id="e_box"] { outline: 4px solid rgb(255, 0, 0); animation: nudge 1s paused }',
      },
    });
  });
  const box = onStage(page, 'e_box');
  await expect
    .poll(() => box.evaluate((el) => getComputedStyle(el).outlineColor))
    .toBe('rgb(255, 0, 0)');
  expect(await box.evaluate((el) => el.getAnimations().length)).toBe(1);
  // The picture is drawn on the Stage and in the Filmstrip, each copy with its own stylesheet.
  const marks = page.locator('[data-element-id="e_picture"] [data-slidr-svg] rect.mark');
  await expect(marks).toHaveCount(2);
  for (const mark of await marks.all()) {
    expect(await mark.evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(10, 120, 60)');
  }
  // Nothing of it needed anything the app's content policy refuses.
  expect(pageProblems(page)).toEqual([]);
});
