import subsetterUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import type * as Woff2 from 'woff2-encoder';
import codecUrl from 'woff2-encoder?url';

/**
 * Cutting a font down to the characters in use (WG9-T09). This is the heavy half of font
 * embedding: HarfBuzz's subsetter (650 kB of WebAssembly) and a WOFF2 codec (1 MB, its own
 * WebAssembly inside). Both are files fetched by address when the first export has fonts to cut,
 * so the app does not pay for them at start-up.
 *
 * HarfBuzz keeps what shaping needs of the glyphs it keeps: it follows GSUB to the ligatures and
 * the alternates the characters can turn into, and keeps their kerning and mark positioning.
 */

export interface SubsetRequest {
  /** The font file as the page loaded it: WOFF2, or a bare TrueType or OpenType font. */
  bytes: Uint8Array;
  /** The characters the face draws, by the weight it draws them at. */
  byWeight: ReadonlyMap<number, Iterable<number>>;
  /** Keep every OpenType feature, not only those a shaper applies without being asked. */
  features: boolean;
  /** False keeps a variable font variable: its text sets the axes itself. */
  instances: boolean;
  /**
   * Faces of one group are one face to the browser, each with its own `unicode-range`: they
   * become static fonts together or not at all (see `groupKey`).
   */
  group: string;
}

export interface SubsetFont {
  /** The subset, as WOFF2. */
  bytes: Uint8Array<ArrayBuffer>;
  /** The weight of a static font cut from a variable one; undefined for a font as it was. */
  weight?: number;
}

/** The functions of `harfbuzz-subset.wasm` used here. Pointers and tags are numbers. */
interface HarfBuzz {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(pointer: number): void;
  hb_blob_create(
    data: number,
    length: number,
    mode: number,
    userData: number,
    destroy: number,
  ): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, value: number): void;
  hb_set_clear(set: number): void;
  hb_set_invert(set: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_input_set(input: number, which: number): number;
  hb_subset_input_pin_axis_location(
    input: number,
    face: number,
    axis: number,
    value: number,
  ): number;
  hb_subset_or_fail(face: number, input: number): number;
  _initialize?: () => void;
}

/** `HB_MEMORY_MODE_WRITABLE`: the blob uses the bytes it is given, which are freed here. */
const WRITABLE = 2;
/** `HB_SUBSET_SETS_LAYOUT_FEATURE_TAG`: the set of OpenType features a subset keeps. */
const LAYOUT_FEATURES = 6;

const tag = (name: string): number =>
  ((name.charCodeAt(0) << 24) |
    (name.charCodeAt(1) << 16) |
    (name.charCodeAt(2) << 8) |
    name.charCodeAt(3)) >>>
  0;
const WOFF2 = tag('wOF2');
const SFNT = new Set([0x00010000, tag('OTTO'), tag('true')]);
const FVAR = tag('fvar');
const WEIGHT_AXIS = tag('wght');

interface Tools {
  hb: HarfBuzz;
  codec: typeof Woff2;
}

async function load(): Promise<Tools> {
  const response = await fetch(subsetterUrl);
  if (!response.ok) throw new Error('the font subsetter could not be loaded');
  // The module imports nothing: it brings its own allocator and grows its own memory.
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
  const hb = instance.exports as unknown as HarfBuzz;
  hb._initialize?.();
  // The codec is one ES module with nothing to resolve, so the browser imports the file as it
  // is. Imported by name, Vite's dev server would find it only when the first export runs,
  // bundle it then, and reload the page in the middle of that export.
  const codec = (await import(/* @vite-ignore */ codecUrl)) as typeof Woff2;
  return { hb, codec };
}

let loading: Promise<Tools> | undefined;

/** The subsetter and the codec, fetched on first use. A failed load is tried again next time. */
function tools(): Promise<Tools> {
  loading ??= load();
  loading.catch(() => (loading = undefined));
  return loading;
}

const signature = (bytes: Uint8Array): number =>
  bytes.byteLength < 4 ? 0 : new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);

/** The bare font inside a file, which is what the subsetter reads. */
async function decode(codec: typeof Woff2, bytes: Uint8Array): Promise<Uint8Array | undefined> {
  const type = signature(bytes);
  if (SFNT.has(type)) return bytes;
  if (type !== WOFF2) return undefined;
  try {
    return await codec.decompress(bytes);
  } catch {
    return undefined;
  }
}

/** Whether a font has a weight axis: a variable font whose weight can be pinned. */
function hasWeightAxis(sfnt: Uint8Array): boolean {
  try {
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    const tables = view.getUint16(4);
    for (let i = 0; i < tables; i++) {
      const record = 12 + i * 16;
      if (view.getUint32(record) !== FVAR) continue;
      const table = view.getUint32(record + 8);
      const axes = table + view.getUint16(table + 4);
      const count = view.getUint16(table + 8);
      const size = view.getUint16(table + 10);
      // An axis record starts with its tag.
      for (let axis = 0; axis < count; axis++) {
        if (view.getUint32(axes + axis * size) === WEIGHT_AXIS) return true;
      }
    }
  } catch {
    // A table that points outside the file: not a font to pin.
  }
  return false;
}

/**
 * One font through the subsetter, with its weight axis pinned to `weight` when one is given.
 * Undefined when HarfBuzz gives up on the font.
 */
