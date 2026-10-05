import type { AssetMeta } from '@slidr/model';
// By file, and as a type only: this module is pure, and the index of the fonts loads their files.
import type { SystemFont } from '../fonts/systemFonts';

/*
 * The weights a font family really has (TXT-03): the weight list offers these and no others, and
 * shows text that asks for a weight the family lacks in the weight it is drawn in. Three kinds
 * of font, each known by its faces:
 * - a font the page registered (`@font-face`): the built-in library, a font the deck carries as
 *   an asset, a font the user added. The page's own `FontFaceSet` lists them all, whoever
 *   registered them;
 * - a font the deck carries, also before a slide has registered it: by the asset's own record;
 * - a font installed on the computer: by the weights the system reports for it.
 * Pure, so it is tested without a document; `useFontWeights.ts` reads the three for a component.
 */

/** The nine named weights. A family that is not known at all is offered every one of them. */
export const NAMED_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** A face of a family, as an `@font-face` rule or a `FontFace` object describes it. */
export interface FaceWeight {
  family: string;
  /** One weight (`400`, `bold`), or the range of a variable font (`100 900`). */
  weight: string;
}

/** The weights one face draws: a single weight, or from one to another for a variable face. */
type WeightRange = readonly [from: number, to: number];

/** The weights of a family. */
export interface FamilyWeights {
  /** What the weight list offers, ascending. */
  offered: number[];
  /** What each of its faces draws. */
  faces: WeightRange[];
}

/** CSS finds a family whatever the case of its name. */
const nameOf = (family: string) => family.trim().toLowerCase();

const KEYWORDS: Record<string, number> = { normal: 400, bold: 700 };

function weightRange(descriptor: string): WeightRange | undefined {
  const numbers = descriptor
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => KEYWORDS[word] ?? Number(word));
  const [first, second = first] = numbers;
  if (first === undefined || second === undefined) return undefined;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return undefined;
  return [Math.min(first, second), Math.max(first, second)];
}

/**
 * The weights the faces of one family give. A static face gives its one weight, whatever it is
 * (350 is a weight). A variable face draws every weight of its range: the list offers the named
 * ones inside it, and its ends when they are not named ones.
 */
export function familyWeights(faces: readonly WeightRange[]): FamilyWeights {
  const offered = new Set<number>();
  for (const [from, to] of faces) {
    offered.add(from).add(to);
    for (const named of NAMED_WEIGHTS) if (named > from && named < to) offered.add(named);
  }
  return { offered: [...offered].sort((a, b) => a - b), faces: [...faces] };
}

/**
 * The weight text is drawn in when it asks for one: the rule of CSS font matching. A weight a
 * face draws is itself. Otherwise, from 400 to 500 the browser looks up to 500 first, then
 * lighter, then heavier; below 400 it looks lighter and then heavier; above 500, heavier and
 * then lighter.
 */
export function drawnWeight({ faces }: FamilyWeights, asked: number): number {
  if (faces.length === 0 || faces.some(([from, to]) => asked >= from && asked <= to)) return asked;
  // No face reaches the weight: the nearest end of one, on the side the rule looks at first.
  const ends = faces.flat();
  const lighter = ends.filter((weight) => weight < asked).sort((a, b) => b - a);
  const heavier = ends.filter((weight) => weight > asked).sort((a, b) => a - b);
  if (asked >= 400 && asked <= 500) {
    const upTo500 = heavier.find((weight) => weight <= 500);
    return upTo500 ?? lighter[0] ?? heavier[0] ?? asked;
  }
  if (asked < 400) return lighter[0] ?? heavier[0] ?? asked;
  return heavier[0] ?? lighter[0] ?? asked;
}

export interface FontSources {
  /** The faces the page registered: `document.fonts`. */
  registered: Iterable<FaceWeight>;
  /** The assets of the deck: its fonts are among them. */
  assets: Readonly<Record<string, AssetMeta>>;
  /** The fonts installed on the computer. */
  installed: readonly SystemFont[];
}

/**
 * The weights of a family; null for a family nothing is known of, which is then offered every
 * weight. A face the page registered, or the deck carries, is what draws the family, whatever
 * is installed under the same name (as in the font list).
 */
export function fontWeights(family: string, sources: FontSources): FamilyWeights | null {
  const name = nameOf(family);
  const descriptors: string[] = [];
  for (const face of sources.registered) {
    // A `FontFace` object reports a name with a space in it between quotes.
    if (nameOf(face.family.replace(/^["']|["']$/g, '')) === name) descriptors.push(face.weight);
  }
  for (const asset of Object.values(sources.assets)) {
    if (asset.kind === 'font' && asset.font && nameOf(asset.font.family) === name)
      descriptors.push(asset.font.weight);
  }
  const faces = descriptors
    .map(weightRange)
    .filter((range): range is WeightRange => range !== undefined);
  if (faces.length > 0) return familyWeights(faces);
  const installed = sources.installed.find((font) => nameOf(font.family) === name)?.weights;
  if (!installed || installed.length === 0) return null;
  return familyWeights(installed.map((weight) => [weight, weight] as const));
}
