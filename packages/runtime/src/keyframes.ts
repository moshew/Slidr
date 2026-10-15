/**
 * The slide's own `@keyframes`, played by a step whose preset is `css:<name>` (see `names.ts`).
 * The renderer writes a slide's `css` into a `<style>` inside the slide's root, and the rules
 * that name something (a `@keyframes` among them) go into a cascade layer there; the exported
 * file draws the same markup. So the rule is looked for in the slide's own stylesheets first, and
 * then in the rest of the document, the way CSS itself would find it.
 */

/** The interface name of a `@keyframes` rule, the same in every engine. */
const KEYFRAMES_RULE = 'CSSKeyframesRule';

/** The rules of a sheet, and of the blocks inside it (`@layer`, `@media`, `@supports`). */
function* rulesOf(rules: CSSRuleList | undefined): Generator<CSSRule> {
  if (!rules) return;
  for (const rule of Array.from(rules)) {
    yield rule;
    if (rule.constructor.name !== KEYFRAMES_RULE && 'cssRules' in rule) {
      yield* rulesOf((rule as CSSGroupingRule).cssRules);
    }
  }
}

function readable(sheet: CSSStyleSheet | null | undefined): CSSRuleList | undefined {
  try {
    return sheet?.cssRules;
  } catch {
    // A sheet of another origin cannot be read.
    return undefined;
  }
}

/** The last `@keyframes <name>` in the sheets, as CSS takes the last of a name. */
function lastNamed(sheets: Iterable<CSSStyleSheet | null>, name: string): CSSKeyframesRule | null {
  let found: CSSKeyframesRule | null = null;
  for (const sheet of sheets) {
    for (const rule of rulesOf(readable(sheet))) {
      if (rule.constructor.name === KEYFRAMES_RULE && (rule as CSSKeyframesRule).name === name) {
        found = rule as CSSKeyframesRule;
      }
    }
  }
  return found;
}

/** `opacity` -> `opacity`, `clip-path` -> `clipPath`, `float` -> `cssFloat`; custom properties stay. */
function keyOf(property: string): string {
  if (property.startsWith('--')) return property;
  if (property === 'float') return 'cssFloat';
  return property
    .replace(/^-webkit-/, 'webkit-')
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** The offsets a keyframe selector names: `from`, `to`, `40%`, or several of them. */
function offsetsOf(selector: string): number[] {
  const offsets: number[] = [];
  for (const part of selector.split(',')) {
    const text = part.trim().toLowerCase();
    if (text === 'from') offsets.push(0);
    else if (text === 'to') offsets.push(1);
    else if (/^-?\d*\.?\d+%$/.test(text)) {
      const value = Number.parseFloat(text) / 100;
      if (value >= 0 && value <= 1) offsets.push(value);
    }
  }
  return offsets;
}

/** A `@keyframes` rule as Web Animations keyframes, in offset order. */
export function keyframesOfRule(rule: CSSKeyframesRule): Keyframe[] {
  const frames: Keyframe[] = [];
  for (const frame of Array.from(rule.cssRules) as CSSKeyframeRule[]) {
    const props: Record<string, string> = {};
    let easing: string | undefined;
    const { style } = frame;
    for (let i = 0; i < style.length; i++) {
      const property = style.item(i);
      const value = style.getPropertyValue(property).trim();
      if (!value) continue;
      // Inside a keyframe, the timing function eases to the next one; no other animation
      // property means anything there.
      if (property === 'animation-timing-function') easing = value;
      else if (!property.startsWith('animation')) props[keyOf(property)] = value;
    }
    for (const offset of offsetsOf(frame.keyText)) {
      frames.push({ offset, ...props, ...(easing ? { easing } : {}) });
    }
  }
  return frames.sort((a, b) => (a.offset as number) - (b.offset as number));
}

/**
 * The keyframes of `@keyframes <name>` as the slide draws it: its own stylesheets first, then
 * the document's. Undefined when no such rule is there.
 */
export function slideKeyframes(root: HTMLElement, name: string): Keyframe[] | undefined {
  const own = Array.from(root.querySelectorAll('style'), (style) => style.sheet);
  const around = root.getRootNode() as Document | ShadowRoot;
  const rule =
    lastNamed(own, name) ??
    lastNamed(
      [
        ...Array.from(around.styleSheets ?? []),
        ...((around as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
      ],
      name,
    );
  if (!rule) return undefined;
  const frames = keyframesOfRule(rule);
  return frames.length > 0 ? frames : undefined;
}

/** What a part looks like by itself, which keyframes of a slide's own compose with. */
export interface OwnLook {
  opacity: number;
  /** `none` when it has none. */
  transform: string;
  /** Empty when it has none. */
  filter: string;
}

/**
 * Keyframes of the slide's own on an element that has a look of its own. An element keeps its
 * opacity, its rotation and its shadow while it moves: the keyframes' opacity is a share of its
 * own, their transform moves it on the slide's axes before its own turns it, and their filter
 * comes on top of its shadow.
 */
export function onOwnLook(frames: readonly Keyframe[], own: OwnLook): Keyframe[] {
  return frames.map((frame) => {
    const out: Keyframe = { ...frame };
    if (frame.opacity !== undefined && own.opacity !== 1) {
      const share = Number(frame.opacity);
      if (Number.isFinite(share)) out.opacity = Math.round(share * own.opacity * 1000) / 1000;
    }
    if (typeof frame.transform === 'string' && own.transform !== 'none') {
      out.transform =
        `${frame.transform === 'none' ? '' : frame.transform} ${own.transform}`.trim();
    }
    if (typeof frame.filter === 'string' && own.filter) {
      out.filter = `${own.filter} ${frame.filter === 'none' ? '' : frame.filter}`.trim();
    }
    return out;
  });
}
