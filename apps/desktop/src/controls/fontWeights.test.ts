import type { AssetMeta } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  drawnWeight,
  familyWeights,
  fontWeights,
  NAMED_WEIGHTS,
  type FontSources,
} from './fontWeights';

const none: FontSources = { registered: [], assets: {}, installed: [] };

const fontAsset = (id: string, family: string, weight: string): AssetMeta => ({
  id,
  file: `${id}.woff2`,
  mime: 'font/woff2',
  kind: 'font',
  bytes: 1,
  origin: 'import',
  font: { family, weight, style: 'normal' },
});

describe('the weights of a family', () => {
  it('are the weights of its static faces, each once, ascending', () => {
    const family = familyWeights([
      [700, 700],
      [400, 400],
      [400, 400],
    ]);
    expect(family.offered).toEqual([400, 700]);
  });

  it('are every named weight a variable face draws', () => {
    expect(familyWeights([[100, 900]]).offered).toEqual([...NAMED_WEIGHTS]);
    expect(familyWeights([[200, 800]]).offered).toEqual([200, 300, 400, 500, 600, 700, 800]);
  });

  it('keep a weight that has no name, and the ends of a range that are not named ones', () => {
    expect(
      familyWeights([
        [350, 350],
        [400, 400],
      ]).offered,
    ).toEqual([350, 400]);
    expect(familyWeights([[250, 650]]).offered).toEqual([250, 300, 400, 500, 600, 650]);
  });
});

describe('where the faces of a family are read from', () => {
  it('is the faces the page registered, by name, whatever the case and the quotes', () => {
    const registered = [
      { family: 'Alef', weight: '400' },
      { family: 'Alef', weight: 'bold' },
      { family: '"Open Sans"', weight: '300 800' },
      { family: 'Heebo::hebrew', weight: '100 900' },
    ];
    expect(fontWeights('alef', { ...none, registered })?.offered).toEqual([400, 700]);
    expect(fontWeights('Open Sans', { ...none, registered })?.offered).toEqual([
      300, 400, 500, 600, 700, 800,
    ]);
  });

  it('is the fonts the deck carries, also when no slide has registered them', () => {
    const assets = {
      a: fontAsset('a', 'Deck Sans', '300'),
      b: fontAsset('b', 'Deck Sans', '700'),
      c: fontAsset('c', 'Other', '400'),
    };
    expect(fontWeights('Deck Sans', { ...none, assets })?.offered).toEqual([300, 700]);
  });

  it('is the computer, for a font that is only installed', () => {
    const installed = [
      { family: 'Segoe UI', hebrew: true, symbol: false, weights: [300, 350, 400] },
    ];
    expect(fontWeights('Segoe UI', { ...none, installed })?.offered).toEqual([300, 350, 400]);
  });

  it('is the page before the computer: the registered face is the one that draws the name', () => {
    const sources: FontSources = {
      registered: [{ family: 'Heebo', weight: '100 900' }],
      assets: {},
      installed: [{ family: 'heebo', hebrew: true, symbol: false, weights: [400] }],
    };
    expect(fontWeights('Heebo', sources)?.offered).toEqual([...NAMED_WEIGHTS]);
  });

  it('is nothing for a family nobody knows, or an installed one whose weights were not told', () => {
    expect(fontWeights('Nowhere Sans', none)).toBeNull();
    const installed = [{ family: 'Old Core', hebrew: false, symbol: false }];
    expect(fontWeights('Old Core', { ...none, installed })).toBeNull();
  });
});

describe('the weight text is drawn in', () => {
  const regularAndBold = familyWeights([
    [400, 400],
    [700, 700],
  ]);

  it('is the weight it asks for, when a face has it', () => {
    expect(drawnWeight(regularAndBold, 700)).toBe(700);
    // Any weight inside the range of a variable face.
    expect(drawnWeight(familyWeights([[100, 900]]), 350)).toBe(350);
  });

  it('looks heavier first above 500, and lighter when there is nothing heavier', () => {
    expect(drawnWeight(regularAndBold, 600)).toBe(700);
    expect(drawnWeight(regularAndBold, 900)).toBe(700);
  });

  it('looks lighter first below 400, and heavier when there is nothing lighter', () => {
    const lightAndBold = familyWeights([
      [300, 300],
      [700, 700],
    ]);
    expect(drawnWeight(lightAndBold, 350)).toBe(300);
    expect(drawnWeight(regularAndBold, 100)).toBe(400);
  });

  it('from 400 to 500 looks up to 500, then lighter, then heavier', () => {
    const family = familyWeights([
      [300, 300],
      [500, 500],
      [700, 700],
    ]);
    expect(drawnWeight(family, 400)).toBe(500);
    expect(drawnWeight(regularAndBold, 500)).toBe(400);
    expect(drawnWeight(familyWeights([[700, 700]]), 450)).toBe(700);
  });

  it('stops at the end of a variable face that does not reach the weight', () => {
    const upTo600 = familyWeights([[300, 600]]);
    expect(drawnWeight(upTo600, 700)).toBe(600);
    expect(drawnWeight(upTo600, 100)).toBe(300);
  });
});
