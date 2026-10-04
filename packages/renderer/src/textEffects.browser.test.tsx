import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type Element,
  type RichText,
} from '@slidr/model';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { renderSlideOffscreen } from './offscreen';

// Text effects in a real engine (TXT-11): a gradient fill, an outline and a shadow of text are
// CSS of the element (`css`, SPEC 5.9), written by the app's text effects tool
// (apps/desktop/src/text/effects.ts). Here the records it writes are drawn and looked at, pixel
// by pixel: on a text box, and on the text of a shape.

const FRAME = { x: 100, y: 100, w: 1200, h: 300 };

/** Wide, heavy letters: enough ink to read colours from. */
const INK: RichText = richText('MMMMMMMM', { align: 'center', marks: { size: 200, weight: 900 } });

const GRADIENT = {
  'background-image': 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))',
  'background-clip': 'text',
  '-webkit-background-clip': 'text',
  '-webkit-text-fill-color': 'transparent',
};

interface Pixels {
  width: number;
  height: number;
  /** The pixels a test takes for ink, as [x, y, r, g, b]. */
  where: (is: (r: number, g: number, b: number) => boolean) => number[][];
}

/** Draws one element on a white slide and returns the pixels of its frame, and its DOM. */
async function draw<T>(
  element: Element,
  read: (host: HTMLElement) => T,
): Promise<{ pixels: Pixels; dom: T }> {
  const slide = createSlide({
    elements: [element],
    background: { fill: { kind: 'solid', color: { value: '#ffffff' } } },
  });
  const deck = createDeck({ lang: 'en', slides: [slide] });
  const offscreen = await renderSlideOffscreen({ deck, slide }, { hidden: false });
  try {
    const host = offscreen.root.querySelector<HTMLElement>(`[data-element-id="${element.id}"]`)!;
    const dom = read(host);
    const base64 = await page.screenshot({ element: host, save: false });
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const where: Pixels['where'] = (is) => {
      const found: number[][] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
          if (is(r, g, b)) found.push([x, y, r, g, b]);
        }
      }
      return found;
    };
    return { pixels: { width, height, where }, dom };
  } finally {
    offscreen.dispose();
  }
}

const text = (css: Record<string, string>): Element =>
  createElement.text({ id: 'e_text', frame: FRAME, content: INK, css });

const dark = (r: number, g: number, b: number) => r < 90 && g < 90 && b < 90;
const mean = (pixels: number[][], channel: 2 | 3 | 4) =>
  pixels.reduce((sum, pixel) => sum + pixel[channel]!, 0) / Math.max(pixels.length, 1);

/** The gradient runs from red on the left to blue on the right, and no letter is left dark. */
function expectGradient(
  { width, where }: Pixels,
  background: (r: number, g: number, b: number) => boolean,
) {
  const ink = where((r, g, b) => !background(r, g, b));
  expect(ink.length).toBeGreaterThan(20_000);
  const left = ink.filter(([x]) => x! < width * 0.3);
  const right = ink.filter(([x]) => x! > width * 0.7);
  expect(left.length).toBeGreaterThan(2000);
  expect(right.length).toBeGreaterThan(2000);
  expect(mean(left, 2) - mean(left, 4)).toBeGreaterThan(100);
  expect(mean(right, 4) - mean(right, 2)).toBeGreaterThan(100);
  expect(where(dark).length).toBeLessThan(ink.length * 0.01);
}

test('a gradient fill paints the letters of a text box, and nothing but the letters', async () => {
  const { pixels, dom } = await draw(text(GRADIENT), (host) => ({
    clip: getComputedStyle(host).backgroundClip,
    fill: getComputedStyle(host.querySelector('p')!).webkitTextFillColor,
  }));
  expect(dom).toEqual({ clip: 'text', fill: 'rgba(0, 0, 0, 0)' });
  expectGradient(pixels, (r, g, b) => r > 235 && g > 235 && b > 235);
  // The box around the letters stays the slide's white.
  expect(pixels.where((r, g, b) => r > 235 && g > 235 && b > 235).length).toBeGreaterThan(
    pixels.width * pixels.height * 0.4,
  );
});

