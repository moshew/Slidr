import { isMixed, MIXED, type Value } from '../text/format';
import { sameValue } from '../text/richTextDoc';

/*
 * What several selected elements share of one property, for the row B tools that change them
 * together (SPEC 4.4). A value the elements do not share is shown as mixed, never as the value of
 * the first of them. Pure, so it is tested without a DOM.
 */

export { isMixed, MIXED, type Value };

/** The value all of them have, or `MIXED`. */
export function sharedValue<T>(values: readonly T[]): Value<T> {
  const first = values[0] as T;
  return values.every((value) => sameValue(value, first)) ? first : MIXED;
}

/**
 * The fields of a property that the elements do not share. `state` is the property itself: some
 * of the elements have it (an outline, a shadow) and some have none.
 */
export type MixedFields<T> = ReadonlySet<keyof T | 'state'>;

export interface Shared<T extends object> {
  /**
   * What the controls of the property start from: undefined when none of the elements has it,
   * and when only some have. The fields named in `mixed` are not shared, and no control shows
   * this value for them.
   */
  value: T | undefined;
  mixed: MixedFields<T>;
}

/**
 * A property that is an object (a stroke, a shadow) or absent, over several elements, field by
 * field: with outlines of one width and three colours, the width is shown and the colour is mixed.
 */
export function sharedFields<T extends object>(values: readonly (T | undefined)[]): Shared<T> {
  const present = values.filter((value): value is T => value !== undefined);
  const mixed = new Set<keyof T | 'state'>();
  if (present.length === 0) return { value: undefined, mixed };
  if (present.length < values.length) return { value: undefined, mixed: mixed.add('state') };
  const first = present[0] as T;
  const keys = new Set(present.flatMap((value) => Object.keys(value) as (keyof T)[]));
  for (const key of keys) {
    if (!present.every((value) => sameValue(value[key], first[key]))) mixed.add(key);
  }
  return { value: first, mixed };
}
