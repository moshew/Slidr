import { createSlide, type Element, type Slide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { familyIn, fontShelf, nearestWeight, setInLanguage } from './designFonts';

const shelf = fontShelf({
  families: [
    {
      family: 'Heebo',
      scripts: ['he', 'latin'],
      for: ['he'],
      counterparts: { arabic: 'Noto Kufi Arabic' },
    },
    {
      family: 'Rubik',
      scripts: ['he', 'latin', 'arabic', 'cyrillic'],
      for: ['he', 'latin', 'arabic'],
    },
    {
      family: 'Playfair Display',
      scripts: ['latin', 'cyrillic'],
      for: ['latin'],
      counterparts: { arabic: 'Amiri', japanese: 'Noto Serif JP' },
    },
    {
      family: 'Space Grotesk',
      scripts: ['latin', 'vietnamese'],
      for: ['latin'],
      counterparts: { cyrillic: 'Manrope', japanese: 'Noto Sans JP' },
    },
    {
      family: 'DM Serif Display',
      scripts: ['latin'],
      for: ['latin'],
      counterparts: { japanese: 'Noto Serif JP' },
      looks: 700,
    },
    { family: 'Manrope', scripts: ['latin', 'cyrillic'], for: ['latin'] },
    { family: 'Noto Kufi Arabic', scripts: ['latin', 'arabic'], for: ['arabic'] },
    { family: 'Amiri', scripts: ['latin', 'arabic'], for: ['arabic'] },
    { family: 'Noto Serif JP', scripts: ['latin', 'japanese'], for: ['japanese'] },
    { family: 'Noto Sans JP', scripts: ['latin', 'japanese'], for: ['japanese'] },
  ],
  faces: [
    { family: 'Amiri', style: 'normal', weight: '400' },
    { family: 'Amiri', style: 'normal', weight: '700' },
    { family: 'Amiri', style: 'italic', weight: '400' },
    { family: 'Noto Serif JP', style: 'normal', weight: '200 900' },
    { family: 'Noto Sans JP', style: 'normal', weight: '100 900' },
    { family: 'Manrope', style: 'normal', weight: '200 800' },
    { family: 'Noto Kufi Arabic', style: 'normal', weight: '100 900' },
    { family: 'Rubik', style: 'normal', weight: '300 900' },
  ],
});

/** A text box of runs, each `[text, font, weight]`. */
function box(id: string, ...runs: [string, string, number][]): Element {
  return {
    id,
    type: 'text',
    frame: { x: 0, y: 0, w: 400, h: 100 },
    rotation: 0,
    opacity: 1,
    autoFit: 'none',
    vAlign: 'top',
    content: {
      paragraphs: [
        { runs: runs.map(([text, font, weight]) => ({ text, marks: { font, weight } })) },
      ],
    },
  } as Element;
}

const slideOf = (...elements: Element[]): Slide => ({ ...createSlide(), elements });

const fonts = (slide: Slide) =>
  slide.elements.flatMap((element) =>
    element.type === 'text'
      ? element.content.paragraphs.flatMap((p) =>
          p.runs.map((r) => [r.marks?.font, r.marks?.weight]),
        )
      : [],
  );

describe('the fonts of a design in another language', () => {
  it('keep a family of the language, and take the counterpart of any other', () => {
    expect(familyIn(shelf, 'Rubik', 'ar', 'مستقبل')).toBe('Rubik');
    expect(familyIn(shelf, 'Heebo', 'ar', 'مستقبل')).toBe('Noto Kufi Arabic');
    expect(familyIn(shelf, 'Playfair Display', 'ja', '未来')).toBe('Noto Serif JP');
    expect(familyIn(shelf, 'Playfair Display', 'ru', 'Будущее')).toBe('Playfair Display');
    expect(familyIn(shelf, 'Space Grotesk', 'ru', 'Будущее')).toBe('Manrope');
    expect(familyIn(shelf, 'Unknown Sans', 'ar', 'مستقبل')).toBeUndefined();
  });

  it('keep a Latin family for a text without the letters of the language', () => {
    expect(familyIn(shelf, 'Space Grotesk', 'ja', '2027')).toBe('Space Grotesk');
    // A Hebrew family is no font of an Arabic deck, figures or not.
    expect(familyIn(shelf, 'Heebo', 'ar', '2027')).toBe('Noto Kufi Arabic');
    // Cyrillic is written beside Latin: one family for the whole of a Russian slide.
    expect(familyIn(shelf, 'Space Grotesk', 'ru', 'AI')).toBe('Manrope');
  });

  it('come at the weight nearest to the one asked for', () => {
    expect(nearestWeight(shelf, 'Amiri', 800)).toBe(700);
    expect(nearestWeight(shelf, 'Amiri', 500)).toBe(400);
    expect(nearestWeight(shelf, 'Manrope', 900)).toBe(800);
    expect(nearestWeight(shelf, 'Noto Serif JP', 600)).toBe(600);
    // Between two as near: the heavier from 500 up, as a browser chooses.
    expect(nearestWeight(shelf, 'Amiri', 550)).toBe(700);
    expect(nearestWeight(shelf, 'Amiri', 450)).toBe(400);
  });

  it('let a text box in another family shrink its text to its frame', () => {
    const english = slideOf(box('title', ['The future', 'Playfair Display', 700]));
    const japanese = slideOf(box('title', ['未来', 'Playfair Display', 700]));
    const set = setInLanguage(japanese, english, 'ja', shelf).slide.elements[0];
    expect(set?.type === 'text' && set.autoFit).toBe('shrink');
    // One whose family stays as it was keeps its fit.
    const kept = setInLanguage(
      slideOf(box('title', ['Будущее', 'Playfair Display', 700])),
      english,
      'ru',
      shelf,
    );
    expect(kept.slide.elements[0]?.type === 'text' && kept.slide.elements[0].autoFit).toBe('none');
  });

  it('set a face of one weight that looks bold in its counterpart’s bold', () => {
    const english = slideOf(box('title', ['What we found', 'DM Serif Display', 400]));
    const japanese = slideOf(box('title', ['調査結果', 'DM Serif Display', 400]));
    const { slide } = setInLanguage(japanese, english, 'ja', shelf);
    expect(fonts(slide)).toEqual([['Noto Serif JP', 700]]);
    // Set again, it is as it was.
    expect(setInLanguage(slide, english, 'ja', shelf).changes).toEqual([]);
  });

  it('are those of the source slide, element by element', () => {
    const english = slideOf(
      box('title', ['The future', 'Playfair Display', 800]),
      box('date', ['18 March 2027', 'Space Grotesk', 500]),
    );
    // As the Arabic designs were first written: every text in the one family with the letters.
    const arabic = slideOf(
      box('title', ['المستقبل', 'Rubik', 800]),
      box('date', ['18 مارس 2027', 'Rubik', 500]),
    );
    const { slide, changes } = setInLanguage(arabic, english, 'ar', shelf);
    expect(fonts(slide)).toEqual([
      ['Amiri', 700],
      ['Rubik', 500],
    ]);
    expect(changes).toEqual([{ from: 'Rubik', to: 'Amiri' }]);
    // The slide it was given is not changed.
    expect(fonts(arabic)[0]).toEqual(['Rubik', 800]);
  });

  it('pair texts in order when their elements have other ids', () => {
    const english = slideOf(
      box('a', ['Night market', 'Playfair Display', 700]),
      box('b', ['Open late', 'Space Grotesk', 400]),
    );
    const japanese = slideOf(
      box('x', ['夜市', 'Space Grotesk', 700]),
      box('y', ['深夜まで', 'Space Grotesk', 400]),
    );
    expect(fonts(setInLanguage(japanese, english, 'ja', shelf).slide)).toEqual([
      ['Noto Serif JP', 700],
      ['Noto Sans JP', 400],
    ]);
    // Texts that cannot be paired are set from their own families.
    const lone = slideOf(box('x', ['夜市', 'Playfair Display', 700]));
    expect(fonts(setInLanguage(lone, english, 'ja', shelf).slide)).toEqual([
      ['Noto Serif JP', 700],
    ]);
  });
});