function subset(
  hb: HarfBuzz,
  sfnt: Uint8Array,
  codePoints: Iterable<number>,
  features: boolean,
  weight: number | undefined,
): Uint8Array | undefined {
  const data = hb.malloc(sfnt.byteLength);
  // The memory may have grown since the last call: always a fresh view of it.
  new Uint8Array(hb.memory.buffer).set(sfnt, data);
  const blob = hb.hb_blob_create(data, sfnt.byteLength, WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  let result: Uint8Array | undefined;
  const input = hb.hb_subset_input_create_or_fail();
  if (input) {
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const codePoint of codePoints) hb.hb_set_add(unicodes, codePoint);
    if (features) {
      // An empty set turned inside out is every feature.
      const kept = hb.hb_subset_input_set(input, LAYOUT_FEATURES);
      hb.hb_set_clear(kept);
      hb.hb_set_invert(kept);
    }
    if (weight !== undefined) {
      hb.hb_subset_input_pin_axis_location(input, face, WEIGHT_AXIS, weight);
    }
    const subsetFace = hb.hb_subset_or_fail(face, input);
    hb.hb_subset_input_destroy(input);
    if (subsetFace) {
      const out = hb.hb_face_reference_blob(subsetFace);
      const lengthAt = hb.malloc(4);
      const at = hb.hb_blob_get_data(out, lengthAt);
      const length = new Uint32Array(hb.memory.buffer, lengthAt, 1)[0] ?? 0;
      if (at && length) result = new Uint8Array(hb.memory.buffer, at, length).slice();
      hb.free(lengthAt);
      hb.hb_blob_destroy(out);
      hb.hb_face_destroy(subsetFace);
    }
  }
  hb.hb_face_destroy(face);
  hb.free(data);
  return result;
}

/**
 * The fonts cut down to their characters, as WOFF2, in the order of the requests: for each, the
 * fonts it became. A font that cannot be cut (not a format read here, or one the subsetter gives
 * up on) is undefined. Throws when the subsetter itself cannot be loaded.
 *
 * A variable font does not go into the file as one. It becomes a static font for each weight it
 * is drawn at, each with the characters of that weight. Not every engine draws the weights of a
 * variable font: Playwright's WebKit for Windows lays text out at the weight asked for and draws
 * the default one, and it does so with the whole font as fontsource ships it. Every engine draws
 * a static font. It is smaller as well: the fonts of the reference deck are 167 kB this way, and
 * 193 kB with the weight axes left whole.
 *
 * The price is exactness in the editor's own engine. At the default of its weight axis a font
 * is drawn exactly as before. At any other weight the subsetter rounds to whole font units what
 * a browser interpolates in fractions, in the outlines and in the kerning. Measured in Edge on
 * the reference deck: at most 0.02% of the pixels of a slide differ visibly, and a paragraph is
 * at most 0.11 px wider or narrower. Limiting the axis to the range in use rounds in the same
 * way and leaves a variable font, so it would gain nothing.
 */
export async function subsetFonts(
  requests: readonly SubsetRequest[],
): Promise<(SubsetFont[] | undefined)[]> {
  const { hb, codec } = await tools();
  // Two faces may share a file: the Hebrew-only face of a family is its Hebrew subset again.
  const decoding = new Map<Uint8Array, Promise<Uint8Array | undefined>>();
  const fonts = await Promise.all(
    requests.map((request) => {
      let font = decoding.get(request.bytes);
      if (!font) decoding.set(request.bytes, (font = decode(codec, request.bytes)));
      return font;
    }),
  );

  const groups = new Map<string, number[]>();
  requests.forEach((request, i) => {
    const members = groups.get(request.group);
    if (members) members.push(i);
    else groups.set(request.group, [i]);
  });

  /** One face: as static fonts, a weight each, or as the one font it was. */
  const cut = async (i: number, instances: boolean): Promise<SubsetFont[] | undefined> => {
    const font = fonts[i];
    const request = requests[i];
    if (!font || !request) return undefined;
    const weights = Array.from(request.byWeight.keys()).sort((a, b) => a - b);
    const drawnAt = (weight: number) => Array.from(request.byWeight.get(weight) ?? []);
    const parts = instances
      ? weights.map((weight) => ({ weight, codePoints: drawnAt(weight) }))
      : [{ weight: undefined, codePoints: weights.flatMap(drawnAt) }];
    try {
      return await Promise.all(
        parts.map(async ({ weight, codePoints }): Promise<SubsetFont> => {
          const bytes = subset(hb, font, codePoints, request.features, weight);
          if (!bytes) throw new Error('the font could not be cut down');
          return { bytes: new Uint8Array(await codec.compress(bytes)), weight };
        }),
      );
    } catch {
      return undefined;
    }
  };

  const results: (SubsetFont[] | undefined)[] = requests.map(() => undefined);
  // All the groups at once: the codec answers every call on a timer, and a window in the
  // background gets one timer a second. This way they all fall on the same one.
  await Promise.all(
    Array.from(groups.values(), async (members) => {
      const instances = members.every((i) => {
        const font = fonts[i];
        return font !== undefined && requests[i]?.instances === true && hasWeightAxis(font);
      });
      let done = await Promise.all(members.map((i) => cut(i, instances)));
      // A face that went wrong goes in whole, a variable font; then the others stay variable.
      if (instances && done.some((font) => !font)) {
        done = await Promise.all(members.map((i) => cut(i, false)));
      }
      members.forEach((i, n) => (results[i] = done[n]));
    }),
  );
  return results;
}
