/**
 * The boxes a layout's HTML gives the parts that carry a role (WG7-T11a). The conversion engine
 * turns a block of text into a text box as tall as its words, which is right for a slide and
 * wrong for a placeholder: a body drawn 360px tall for four lines, with one line of sample in
 * it, would become a placeholder of one line. So the HTML is laid out once more, in the engine's
 * own sandbox (a frame that runs no scripts and reaches no network), and each part with a role
 * is measured as it was drawn.
 */
import { openSandbox, type ConversionHost } from '@slidr/html-import';
import type { Deck } from '@slidr/model';
import type { AssetResolver } from '@slidr/renderer';
import type { DrawnBox } from '@slidr/templates';

const unused = () =>
  Promise.reject(new Error('Measuring a layout takes no picture and stores nothing.'));

/**
 * `deck` is the one the layout is converted on: its theme gives the HTML its variables, and its
 * assets are the ones the HTML may name. The boxes come back in the order of the HTML, in
 * slide pixels.
 */
export async function measureRoles(
  html: string,
  deck: Deck,
  resolveAsset: AssetResolver,
): Promise<DrawnBox[]> {
  const host: ConversionHost = { capture: unused, storeAsset: unused, resolveAsset };
  // Out of sight, and out of the way of whatever is on the page.
  const parent = document.createElement('div');
  parent.setAttribute('aria-hidden', 'true');
  parent.style.cssText =
    'position:fixed;left:-30000px;top:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.append(parent);
  let sandbox;
  try {
    sandbox = await openSandbox(html, { deck, host, size: deck.size, parent });
    // The frame's own page is the slide: its top-left corner is the slide's.
    return Array.from(sandbox.document.querySelectorAll('[data-role]'), (part) => {
      const { left, top, width, height } = part.getBoundingClientRect();
      return {
        role: part.getAttribute('data-role')?.trim() ?? '',
        frame: { x: left, y: top, w: width, h: height },
      };
    });
  } finally {
    sandbox?.dispose();
    parent.remove();
  }
}
