import { describe, expect, it } from 'vitest';
import { travel } from './direction';
import {
  animationPresets,
  describePreset,
  findPreset,
  inlinePreset,
  toKeyframes,
  type PresetInput,
} from './presets';
import { transitionTurns, transitionTypes } from './transitions';

const slide = { w: 1920, h: 1080 };
const box = { left: 400, top: 300, right: 700, bottom: 500 };
const input = (direction: Parameters<typeof travel>[0], dir: 'ltr' | 'rtl'): PresetInput => ({
  v: travel(direction, dir),
  box,
  slide,
});
const boxPart = { box: true, opacity: 1, filter: '', unit: 1 };

describe('travel', () => {
  it('flips start and end in RTL, and leaves up and down alone', () => {
    expect(travel('start', 'ltr')).toEqual({ x: -1, y: 0 });
    expect(travel('start', 'rtl')).toEqual({ x: 1, y: 0 });
    expect(travel('end', 'ltr')).toEqual({ x: 1, y: 0 });
    expect(travel('end', 'rtl')).toEqual({ x: -1, y: 0 });
    expect(travel('up', 'rtl')).toEqual(travel('up', 'ltr'));
    expect(travel('down', 'rtl')).toEqual({ x: 0, y: 1 });
  });
});

describe('presets', () => {
  it('lists the presets of SPEC 5.6 and the seven transitions', () => {
    expect(animationPresets.entrance).toEqual(
      expect.arrayContaining(['fade', 'flyIn', 'zoom', 'wipe', 'rise']),
    );
    expect(animationPresets.emphasis).toContain('pulse');
    expect(animationPresets.exit).toEqual(expect.arrayContaining(['fade', 'flyOut', 'zoom']));
    expect(transitionTypes).toEqual([
      'none',
      'fade',
      'push',
      'cover',
      'reveal',
      'wipe',
      'zoom',
      'flip',
    ]);
  });

  it('tells a picker which presets and transitions take a direction', () => {
    const turning = (category: 'entrance' | 'emphasis' | 'exit') =>
      animationPresets[category].filter((name) => describePreset(category, name).directional);
    expect(turning('entrance')).toEqual(['flyIn', 'rise', 'wipe']);
    expect(turning('emphasis')).toEqual([]);
    expect(turning('exit')).toEqual(['flyOut', 'sink', 'wipe']);
    expect(describePreset('entrance', 'wipe')).toEqual({
      known: true,
      directional: true,
      direction: 'end',
    });
    expect(describePreset('exit', 'flyOut').direction).toBe('down');
    expect(describePreset('entrance', 'swoosh').known).toBe(false);
    expect(transitionTypes.filter(transitionTurns)).toEqual([
      'push',
      'cover',
      'reveal',
      'wipe',
      'flip',
    ]);
    expect(transitionTurns('morph')).toBe(false);
  });

  it('flies in from outside the slide, on the side opposite to the travel', () => {
    const { preset } = findPreset('entrance', 'flyIn');
    const fromRight = preset.frames(input('start', 'ltr'));
    expect(fromRight[0]?.x).toBeGreaterThan(slide.w - box.left);
    expect(fromRight[1]).toMatchObject({ x: 0, y: 0 });
    const fromLeft = preset.frames(input('start', 'rtl'));
    expect(fromLeft[0]?.x).toBeLessThan(-box.right);
    const fromBelow = preset.frames(input('up', 'ltr'));
    expect(fromBelow[0]?.y).toBeGreaterThan(slide.h - box.top);
  });

  it('flies out towards the travel', () => {
    const { preset } = findPreset('exit', 'flyOut');
    expect(preset.frames(input('end', 'ltr'))[1]?.x).toBeGreaterThan(0);
    expect(preset.frames(input('end', 'rtl'))[1]?.x).toBeLessThan(0);
  });

  it('wipes in from the side the edge leaves', () => {
    const { preset } = findPreset('entrance', 'wipe');
    // Travelling right, the part that is still hidden is on the right.
    expect(preset.frames(input('end', 'ltr'))[0]?.clip).toEqual([0, 1, 0, 0]);
    expect(preset.frames(input('end', 'rtl'))[0]?.clip).toEqual([0, 0, 0, 1]);
    expect(preset.frames(input('down', 'ltr'))[1]?.clip).toEqual([0, 0, 0, 0]);
  });

  it('takes a name of the other category as its counterpart', () => {
    expect(findPreset('exit', 'flyIn').preset).toBe(findPreset('exit', 'flyOut').preset);
    expect(findPreset('entrance', 'sink').preset).toBe(findPreset('entrance', 'rise').preset);
    expect(findPreset('exit', 'appear').known).toBe(true);
  });

  it('falls back when the name is unknown, and says so', () => {
    const found = findPreset('entrance', 'teleport');
    expect(found.known).toBe(false);
    expect(found.preset).toBe(findPreset('entrance', 'fade').preset);
  });

  it('gives inline text a preset it can play', () => {
    const zoom = findPreset('entrance', 'zoom').preset;
    expect(inlinePreset('entrance', zoom)).toBe(findPreset('entrance', 'fade').preset);
    const rise = findPreset('entrance', 'rise').preset;
    expect(inlinePreset('entrance', rise)).toBe(rise);
  });
});

describe('toKeyframes', () => {
  it('moves a box with `translate`, which leaves its own transform alone', () => {
    const frames = findPreset('entrance', 'rise').preset.frames(input('up', 'ltr'));
    const keyframes = toKeyframes(frames, boxPart);
    expect(keyframes[0]).toMatchObject({ offset: 0, opacity: 0, translate: '0px 80px' });
    expect(keyframes[1]).toMatchObject({ offset: 1, opacity: 1, translate: '0px 0px' });
    expect(keyframes[0]).not.toHaveProperty('transform');
  });

  it('offsets inline text instead, and drops what it cannot do', () => {
    const frames = findPreset('entrance', 'rise').preset.frames(input('up', 'ltr'));
    expect(toKeyframes(frames, { ...boxPart, box: false })[0]).toMatchObject({
      left: '0px',
      top: '80px',
    });
    const zoom = findPreset('entrance', 'zoom').preset.frames(input('up', 'ltr'));
    expect(toKeyframes(zoom, { ...boxPart, box: false })[0]).not.toHaveProperty('scale');
  });

  it('scales opacity by the part and keeps its filter under a blur', () => {
    const fade = findPreset('exit', 'fade').preset.frames(input('down', 'ltr'));
    expect(toKeyframes(fade, { ...boxPart, opacity: 0.5 })[0]?.opacity).toBe(0.5);
    const blur = findPreset('entrance', 'blur').preset.frames(input('up', 'ltr'));
    const filter = 'drop-shadow(0 4px 8px black)';
    expect(toKeyframes(blur, { ...boxPart, filter })[0]?.filter).toBe(`${filter} blur(24px)`);
  });

  it('moves further inside shrunken text, where a pixel is smaller', () => {
    const frames = findPreset('entrance', 'rise').preset.frames(input('up', 'ltr'));
    expect(toKeyframes(frames, { ...boxPart, unit: 2 })[0]?.translate).toBe('0px 160px');
  });

  it('starts and ends a wipe outside the box', () => {
    const frames = findPreset('entrance', 'wipe').preset.frames(input('end', 'ltr'));
    const [first, last] = toKeyframes(frames, boxPart);
    const out = 'calc(0% + -64px)';
    expect(first?.clipPath).toBe(`inset(${out} calc(100% + 64px) ${out} ${out})`);
    expect(last?.clipPath).toBe(`inset(${out} ${out} ${out} ${out})`);
  });
});
