/**
 * How a converted slide is put together (ADR-073): the flat list the walk and the guard leave
 * (`convert.browser.test.ts`) becomes text boxes of several paragraphs, shapes with their text,
 * and groups. Every slide here must still look like its source: the composition is judged as
 * the flat slide was, and takes back what does not hold.
 */
import {
  createDeck,
  plainText,
  Slide,
  type Deck,
  type Element,
  type GroupElement,
  type ShapeElement,
  type TextElement,
} from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { ConversionResult } from './engine';
import * as fixtures from './fixtures';
import { convertHtml } from './service';
import { testHost } from './testing';

const host = testHost();
let english: Deck;
let hebrew: Deck;

beforeAll(async () => {
  await page.viewport(1920, 1080);
  english = createDeck({ lang: 'en' });
  hebrew = createDeck({ lang: 'he' });
});

async function convert(html: string, deck: Deck = english): Promise<ConversionResult> {
  const result = await convertHtml(html, deck, host, deck.size);
  expect(Slide.safeParse(result.slide).error?.issues).toBeUndefined();
  expect(result.guard.faithful).toBe(true);
  return result;
}

const SLIDE =
  'position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a';

const groups = (elements: readonly Element[]) =>
  elements.filter((e): e is GroupElement => e.type === 'group');
const texts = (elements: readonly Element[]) =>
  elements.filter((e): e is TextElement => e.type === 'text');
const shapes = (elements: readonly Element[]) =>
  elements.filter((e): e is ShapeElement => e.type === 'shape');
const kinds = (elements: readonly Element[]) => elements.map((e) => e.type);
const sizes = (text: TextElement) => text.content.paragraphs.map((p) => p.runs[0]?.marks?.size);

