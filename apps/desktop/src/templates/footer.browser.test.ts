/**
 * The deck's footer (SLD-04) as it is drawn, written in the other script than the deck's. The
 * model says a direction and an alignment; what a reader sees is where the letters and the full
 * stop land, and on which side of the foot the line stands. Only a real layout engine shows that.
 */
import { CommandBus, slideFromLayout } from '@slidr/model';
import { renderSlideOffscreen } from '@slidr/renderer';
import { deckFromTemplate, setDeckFooter } from '@slidr/templates';
import { builtInTemplates } from '@slidr/templates/builtin';
import { beforeAll, expect, test } from 'vitest';
import { registerBuiltinFonts } from '../fonts';

beforeAll(() => registerBuiltinFonts());

/** Where each character of a text node is drawn: its left edge, in page pixels. */
function charLefts(node: Text): Map<string, number> {
  const range = document.createRange();
  const lefts = new Map<string, number>();
  for (let i = 0; i < node.data.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    lefts.set(`${i}:${node.data[i]}`, range.getBoundingClientRect().left);
  }
  return lefts;
}

/** The footer of a cards slide of tzuk, drawn: its characters, and its box. */
async function drawnFooter(lang: 'he' | 'en', words: string) {
  const tzuk = builtInTemplates().find((t) => t.theme.id === 'tzuk')!;
  const deck = deckFromTemplate(tzuk, { lang });
  const layout = deck.layouts.find((l) => l.archetype === 'cards')!;
  deck.slides = [slideFromLayout(deck, layout.id).slide];
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(setDeckFooter(bus.deck, words));
  const rendered = await renderSlideOffscreen({
    deck: bus.deck,
    slide: bus.deck.slides[0]!,
    mode: 'thumbnail',
  });
  try {
    const footer = rendered.root.querySelector('[data-decoration-id^="d_footer_"]')!;
    const node = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const range = document.createRange();
    range.selectNodeContents(node);
    const ink = range.getBoundingClientRect();
    const box = footer.getBoundingClientRect();
    const lefts = charLefts(node);
    const at = (i: number) => lefts.get(`${i}:${words[i]}`)!;
    return { at, ink, box };
  } finally {
    rendered.dispose();
  }
}

test('a Latin footer in a Hebrew deck reads as it was typed, on the side the foot seats it', async () => {
  const words = 'ACME Corp.';
  const { at, ink, box } = await drawnFooter('he', words);
  // The full stop ends the line: to the right of the "A". Laid out in the deck's direction it
  // was drawn before it, as ".ACME Corp".
  expect(at(words.length - 1)).toBeGreaterThan(at(0));
  // The footer of tzuk is seated at the end of the foot: the left edge of its box in a Hebrew
  // deck, where a Hebrew footer stands too.
  expect(Math.abs(ink.left - box.left)).toBeLessThan(2);
  const hebrew = await drawnFooter('he', 'צוק רובוטיקה.');
  expect(Math.abs(hebrew.ink.left - hebrew.box.left)).toBeLessThan(2);
});

test('a Hebrew footer in an English deck reads as it was typed, on the side the foot seats it', async () => {
  const words = 'חברת הדוגמה בע"מ.';
  const { at, ink, box } = await drawnFooter('en', words);
  // Hebrew reads right to left: the full stop ends the line at its left end.
  expect(at(words.length - 1)).toBeLessThan(at(0));
  // The end of the foot of an English deck is the right edge of the box.
  expect(Math.abs(ink.right - box.right)).toBeLessThan(2);
  const latin = await drawnFooter('en', 'ACME Corp.');
  expect(Math.abs(latin.ink.right - latin.box.right)).toBeLessThan(2);
});
