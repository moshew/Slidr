import type { Stroke } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { isMixed, sharedFields, sharedValue } from './several';

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  color: { token: 'text' },
  width: 4,
  ...extra,
});

describe('sharedValue', () => {
  it('is the value when every element has it', () => {
    expect(sharedValue([0.5, 0.5, 0.5])).toBe(0.5);
    expect(sharedValue([{ kind: 'none' }, { kind: 'none' }])).toEqual({ kind: 'none' });
  });

  it('is mixed when one differs, whichever comes first', () => {
    expect(isMixed(sharedValue([1, 0.5, 1]))).toBe(true);
    expect(isMixed(sharedValue([0.5, 1, 1]))).toBe(true);
    expect(
      isMixed(
        sharedValue([
          { kind: 'solid', color: { token: 'primary' } },
          { kind: 'solid', color: { token: 'accent' } },
        ]),
      ),
    ).toBe(true);
  });

  it('compares by value: the same fill written twice is one fill', () => {
    const fill = sharedValue([
      { kind: 'solid', color: { value: '#112233' } },
      { kind: 'solid', color: { value: '#112233' } },
    ]);
    expect(isMixed(fill)).toBe(false);
  });
});

describe('sharedFields', () => {
  it('has no value and nothing mixed when no element has the property', () => {
    const shared = sharedFields<Stroke>([undefined, undefined]);
    expect(shared.value).toBeUndefined();
    expect([...shared.mixed]).toEqual([]);
  });

  it('says the property itself is mixed when only some have it, and shows none of them', () => {
    const shared = sharedFields([stroke(), undefined, stroke({ width: 8 })]);
    expect(shared.value).toBeUndefined();
    expect([...shared.mixed]).toEqual(['state']);
  });

  it('names the fields that differ, and only them', () => {
    const shared = sharedFields([
      stroke(),
      stroke({ color: { value: '#e5484d' } }),
      stroke({ width: 8, dash: 'dotted' }),
    ]);
    expect(shared.value).toBeDefined();
    expect([...shared.mixed].sort()).toEqual(['color', 'dash', 'width']);
  });

  it('counts an optional field that only some set as a field that differs', () => {
    expect([...sharedFields([stroke(), stroke({ dash: 'dashed' })]).mixed]).toEqual(['dash']);
  });

  it('has nothing mixed when they are all the same', () => {
    const shared = sharedFields([stroke({ dash: 'dashed' }), stroke({ dash: 'dashed' })]);
    expect(shared.value).toEqual(stroke({ dash: 'dashed' }));
    expect(shared.mixed.size).toBe(0);
  });
});
