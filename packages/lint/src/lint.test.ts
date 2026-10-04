import { createElement, richText, type Deck, type Element } from '@slidr/model';
import { englishDeck, fixtureDecks, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { lintSlide } from './lint';
import { rules } from './rules';
import { measure, text } from './testing';

/** Rule and elements of every finding of a deck, by slide, with measurements as written by hand. */
function findingsOf(deck: Deck): Record<string, string[]> {
  return Object.fromEntries(
    deck.slides.map((slide) => [
      slide.id,
      lintSlide(deck, slide, measure(slide)).map((f) => [f.rule, ...f.elementIds].join(' ')),
    ]),
  );
}

describe('rule sets', () => {
  it('has the nine rules that go back to the agent (LNT-04, QG-03, QG-04)', () => {
    const agent = rules.filter((rule) => rule.agent).map((rule) => rule.id);
    expect(agent).toEqual(['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L13', 'L16']);
  });

  it('keeps the rest for the user: the other rules, and what three of them see in a chart', () => {
    const user = rules.filter((rule) => !rule.agent).map((rule) => rule.id);
    expect(user).toEqual([
      'L03',
      'L04',
      'L05',
      'L08',
      'L09',
      'L10',
      'L11',
      'L12',
      'L14',
      'L15',
      'L17',
    ]);
    // A number that stands twice is one rule seen two ways, and keeps one severity.
    for (const rule of rules) {
      expect(rules.filter((r) => r.id === rule.id).every((r) => r.severity === rule.severity)).toBe(
        true,
      );
    }
  });

  it('gives each rule the severity of SPEC 9.2', () => {
    const severities = Object.fromEntries(rules.map((rule) => [rule.id, rule.severity]));
    expect(severities).toEqual({
      L01: 'error',
      L02: 'error',
      L03: 'warning',
      L04: 'warning',
      L05: 'error',
      L06: 'error',
      L07: 'warning',
      L08: 'info',
      L09: 'warning',
      L10: 'warning',
      L11: 'info',
      L12: 'warning',
      L13: 'warning',
      L14: 'info',
      L15: 'warning',
      L16: 'warning',
      // Not of SPEC 9.2: the empty band at the bottom, which ADR-042 asked for.
      L17: 'warning',
    });
  });
});

describe('lintSlide', () => {
  const deck = hebrewDeck();
  const slide = deck.slides[1]!;

  it('returns findings in the order of the rule list, for the slide given', () => {
    const frame = { x: 1500, y: 20, w: 500, h: 40 };
    const findings = lintSlide(deck, slide, {
      elements: {
        ...measure(slide).elements,
        e_he_goals_title: { box: frame, text: text(frame, { overflow: { x: 0, y: 30 } }) },
      },
    });
    expect(findings.map((f) => f.rule)).toEqual(['L01', 'L02', 'L16']);
    expect(findings.every((f) => f.slideId === 's_he_goals')).toBe(true);
  });

  it('gives the agent its own rules only; `all` adds the rules of the user', () => {
    // Two boxes whose left edges are 3px apart: a finding of L09, which is the user's.
    const boxes = [96, 99].map((x, i) =>
      createElement.shape({ id: `e_box${i}`, frame: { x, y: 300 + i * 320, w: 900, h: 280 } }),
    );
    const uneven = { ...slide, elements: [...slide.elements, ...boxes] };
    const measured = measure(uneven);
    const all = lintSlide(deck, uneven, measured);
    const agent = lintSlide(deck, uneven, measured, 'agent');
    expect(all.map((f) => f.rule)).toContain('L09');
    expect(agent.map((f) => f.rule)).not.toContain('L09');
    // What the agent gets is what `all` holds of the agent's rules, in the same order.
    const own = new Set(rules.filter((rule) => rule.agent).map((rule) => rule.id));
    expect(agent).toEqual(all.filter((f) => own.has(f.rule)));
  });

  it('is pure: the same input gives the same findings and changes nothing', () => {
    const measured = measure(slide);
    const before = JSON.stringify([deck, measured]);
    expect(lintSlide(deck, slide, measured)).toEqual(lintSlide(deck, slide, measured));
    expect(JSON.stringify([deck, measured])).toBe(before);
  });

  it('skips what was not rendered: hidden elements and everything inside a hidden group', () => {
    const lost = { x: 3000, y: 0, w: 100, h: 100 };
    const elements: Element[] = [
      {
        ...createElement.text({ id: 'e_hidden', frame: lost, content: richText('x') }),
        hidden: true,
      },
      {
        ...createElement.group({
          id: 'e_group',
          frame: lost,
          children: [createElement.shape({ id: 'e_child', frame: lost })],
        }),
        hidden: true,
      },
    ];
    const hiddenSlide = { ...slide, elements };
    expect(lintSlide(deck, hiddenSlide, measure(hiddenSlide)).map((f) => f.rule)).toEqual(['L07']);
  });

  it('judges a slide of 200 elements in a few milliseconds (LNT-01)', () => {
    const elements = Array.from({ length: 200 }, (_, i) =>
      createElement.text({
        id: `e_${i}`,
        frame: { x: 100 + (i % 20) * 86, y: 90 + Math.floor(i / 20) * 90, w: 80, h: 60 },
        content: richText(`פריט ${i}`),
      }),
    );
    const busy = { ...slide, elements };
    const measured = measure(busy);
    lintSlide(deck, busy, measured);
    // `Date`, not `performance`: this package has neither the DOM nor Node in its types.
    const start = Date.now();
    for (let i = 0; i < 20; i++) lintSlide(deck, busy, measured);
    expect((Date.now() - start) / 20).toBeLessThan(20);
  });
});

describe('the example decks, with text that fills its frames', () => {
  it('have no error-level finding the model alone can show', () => {
    for (const make of Object.values(fixtureDecks)) {
      const deck = make();
      for (const slide of deck.slides) {
        const errors = lintSlide(deck, slide, measure(slide)).filter((f) => f.severity === 'error');
        expect(errors, slide.id).toEqual([]);
      }
    }
  });

  it('are flagged the same way in Hebrew and in English', () => {
    // Text alone on an empty background: no visual, and the hero and the number leave most of
    // the slide empty. The title-and-bullets frames are wide, so by frames alone they cover
    // enough; their real glyphs (the browser tests) do not.
    expect(findingsOf(hebrewDeck())).toEqual({
      s_he_hero: ['L07', 'L16'],
      s_he_goals: ['L16'],
      s_he_number: ['L07', 'L16'],
    });
    expect(findingsOf(englishDeck())).toEqual({
      s_en_hero: ['L07', 'L16'],
      s_en_goals: ['L16'],
      s_en_risks: ['L16'],
    });
  });
});