describe('texts that follow one another', () => {
  it('are the paragraphs of one text box, each in its own look, as far apart as they were', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:160px;top:140px;width:1200px">
        <div style="font-size:22px;letter-spacing:3px;color:#2563eb;font-weight:700">OVERVIEW</div>
        <h1 style="margin:10px 0 0;font-size:80px;line-height:1.1">One box for the lot</h1>
        <p style="margin:36px 0 0;font-size:34px;line-height:1.5;color:#475569">A label, a heading and a paragraph that wraps onto a second line because it is long enough to run past the width its column gives it.</p>
      </div>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['text']);
    const [box] = texts(r.slide.elements);
    expect(plainText(box!.content).split('\n').slice(0, 2)).toEqual([
      'OVERVIEW',
      'One box for the lot',
    ]);
    // A size the theme's own style has is not written out; the other two are.
    expect(sizes(box!).slice(1)).toEqual([80, 34]);
    expect(box!.content.paragraphs[0]!.runs[0]!.marks).toMatchObject({ weight: 700 });
    // The room between them is the space before each paragraph, not three boxes.
    const [, heading, body] = box!.content.paragraphs;
    expect(heading!.spaceBefore ?? 0).toBeGreaterThanOrEqual(0);
    expect(body!.spaceBefore).toBeGreaterThan(20);
    // A paragraph of it wraps: the box is the column, and may wrap.
    expect(box!.wrap).toBeUndefined();
    expect(box!.frame).toMatchObject({ x: 160, w: 1200 });
    expect(r.editability).toBe(1);
  });

  it('are joined in a right-to-left column with left-to-right words in it', async () => {
    const r = await convert(
      `<div style="${SLIDE}" dir="rtl">
        <div style="position:absolute;right:160px;top:160px;width:1000px">
          <h2 style="margin:0;font-size:56px;line-height:1.2">שילוב AI בתהליך</h2>
          <p style="margin:20px 0 0;font-size:32px;line-height:1.5">חיבור ל-Jira ובניית טסט ל-User Story שמדמה משתמש אמיתי.</p>
        </div>
      </div>`,
      hebrew,
    );
    expect(kinds(r.slide.elements)).toEqual(['text']);
    const [box] = texts(r.slide.elements);
    expect(box!.content.paragraphs.map((p) => p.dir)).toEqual(['rtl', 'rtl']);
    expect(box!.frame.x + box!.frame.w).toBeCloseTo(1920 - 160, 0);
  });

  it('are the items of a list in one text box, each with its marker', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <ul style="position:absolute;left:200px;top:200px;width:1000px;margin:0;padding-left:60px;font-size:36px;line-height:1.5">
        <li>First point of the plan</li><li>Second point of the plan</li><li>Third point of the plan</li>
      </ul>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['text']);
    const [list] = texts(r.slide.elements);
    expect(list!.content.paragraphs.map((p) => p.list?.kind)).toEqual([
      'bullet',
      'bullet',
      'bullet',
    ]);
  });

  it('stay apart when a layout seats them by different roles', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <h1 data-role="title" style="position:absolute;left:160px;top:140px;margin:0;font-size:80px;line-height:1.1">A title by its role</h1>
      <p data-role="body" style="position:absolute;left:160px;top:250px;width:1200px;margin:0;font-size:34px;line-height:1.5">The body under it has a role of its own.</p>
    </div>`);
    expect(texts(r.slide.elements).map((t) => t.role)).toEqual(['title', 'body']);
  });

  it('stay apart when something lies between them, or beside one of them in its line', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:160px;top:140px;width:1000px">
        <p style="margin:0;font-size:34px;line-height:1.4">Above the rule</p>
        <div style="height:4px;background:#2563eb;margin:16px 0"></div>
        <p style="margin:0;font-size:34px;line-height:1.4">Under the rule</p>
      </div>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['text', 'shape', 'text']);
  });

  it('stay the rows of a list when each has its own number beside it', async () => {
    const row = (n: number, words: string) =>
      `<div style="display:flex;align-items:center;gap:24px;margin-bottom:28px"><div style="flex:none;width:60px;height:60px;border-radius:50%;background:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800">${n}</div><div style="font-size:34px;line-height:1.3">${words}</div></div>`;
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:160px;top:200px;width:1400px">
        ${row(1, 'The first question of three')}${row(2, 'The second, under it')}${row(3, 'And the third')}
      </div>
    </div>`);
    // A number in its circle, then its text, three times: no text was joined to the next.
    expect(kinds(r.slide.elements)).toEqual(['shape', 'text', 'shape', 'text', 'shape', 'text']);
    // A badge beside a title does not keep the title from the lines under it.
    const card = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:160px;top:200px;width:700px;display:flex;gap:20px;align-items:flex-start">
        <div style="flex:none;width:56px;height:56px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800">1</div>
        <div><div style="font-size:34px;font-weight:700;line-height:1.3">A title with a badge</div><div style="margin-top:8px;font-size:24px;line-height:1.5">And the two lines under it, which have nothing beside them, belong to the same text as the title does.</div></div>
      </div>
    </div>`);
    expect(kinds(card.slide.elements)).toEqual(['shape', 'text']);
    expect(texts(card.slide.elements)[0]!.content.paragraphs).toHaveLength(2);
  });

  it('stay as the walk left them when the composition is not asked for', async () => {
    const html = `<div style="${SLIDE}">
      <h2 style="position:absolute;left:160px;top:140px;margin:0;font-size:56px;line-height:1.2">Two texts</h2>
      <p style="position:absolute;left:160px;top:230px;width:900px;margin:0;font-size:32px;line-height:1.5">And the second of them.</p>
    </div>`;
    const flat = await convertHtml(html, english, host, english.size, { compose: false });
    expect(kinds(flat.slide.elements)).toEqual(['text', 'text']);
    expect(kinds((await convert(html)).slide.elements)).toEqual(['text']);
  });
});

describe('a text in the middle of a box', () => {
  const BADGES = `<div style="${SLIDE}">
    <div style="position:absolute;left:200px;top:200px;width:120px;height:120px;border-radius:50%;background:#1e3a8a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:700">7</div>
    <span style="position:absolute;left:400px;top:230px;padding:10px 26px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:28px;font-weight:700;line-height:1.3">In review</span>
    <div style="position:absolute;left:200px;top:420px;width:96px;height:96px;border-radius:20px;background:#f59e0b;display:inline-flex;align-items:center;justify-content:center;font-size:52px">★</div>
  </div>`;

  it('is the text of the shape: a number in a circle, a chip, an icon in a badge', async () => {
    const r = await convert(BADGES);
    expect(kinds(r.slide.elements)).toEqual(['shape', 'shape', 'shape']);
    const [figure, chip, icon] = shapes(r.slide.elements);
    expect(figure).toMatchObject({
      geometry: { kind: 'preset', preset: 'ellipse' },
      frame: { x: 200, y: 200, w: 120, h: 120 },
    });
    expect(plainText(figure!.content!)).toBe('7');
    // Kept in the middle by the shape, with no room of the default kind to squeeze it.
    expect(figure!.content!.paragraphs[0]!.align).toBe('center');
    expect(figure!.padding!.left).toBe(figure!.padding!.right);
    expect(figure!.padding!.left).toBeLessThan(60);
    expect(plainText(chip!.content!)).toBe('In review');
    expect(chip!.effects?.radius).toBeGreaterThan(0);
    expect(plainText(icon!.content!)).toBe('★');
    expect(r.editability).toBe(1);
    expect(r.textEditability).toBe(1);
  });

  it('stays a text box on its card when the card only happens to be as tall as its text', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:200px;top:200px;width:700px;padding:40px;background:#fff;border:2px solid #e2e8f0;border-radius:20px">
        <p style="margin:0;font-size:30px;line-height:1.5">A paragraph that fills its card from the top: on a taller card it would stay at the top, so it is a text box on a box.</p>
      </div>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['group']);
    expect(kinds(groups(r.slide.elements)[0]!.children)).toEqual(['shape', 'text']);
  });
});

describe('a box and what lies on it', () => {
  it('are a group: the box, then what is on it, counted from the corner of the group', async () => {
    const r = await convert(fixtures.gridCards);
    // The heading of the slide lies on no box.
    expect(kinds(r.slide.elements)).toEqual(['text', 'group', 'group', 'group']);
    const cards = groups(r.slide.elements);
    for (const card of cards) {
      expect(kinds(card.children)).toEqual(['shape', 'svg', 'text']);
      const [box, , words] = card.children;
      expect(box!.frame).toEqual({ x: 0, y: 0, w: card.frame.w, h: card.frame.h });
      // The title of the card and the line under it are one text box.
      expect(words!.type === 'text' && sizes(words)).toEqual([36, 26]);
      for (const child of card.children) {
        expect(child.frame.x).toBeGreaterThanOrEqual(0);
        expect(child.frame.x + child.frame.w).toBeLessThanOrEqual(card.frame.w + 0.5);
      }
    }
    expect(cards.map((card) => card.frame.y)).toEqual([
      cards[0]!.frame.y,
      cards[0]!.frame.y,
      cards[0]!.frame.y,
    ]);
    expect(r.editability).toBe(1);
  });

  it('come out alike for cards that stand side by side, however much each holds', async () => {
    const card = (title: string, body: string) =>
      `<div style="flex:1;padding:36px;background:#fff;border:2px solid #e2e8f0;border-radius:20px"><h3 style="margin:0 0 14px;font-size:36px;line-height:1.2">${title}</h3><p style="margin:0;font-size:26px;line-height:1.5;color:#475569">${body}</p></div>`;
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:120px;top:200px;width:1680px;display:flex;gap:40px">
        ${card('Short', 'One line.')}
        ${card('The longest of the three', 'This one has the most to say, and so it is the one that decides how tall the row of cards is, filling its own card from top to bottom.')}
        ${card('Middle', 'Two lines of text, more or less, in this one.')}
      </div>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['group', 'group', 'group']);
    for (const group of groups(r.slide.elements)) {
      expect(kinds(group.children)).toEqual(['shape', 'text']);
      const words = group.children[1]!;
      expect(words.type === 'text' && words.content.paragraphs).toHaveLength(2);
    }
  });

  it('holds a number, a chip and the texts of the card, each as one thing', async () => {
    const r = await convert(
      `<div style="${SLIDE}" dir="rtl">
        <div data-name="step" style="position:absolute;right:200px;top:200px;width:640px;display:flex;gap:20px;align-items:flex-start;padding:28px;background:#fff;border:2px solid #e2e8f0;border-radius:18px">
          <div style="flex:none;width:56px;height:56px;border-radius:50%;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800">1</div>
          <div>
            <div style="font-size:20px;font-weight:700;letter-spacing:2px;color:#2563eb">נקודת הפתיחה</div>
            <div style="margin-top:6px;font-size:32px;font-weight:700;line-height:1.3">הבעיה במערכת</div>
            <div style="margin-top:8px;font-size:24px;line-height:1.5;color:#475569">כל פעם שרצינו ליצור משהו חדש כתבנו קוד מאפס, והתאמות לקוד קיים.</div>
            <div style="margin-top:14px;display:flex;gap:8px"><span style="padding:4px 14px;border-radius:20px;background:#eff6ff;color:#1d4ed8;font-size:18px;line-height:1.4">POC</span><span style="padding:4px 14px;border-radius:20px;background:#eff6ff;color:#1d4ed8;font-size:18px;line-height:1.4">N8N</span></div>
          </div>
        </div>
      </div>`,
      hebrew,
    );
    expect(kinds(r.slide.elements)).toEqual(['group']);
    const [card] = groups(r.slide.elements);
    // The name the page gave the card is the group's.
    expect(card!.name).toBe('step');
    expect(card!.children[0]!.name).toBeUndefined();
    expect(kinds(card!.children)).toEqual(['shape', 'shape', 'text', 'shape', 'shape']);
    const [, number, words, first, second] = card!.children;
    expect(number!.type === 'shape' && plainText(number.content!)).toBe('1');
    expect(words!.type === 'text' && words.content.paragraphs).toHaveLength(3);
    expect(
      [first, second].map((chip) => chip!.type === 'shape' && plainText(chip.content!)),
    ).toEqual(['POC', 'N8N']);
  });

  it('stays on the slide itself when a layout seats what is on it by its role', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:0;top:0;width:1920px;height:260px;background:#1e3a8a">
        <h1 data-role="title" style="position:absolute;left:160px;top:80px;margin:0;font-size:80px;line-height:1.1;color:#fff">A title on a band</h1>
      </div>
    </div>`);
    expect(kinds(r.slide.elements)).toEqual(['shape', 'text']);
    expect(r.slide.elements[1]!.role).toBe('title');
  });

  it('enters as one thing when everything in it enters with one data-anim', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div data-anim="fade-in" style="position:absolute;left:200px;top:200px;width:600px;padding:36px;background:#fff;border:2px solid #e2e8f0;border-radius:20px">
        <h3 style="margin:0 0 14px;font-size:36px;line-height:1.2">Enters whole</h3>
        <p style="margin:0;font-size:26px;line-height:1.5;color:#475569">The box and its words, in one step.</p>
      </div>
    </div>`);
    const [card] = groups(r.slide.elements);
    expect(r.slide.timeline).toHaveLength(1);
    expect(r.slide.timeline[0]).toMatchObject({ elementId: card!.id, preset: 'fade-in' });
  });
});

describe('the coloured side of a card', () => {
  it('is the accent of its shape when it is written as one thick border', async () => {
    const r = await convert(`<div style="${SLIDE}">
      <div style="position:absolute;left:200px;top:200px;width:700px;padding:36px;background:#fff;border:2px solid #e2e8f0;border-left:10px solid #0891b2;border-radius:18px">
        <p style="margin:0;font-size:30px;line-height:1.5">A card with a coloured edge on its left.</p>
      </div>
      <h2 style="position:absolute;left:200px;top:520px;margin:0;padding-bottom:12px;border-bottom:4px solid #0891b2;font-size:48px;line-height:1.2">Underlined by a border</h2>
    </div>`);
    const [card, heading] = groups(r.slide.elements);
    const box = card!.children[0] as ShapeElement;
    expect(box.stroke).toMatchObject({ width: 2, color: { value: '#e2e8f0' } });
    expect(box.accent).toEqual({
      side: 'left',
      size: 10,
      fill: { kind: 'solid', color: { value: '#0891b2' } },
      corners: 'follow',
    });
    expect(box.css).toBeUndefined();
    // A border on one side only: no outline, and the accent on that side.
    const rule = heading!.children[0] as ShapeElement;
    expect(rule.stroke).toBeUndefined();
    expect(rule.accent).toMatchObject({ side: 'bottom', size: 4, corners: 'follow' });
    expect(r.editability).toBe(1);
  });

  it('is the accent of its shape when it is a stripe the card draws along its top and cuts at its corners', async () => {
    const r = await convert(`<style>
        .card { position:absolute; left:200px; top:200px; width:640px; padding:40px; background:#fff; border:2px solid #e2e8f0; border-radius:24px; overflow:hidden; }
        .card::before { content:""; position:absolute; top:0; left:0; right:0; height:10px; background:linear-gradient(90deg,#06b6d4,#8b5cf6); }
      </style>
      <div style="${SLIDE}">
        <div class="card"><h3 style="margin:0 0 12px;font-size:36px;line-height:1.2">A stripe on top</h3><p style="margin:0;font-size:26px;line-height:1.5;color:#475569">Cut by the rounded corners of its card.</p></div>
      </div>`);
    expect(kinds(r.slide.elements)).toEqual(['group']);
    const box = groups(r.slide.elements)[0]!.children[0] as ShapeElement;
    expect(box.type).toBe('shape');
    expect(box.accent).toMatchObject({ side: 'top', size: 10, fill: { kind: 'linear' } });
    expect(box.accent!.corners).toBeUndefined();
    expect(box.stroke).toMatchObject({ width: 2 });
    // The box is a shape now, where the stripe used to keep it HTML.
    expect(r.editability).toBe(1);
    expect(r.guard.fallbacks).toEqual([]);
  });

  it('does not keep a sheen over the whole card from being a shape of its own', async () => {
    // A card with one thicker border and a gradient laid over all of it: the sheen fills the
    // box inside borders that are not all one width, which used to leave the card's box HTML.
    const r = await convert(`<style>
        .card { position:absolute; left:200px; top:200px; width:640px; padding:36px; background:#fffbeb; border:2px solid #fde68a; border-top:8px solid #f59e0b; border-radius:20px; overflow:hidden; }
        .card::before { content:""; position:absolute; inset:0; background:linear-gradient(130deg, rgba(245,158,11,.18) 0%, transparent 58%); pointer-events:none; }
      </style>
      <div style="${SLIDE}">
        <div class="card"><h3 style="margin:0 0 12px;font-size:36px;line-height:1.2">A goal</h3><p style="margin:0;font-size:26px;line-height:1.5;color:#475569">With a sheen across the card.</p></div>
      </div>`);
    expect(kinds(r.slide.elements)).toEqual(['group']);
    const [box, ...onIt] = groups(r.slide.elements)[0]!.children;
    expect(box).toMatchObject({
      type: 'shape',
      stroke: { width: 2 },
      accent: { side: 'top', size: 8, corners: 'follow' },
    });
    // The sheen is a shape on the card, and the two texts are one text box.
    expect(kinds(onIt).sort()).toEqual(['shape', 'text']);
    expect(r.editability).toBe(1);
    expect(r.guard.fallbacks).toEqual([]);
  });
});
