import { expect, test, type Locator, type Page } from '@playwright/test';

// What the editor track added to the design system, on the component gallery: the checkbox and
// the switch, `Field`, the direction of a segmented control, the unit of a number, the growing
// text field and the fixed-width font. And, in the app, the slide that reduced motion leaves alone.

async function gallery(page: Page, dir: 'ltr' | 'rtl') {
  await page.goto(`/dev/gallery.html?theme=light&dir=${dir}`);
  await expect(page.getByTestId(`gallery-light-${dir}`)).toBeVisible();
}

const card = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

const left = async (locator: Locator) => (await locator.boundingBox())!.x;
const right = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return box.x + box.width;
};

test('checkbox: the label is part of the target, Space checks, and mixed becomes checked', async ({
  page,
}) => {
  await gallery(page, 'ltr');
  const options = card(page, 'Checkbox and switch');
  const asDefault = options.getByRole('checkbox', { name: 'Set as default' });
  await expect(asDefault).toBeChecked();
  await expect(asDefault).toHaveAccessibleDescription(
    'New presentations will open with this template.',
  );

  await options.getByText('Set as default').click();
  await expect(asDefault).not.toBeChecked();
  await asDefault.press('Space');
  await expect(asDefault).toBeChecked();

  // The rows of states do not change: they show a state, and a disabled one takes no click.
  const mixed = options.getByRole('checkbox', { name: 'Header row' }).nth(10);
  await expect(mixed).toHaveAttribute('aria-checked', 'mixed');
  const disabled = options.getByRole('checkbox', { name: 'Header row' }).nth(4);
  await expect(disabled).toBeDisabled();
  await disabled.click({ force: true });
  await expect(disabled).not.toBeChecked();
});

for (const dir of ['ltr', 'rtl'] as const) {
  test(`switch: a click on the row switches, and the thumb travels to the end (${dir})`, async ({
    page,
  }) => {
    await gallery(page, dir);
    const options = card(page, dir === 'ltr' ? 'Checkbox and switch' : 'תיבת סימון ומתג');
    const banded = options.getByRole('switch', {
      name: dir === 'ltr' ? 'Banded rows' : 'שורות מתחלפות',
    });
    await expect(banded).not.toBeChecked();
    const thumb = banded.locator('span[data-state]');
    const off = await left(thumb);

    await banded.click();
    await expect(banded).toBeChecked();
    // The margin moves over 120ms.
    await expect.poll(async () => Math.round(Math.abs((await left(thumb)) - off))).toBe(12);
    const on = await left(thumb);
    expect(on > off).toBe(dir === 'ltr');

    // A row of settings: the label at the start, the switch at the far end.
    const label = banded.getByText(dir === 'ltr' ? 'Banded rows' : 'שורות מתחלפות');
    expect((await left(label)) < on).toBe(dir === 'ltr');

    await banded.press('Space');
    await expect(banded).not.toBeChecked();
  });
}