test('without the fill the same text is drawn in the colour of its text style', async () => {
  const { pixels } = await draw(text({}), () => null);
  expect(pixels.where(dark).length).toBeGreaterThan(20_000);
});

test('an outline is drawn around the letters, behind them', async () => {
  const green = (r: number, g: number, b: number) => g > 150 && r < 90 && b < 90;
  const outlined = await draw(
    text({ '-webkit-text-stroke': '12px rgb(0, 200, 0)', 'paint-order': 'stroke fill' }),
    (host) => getComputedStyle(host.querySelector('p')!).webkitTextStrokeWidth,
  );
  expect(outlined.dom).toBe('12px');
  expect(outlined.pixels.where(green).length).toBeGreaterThan(5000);
  // Behind the letters: they keep all of their own ink.
  const plain = await draw(text({}), () => null);
  const kept = outlined.pixels.where(dark).length / plain.pixels.where(dark).length;
  expect(kept).toBeGreaterThan(0.97);
  expect(kept).toBeLessThan(1.03);
});

test('a shadow is drawn where its offset puts it, in a colour of the theme', async () => {
  const { pixels, dom } = await draw(
    text({ 'text-shadow': '40px 30px 0px var(--color-primary)' }),
    (host) => ({
      shadow: getComputedStyle(host.querySelector('p')!).textShadow,
      primary: getComputedStyle(host).getPropertyValue('--color-primary').trim(),
    }),
  );
  // The variable resolves against the slide: the shadow follows the theme.
  const probe = document.createElement('span');
  probe.style.color = dom.primary;
  document.body.append(probe);
  const primary = getComputedStyle(probe).color;
  probe.remove();
  expect(dom.shadow).toBe(`${primary} 40px 30px 0px`);

  const [r, g, b] = primary.match(/\d+/g)!.map(Number);
  const near = (x: number, y: number | undefined) => Math.abs(x - (y ?? 0)) < 30;
  const letters = pixels.where(dark);
  const shadow = pixels.where((pr, pg, pb) => near(pr, r) && near(pg, g) && near(pb, b));
  expect(shadow.length).toBeGreaterThan(5000);
  const right = (found: number[][]) => Math.max(...found.map(([x]) => x!));
  const bottom = (found: number[][]) => Math.max(...found.map(([, y]) => y!));
  expect(right(shadow) - right(letters)).toBeGreaterThan(35);
  expect(right(shadow) - right(letters)).toBeLessThan(45);
  expect(bottom(shadow) - bottom(letters)).toBeGreaterThan(25);
  expect(bottom(shadow) - bottom(letters)).toBeLessThan(35);
});

test('the text of a shape takes the same effects, over the fill of the shape', async () => {
  const yellow = (r: number, g: number, b: number) => r > 235 && g > 235 && b < 60;
  const shape = (css: Record<string, string>): Element =>
    createElement.shape({
      id: 'e_shape',
      frame: FRAME,
      geometry: { kind: 'preset', preset: 'rect' },
      fill: { kind: 'solid', color: { value: 'rgb(255, 255, 0)' } },
      content: INK,
      css,
    });
  // The gradient is a background of the text's own box: the shape's fill does not hide it, and
  // the letters are not left transparent over the fill.
  const filled = await draw(shape(GRADIENT), () => null);
  expectGradient(filled.pixels, yellow);

  const green = (r: number, g: number, b: number) => g > 150 && r < 90 && b < 90;
  const magenta = (r: number, g: number, b: number) => r > 200 && b > 200 && g < 60;
  const both = await draw(
    shape({
      '-webkit-text-stroke': '12px rgb(0, 200, 0)',
      'paint-order': 'stroke fill',
      'text-shadow': '40px 30px 0px rgb(255, 0, 255)',
    }),
    () => null,
  );
  expect(both.pixels.where(green).length).toBeGreaterThan(5000);
  expect(both.pixels.where(magenta).length).toBeGreaterThan(5000);
  expect(both.pixels.where(dark).length).toBeGreaterThan(20_000);
});
