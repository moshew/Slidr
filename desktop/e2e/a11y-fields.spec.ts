import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';

/*
 * A field is drawn as disabled when it is disabled, and only then (WG13-T06, DSN-08).
 *
 * The frame of `Input`, `Textarea` and `NumberField` used to fade whenever anything inside it
 * was disabled. A composer's Send button is disabled until there is something to send, so the
 * chat's field, which can be typed in, took the colour the design system keeps for disabled
 * controls: 2.1:1 against the field, where text needs 4.5:1. The audit found it; this holds the
 * rule from both sides, in both schemes.
 */

/** A colour token of the UI as the page computes it now, as the `rgb(...)` a style reads back. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((variable) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${variable})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

/** The frame around a field (the element with the field's background), and its colours. */
async function frameOf(page: Page, selector: string, nth = 0) {
  return page
    .locator(selector)
    .nth(nth)
    .evaluate((field) => {
      let frame = field.parentElement;
      while (frame && !frame.classList.contains('bg-ui-field')) frame = frame.parentElement;
      if (!frame) throw new Error('The field has no frame');
      // A change of colour is a transition: read it at its end.
      for (const motion of frame.getAnimations()) motion.finish();
      const style = getComputedStyle(frame);
      return {
        color: style.color,
        border: style.borderTopColor,
        disabledBeside: [...frame.querySelectorAll(':disabled')].filter((el) => el !== field)
          .length,
      };
    });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the chat's field is not drawn as disabled while its Send button is, ${theme}`, async ({
    page,
  }) => {
    await openApp(page, { lang: 'en', theme });
    const input = page.getByTestId('chat-input');
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('');
    const frame = await frameOf(page, '[data-testid="chat-input"]');
    // The case in question: something beside the field is disabled, and the field is not.
    expect(frame.disabledBeside).toBeGreaterThan(0);
    expect(frame.color).toBe(await token(page, '--color-ui-fg'));
    expect(frame.color).not.toBe(await token(page, '--color-ui-fg-subtle'));
    // What is typed is in the same colour: the text of the app, at full contrast.
    await input.fill('A deck about bees');
    expect(await input.evaluate((el) => getComputedStyle(el).color)).toBe(
      await token(page, '--color-ui-fg'),
    );
  });

  test(`a field that is disabled itself is still drawn as disabled, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto(`/dev/gallery.html?theme=${theme}&dir=ltr`);
    await expect(page.getByTestId(`gallery-${theme}-ltr`)).toBeVisible();
    const gallery = `[data-testid="gallery-${theme}-ltr"]`;
    const subtle = await token(page, '--color-ui-fg-subtle');
    const line = await token(page, '--color-ui-line');
    // One of each kind of field the design system frames: a line of text, several, a number.
    const disabled = {
      input: `${gallery} input[type="text"]:disabled:not([inputmode])`,
      textarea: `${gallery} textarea:disabled`,
      number: `${gallery} input[inputmode="decimal"]:disabled`,
    };
    for (const [kind, selector] of Object.entries(disabled)) {
      await expect(page.locator(selector).first(), kind).toBeDisabled();
      const frame = await frameOf(page, selector);
      expect(frame.color, `${kind}: the text`).toBe(subtle);
      expect(frame.border, `${kind}: the border`).toBe(line);
    }
  });
}