test('segmented control: `dir` keeps physical segments in place in a right-to-left UI', async ({
  page,
}) => {
  await gallery(page, 'rtl');
  const segmented = card(page, 'בורר מקטעים');

  // Without `dir` the first segment is at the start, which is the right.
  const scope = segmented.getByRole('radiogroup', { name: 'בורר מקטעים' }).first();
  expect(await left(scope.getByRole('radio', { name: 'שקף' }))).toBeGreaterThan(
    await left(scope.getByRole('radio', { name: 'אובייקט' })),
  );

  // With `dir="ltr"` the arrow that points left is on the left, and the keys move as drawn.
  const arrows = segmented.getByRole('radiogroup', { name: 'כיוון' });
  const names = ['שמאלה', 'למעלה', 'למטה', 'ימינה'];
  const at = await Promise.all(names.map((name) => left(arrows.getByRole('radio', { name }))));
  expect(at).toEqual([...at].sort((a, b) => a - b));

  await arrows.getByRole('radio', { name: 'שמאלה' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(arrows.getByRole('radio', { name: 'למעלה' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(arrows.getByRole('radio', { name: 'למעלה' })).toBeChecked();
});

test('number field: a Hebrew unit is on the left of the number, a Latin one on its right', async ({
  page,
}) => {
  await gallery(page, 'rtl');
  const hebrew = card(page, 'שדה: תווית מעל פקד').getByRole('textbox', { name: 'משך' }).first();
  const frame = hebrew.locator('xpath=..');
  await expect(frame).toHaveText('שנ׳');
  expect(await right(frame.getByText('שנ׳'))).toBeLessThanOrEqual(await left(hebrew));
  // The number itself reads left to right: a minus sign stays in front of it.
  await expect(hebrew).toHaveCSS('direction', 'ltr');
  await hebrew.fill('1.5');
  await hebrew.press('Enter');
  await expect(hebrew).toHaveValue('1.5');

  // "12.5°": the degree sign after the number, in a right-to-left UI too.
  const rotation = card(page, 'מספרים, בחירה ומחוון').getByRole('textbox', { name: 'סיבוב' });
  const degrees = rotation.locator('xpath=..').getByText('°');
  expect(await left(degrees)).toBeGreaterThanOrEqual(await right(rotation));

  await gallery(page, 'ltr');
  const latin = card(page, 'Field: a label over a control')
    .getByRole('textbox', { name: 'Duration' })
    .first();
  expect(
    await left(latin.locator('xpath=..').getByText('s', { exact: true })),
  ).toBeGreaterThanOrEqual(await right(latin));
});

test('field: the label names a group, or the input it is for; the message describes it', async ({
  page,
}) => {
  await gallery(page, 'ltr');
  const fields = card(page, 'Field: a label over a control');
  const direction = fields.getByRole('group', { name: 'Direction', exact: true }).first();
  await expect(direction).toHaveAccessibleDescription('Where the object comes in from.');
  await expect(direction.getByRole('radio')).toHaveCount(4);

  // An error takes the place of the hint as soon as there is one.
  const duration = fields.getByRole('group', { name: 'Duration' }).first();
  await expect(duration.getByText('Up to 60 seconds.')).toHaveCount(0);
  await duration.getByRole('textbox').fill('75');
  await duration.getByRole('textbox').press('Enter');
  await expect(duration).toHaveAccessibleDescription('Up to 60 seconds.');

  // A text field is a `Field` for its input: a click on the label goes to the input.
  const text = card(page, 'Text fields');
  await text.getByText('Presentation name').first().click();
  const name = text.getByRole('textbox', { name: 'Presentation name' }).first();
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription('Shown in the title bar.');
});

test('textarea: grows with its text up to a limit, then scrolls; disabled text fades', async ({
  page,
}) => {
  await gallery(page, 'ltr');
  const text = card(page, 'Text fields');
  const area = text
    .getByRole('textbox', { name: 'Presentation name' })
    .and(text.locator('textarea'));
  const empty = area.first();
  const height = async () => (await empty.boundingBox())!.height;

  const one = await height();
  await empty.fill('one\ntwo\nthree\nfour');
  const four = await height();
  expect(four).toBeGreaterThan(one + 40);
  await empty.fill(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'));
  const many = await height();
  expect(many).toBe(160);
  expect(await empty.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await empty.fill('');
  expect(await height()).toBe(one);

  const disabled = area.last();
  await expect(disabled).toBeDisabled();
  const faded = await text.locator('input:disabled').evaluate((el) => getComputedStyle(el).color);
  await expect(disabled).toHaveCSS('color', faded);
  expect(await empty.evaluate((el) => getComputedStyle(el).color)).not.toBe(faded);
});

test('the fixed-width font: `font-mono` is JetBrains Mono, and its letters share a width', async ({
  page,
}) => {
  await gallery(page, 'ltr');
  const sample = card(page, 'Colour, type and depth').locator('.font-mono');
  await expect(sample).toHaveCSS('font-family', /^"?JetBrains Mono"?, /);
  const widths = await sample.evaluate(async (el) => {
    await document.fonts.load('13px "JetBrains Mono"');
    const measure = (text: string) => {
      const span = document.createElement('span');
      span.textContent = text;
      el.append(span);
      const { width } = span.getBoundingClientRect();
      span.remove();
      return width;
    };
    return {
      loaded: document.fonts.check('13px "JetBrains Mono"'),
      narrow: measure('iiiiiiii'),
      wide: measure('WWWWWWWW'),
    };
  });
  expect(widths.loaded).toBe(true);
  expect(widths.narrow).toBeGreaterThan(0);
  expect(widths.narrow).toBeCloseTo(widths.wide, 3);
});

test('reduced motion shortens the transitions of the app and leaves the slide alone', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.evaluate(() => {
    const editor = window.slidr;
    if (!editor) throw new Error('window.slidr is missing');
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId ?? '',
      element: {
        id: 'e_motion001',
        type: 'image',
        name: 'picture',
        frame: { x: 0, y: 0, w: 960, h: 1080 },
        rotation: 0,
        opacity: 1,
        fit: 'cover',
      },
    });
  });
  const stage = page.getByTestId('stage-frame');
  await expect(stage.locator('[data-element-id="e_motion001"]')).toBeVisible();

  const durations = await page.evaluate(() => {
    const of = (el: Element | null, pseudo?: string) => {
      if (!el) throw new Error('an element of the check is missing');
      const style = getComputedStyle(el, pseudo);
      return [style.transitionDuration, style.animationDuration];
    };
    const slide = document.querySelector('[data-testid="stage-frame"] .slidr-slide');
    return {
      slide: of(slide),
      element: of(slide?.querySelector('[data-element-id="e_motion001"]') ?? null),
      elementBefore: of(
        slide?.querySelector('[data-element-id="e_motion001"]') ?? null,
        '::before',
      ),
      thumbnail: of(document.querySelector('[data-testid="filmstrip"] .slidr-slide')),
      // The slide's parent is the app's, like the rest of the chrome.
      frame: of(slide?.parentElement ?? null),
      body: of(document.body),
      button: of(document.querySelector('button')),
      buttonBefore: of(document.querySelector('button'), '::before'),
    };
  });
  const untouched = ['0s', '0s'];
  const shortened = ['0.001s', '0.001s'];
  expect(durations).toEqual({
    slide: untouched,
    element: untouched,
    elementBefore: untouched,
    thumbnail: untouched,
    frame: shortened,
    body: shortened,
    button: shortened,
    buttonBefore: shortened,
  });

  // So a change of a style inside the slide is laid out at once, with no transition to wait for.
  const jump = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-testid="stage-frame"] .slidr-slide [data-element-id="e_motion001"]',
    );
    if (!el) throw new Error('the element is missing');
    void el.offsetWidth;
    el.style.opacity = '0.25';
    return { opacity: getComputedStyle(el).opacity, running: el.getAnimations().length };
  });
  expect(jump).toEqual({ opacity: '0.25', running: 0 });
});
