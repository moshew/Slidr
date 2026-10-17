import { fontStack } from '@slidr/renderer';
import { beforeAll, describe, expect, test } from 'vitest';
import { registerBuiltinFonts } from './index';

// In the engine WebView2 uses: which font of a pair really draws each script (SPEC 5.5). Fonts
// are told apart by the width of the same text, so nothing here depends on how they look.

const HEBREW = 'שלוםעולםמצגת';
const LATIN = 'Presentation';
const ARABIC = 'مستقبلالعمل';
const JAPANESE = '未来の働き方';

/** The width of text in a font list, once the faces it needs have loaded. */
async function width(text: string, family: string): Promise<number> {
  await document.fonts.load(`96px ${family}`, text);
  const span = document.createElement('span');
  span.style.cssText = `position: absolute; white-space: pre; font-size: 96px; font-family: ${family};`;
  span.textContent = text;
  document.body.append(span);
  const measured = span.getBoundingClientRect().width;
  span.remove();
  return measured;
}

beforeAll(() => registerBuiltinFonts());

describe('a font pair in the browser', () => {
  test('the two families of the test draw both scripts, each in its own way', async () => {
    // Open Sans has Hebrew letters and Heebo has Latin ones: either could draw either text.
    expect(await width(HEBREW, '"Open Sans"')).not.toBeCloseTo(await width(HEBREW, '"Heebo"'), 0);
    expect(await width(LATIN, '"Open Sans"')).not.toBeCloseTo(await width(LATIN, '"Heebo"'), 0);
    // Listing the Latin family first, as the stack once did, gives it the Hebrew text too.
    expect(await width(HEBREW, '"Open Sans", "Heebo"')).toBeCloseTo(
      await width(HEBREW, '"Open Sans"'),
      1,
    );
  });

  test('gives Hebrew to the Hebrew font and Latin to the Latin one, though both have both', async () => {
    const pair = fontStack({ he: 'Heebo', latin: 'Open Sans' });
    expect(await width(HEBREW, pair)).toBeCloseTo(await width(HEBREW, '"Heebo"'), 1);
    expect(await width(LATIN, pair)).toBeCloseTo(await width(LATIN, '"Open Sans"'), 1);
  });

  test('draws a pair whose Latin font has no Hebrew as before', async () => {
    const pair = fontStack({ he: 'Heebo', latin: 'Inter' });
    expect(await width(HEBREW, pair)).toBeCloseTo(await width(HEBREW, '"Heebo"'), 1);
    expect(await width(LATIN, pair)).toBeCloseTo(await width(LATIN, '"Inter"'), 1);
  });

  test('draws the letters of a deck in another language in the counterpart of its fonts', async () => {
    // Inter has no Arabic or Japanese letters: the library's counterparts draw them (ADR-105).
    const arabic = fontStack({ he: 'Heebo', latin: 'Inter' }, 'ar');
    expect(await width(ARABIC, arabic)).toBeCloseTo(
      await width(ARABIC, '"IBM Plex Sans Arabic"'),
      1,
    );
    expect(await width(LATIN, arabic)).toBeCloseTo(await width(LATIN, '"Inter"'), 1);
    const japanese = fontStack({ he: 'Frank Ruhl Libre', latin: 'Playfair Display' }, 'ja');
    expect(await width(JAPANESE, japanese)).toBeCloseTo(
      await width(JAPANESE, '"Noto Serif JP"'),
      1,
    );
    // A Hebrew deck keeps its pair as it was.
    expect(fontStack({ he: 'Heebo', latin: 'Inter' }, 'he')).toBe(
      fontStack({ he: 'Heebo', latin: 'Inter' }),
    );
  });
});
