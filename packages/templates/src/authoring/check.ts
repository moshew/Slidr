/**
 * The structural checks the app's unit tests make of a built-in template, for one authored here:
 * `node tools/run-ts.mjs src/authoring/check.ts <id>` (from packages/templates). Prints what is
 * wrong, or "ok".
 */
import { Archetype, type Color, type Theme } from '@slidr/model';
import { contractGaps } from '../builtin/contract';
import { sampleSlides } from '../builtin/kit';
import { Template } from '../template';
import type { Authored } from './registry';

const DRAWN = Archetype.options.filter((a) => a !== 'blank' && a !== 'title');

type Rgb = [number, number, number];
const hexRgb = (css: string): Rgb => {
  const d = /^#([0-9a-f]{6})$/i.exec(css.trim())?.[1];
  if (!d) throw new Error(`"${css}" is not #rrggbb`);
  return [0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16)) as Rgb;
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((v, i) => Math.round(v * (1 - t) + b[i]! * t)) as Rgb;
const lum = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [l, d] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l + 0.05) / (d + 0.05);
};
const colorOf = (theme: Theme, c: Color, over: Rgb): Rgb => {
  const base = hexRgb('token' in c ? theme.colors[c.token] : c.value);
  return c.alpha === undefined ? base : mix(over, base, c.alpha);
};

export default async function check(id: string) {
  // The module alone, so another template being drawn in this folder cannot break the check.
  const module = (await import(/* @vite-ignore */ `./${id}.ts`)) as {
    entry?: Authored;
  };
  const entry = module.entry;
  if (!entry) throw new Error(`no authored template "${id}"`);
  const template = entry.template();
  const problems: string[] = [];
  const parsed = Template.safeParse(template);
  if (!parsed.success)
    problems.push(
      ...parsed.error.issues.slice(0, 5).map((i) => `schema: ${i.path.join('.')}: ${i.message}`),
    );
  if (template.theme.id !== id) problems.push(`theme id ${template.theme.id} is not ${id}`);
  const order = template.layouts.map((l) => l.archetype);
  if (order.join() !== DRAWN.join())
    problems.push(`layouts must be, in order: ${DRAWN.join(', ')}; are ${order.join(', ')}`);
  for (const l of template.layouts)
    if (!l.id.startsWith(`l_${id}_`)) problems.push(`layout id ${l.id}`);
  problems.push(...template.layouts.flatMap(contractGaps));
  const all = template.layouts.flatMap((l) => l.decorations.map((d) => d.id));
  const dup = all.filter((d, i) => all.indexOf(d) !== i);
  if (dup.length)
    problems.push(`decoration ids used twice in the template: ${[...new Set(dup)].join(', ')}`);
  for (const l of template.flipped ?? []) {
    const ids = l.decorations.map((d) => d.id);
    const twice = ids.filter((d, i) => ids.indexOf(d) !== i);
    if (twice.length) problems.push(`${l.id} (flipped): ids twice: ${twice.join(', ')}`);
  }
  for (const l of [...template.layouts, ...(template.flipped ?? [])]) {
    if (!l.placeholders.some((p) => p.role === 'footer')) continue;
    const roles = l.decorations.map((d) => d.role);
    if (!roles.includes('slideNumber'))
      problems.push(`${l.id}: seats a footer but draws no slide number`);
    if (!roles.includes('logo')) problems.push(`${l.id}: seats a footer but draws no logo`);
  }
  for (const lang of ['he', 'en'] as const) {
    const shown = new Set(entry.samples[lang].map((s) => s.layout));
    const missing = template.layouts.filter((l) => !shown.has(l.id)).map((l) => l.id);
    if (missing.length) problems.push(`${lang} sample does not show ${missing.join(', ')}`);
    try {
      sampleSlides(template, entry.samples[lang], { dir: lang === 'he' ? 'rtl' : 'ltr', lang });
    } catch (error) {
      problems.push(`${lang} sample: ${(error as Error).message}`);
    }
  }
  const theme = template.theme;
  for (const [index, bg] of [theme.background, ...theme.backgroundVariants].entries()) {
    if (bg.fill.kind !== 'solid') continue;
    const ground = colorOf(theme, bg.fill.color, [255, 255, 255]);
    if (bg.overlay && bg.overlay.kind === 'radial') {
      for (const stop of bg.overlay.stops) {
        const g = colorOf(theme, stop.color, ground);
        for (const [ref, style] of Object.entries(theme.textStyles)) {
          const got = contrast(colorOf(theme, style.color, g), g);
          const need = style.size > 48 ? 3 : 4.5;
          if (got < need)
            problems.push(`background ${index}: ${ref} at ${got.toFixed(2)}:1 under its overlay`);
        }
      }
    }
    for (const [ref, style] of Object.entries(theme.textStyles)) {
      const got = contrast(colorOf(theme, style.color, ground), ground);
      const need = style.size > 48 ? 3 : 4.5;
      if (got < need)
        problems.push(`background ${index}: ${ref} at ${got.toFixed(2)}:1, needs ${need}:1`);
    }
  }
  console.log(problems.length ? problems.map((p) => `- ${p}`).join('\n') : `${id}: ok`);
}
