/**
 * The structural checks the app's unit tests make of a built-in template, for one authored here:
 * `node tools/run-ts.mjs src/authoring/check.ts <id>` (from packages/templates). Prints what is
 * wrong, or "ok", and the grounds the layouts keep, to look at.
 */
import {
  Archetype,
  languageDir,
  languagesOf,
  rotatedBounds,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Color,
  type Element,
  type Layout,
  type Theme,
} from '@slidr/model';
import { contractGaps } from '../builtin/contract';
import { framesTheSlide, lockedDrawings, sampleSlides } from '../builtin/kit';
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

/** Whether a decoration covers the slide, and so stays its ground (`framesTheSlide`). */
function coversTheSlide(d: Element): boolean {
  const box = rotatedBounds(d.frame, d.rotation);
  const x = Math.max(0, Math.min(box.x + box.w, SLIDE_WIDTH) - Math.max(box.x, 0));
  const y = Math.max(0, Math.min(box.y + box.h, SLIDE_HEIGHT) - Math.max(box.y, 0));
  return x * y >= 0.9 * SLIDE_WIDTH * SLIDE_HEIGHT;
}

/**
 * The text slide (ADR-094): the body from margin to margin, about 1600px wide, set from the top
 * of its card or panel, which runs down to over the foot; the title across the slide, or beside
 * no more than a small accent. Its sample, in every language, is a lead and four points that
 * each open with a few words in bold. Whether the lead takes two lines and a point one, only
 * the renders show.
 */
export function textSlideGaps(template: Template, samples: Authored['samples']): string[] {
  const layout = template.layouts.find((l) => l.archetype === 'text');
  if (!layout) return [];
  const problems: string[] = [];
  const body = layout.placeholders.find((p) => p.role === 'body');
  const title = layout.placeholders.find((p) => p.role === 'title');
  if (!body) return [`${layout.id}: no body`];
  if (body.frame.w < 1500)
    problems.push(
      `${layout.id}: the body is ${body.frame.w}px wide; on the text slide it runs from margin to margin, about 1600px`,
    );
  if (body.vAlign && body.vAlign !== 'top')
    problems.push(`${layout.id}: the body is set to the ${body.vAlign}; it starts at the top`);
  if (body.frame.y + body.frame.h < 800)
    problems.push(
      `${layout.id}: the body ends at ${body.frame.y + body.frame.h}; it runs down to over the foot`,
    );
  if (title && title.frame.w < 1300)
    problems.push(`${layout.id}: the title is ${title.frame.w}px wide; it runs across the slide`);
  for (const lang of languagesOf(samples)) {
    const slide = samples[lang]!.find((s) => s.layout === layout.id);
    const fill = slide?.content.body;
    const paragraphs = fill && !Array.isArray(fill) && 'paragraphs' in fill ? fill.paragraphs : [];
    const lead = paragraphs.filter((p) => !p.list);
    const listed = paragraphs.filter((p) => p.list);
    if (
      lead.length === 0 ||
      listed.length !== 4 ||
      !listed.every((p) => p.runs[0]?.marks?.weight === 700)
    )
      problems.push(
        `${lang} sample of ${layout.id}: a lead, then four points that each open with a few words in bold`,
      );
  }
  return problems;
}

/**
 * What a layout draws is the slide's own, to select, move, restyle and delete (ADR-094): only
 * what frames every slide stays the layout's (`framesTheSlide`), and what that stands on
 * (`lockedDrawings`). The grounds that stay, and what the foot stands on, are listed to look at.
 */
export function editability(template: Template): { problems: string[]; kept: string[] } {
  if (![...template.layouts, ...(template.flipped ?? [])].some((l) => l.objects?.length))
    return {
      problems: [
        'the layouts give their slides no objects, so only the text can be changed: pass the template through withObjects (ADR-094)',
      ],
      kept: [],
    };
  const problems: string[] = [];
  for (const [layouts, side] of [
    [template.layouts, ''],
    [template.flipped ?? [], ' (flipped)'],
  ] as const) {
    for (const [id, drawings] of lockedDrawings(layouts))
      problems.push(
        `${id}${side}: ${drawings.map((d) => d.id).join(', ')} stay the layout's only because what frames every slide is drawn over them and reaches into them: keep them clear of it`,
      );
  }
  const lockedHere = lockedDrawings(template.layouts);
  const kept = template.layouts.flatMap((l) => {
    const frames = framesTheSlide(l);
    const locked = new Set(lockedHere.get(l.id) ?? []);
    return l.decorations.flatMap((d) =>
      !frames(d) && !locked.has(d)
        ? [`${l.id}: ${d.id} (the foot stands on it)`]
        : frames(d) && !d.hidden && !d.role && coversTheSlide(d)
          ? [`${l.id}: ${d.id} (the ground)`]
          : [],
    );
  });
  return { problems, kept };
}

export default async function check(id: string) {
  // The module alone, so another template being drawn in this folder cannot break the check.
  // By its URL: on Windows the path Vite makes of `./<id>.ts` is not found.
  const module = (await import(/* @vite-ignore */ new URL(`./${id}.ts`, import.meta.url).href)) as {
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
  const drawn = (l: Layout) => [...l.decorations, ...(l.objects ?? [])].map((d) => d.id);
  const all = template.layouts.flatMap(drawn);
  const dup = all.filter((d, i) => all.indexOf(d) !== i);
  if (dup.length)
    problems.push(
      `ids of decorations and objects used twice in the template: ${[...new Set(dup)].join(', ')}`,
    );
  const editable = editability(template);
  problems.push(...editable.problems);
  problems.push(...textSlideGaps(template, entry.samples));
  for (const l of template.flipped ?? []) {
    const ids = drawn(l);
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
  for (const lang of languagesOf(entry.samples)) {
    const slides = entry.samples[lang]!;
    const shown = new Set(slides.map((s) => s.layout));
    const missing = template.layouts.filter((l) => !shown.has(l.id)).map((l) => l.id);
    if (missing.length) problems.push(`${lang} sample does not show ${missing.join(', ')}`);
    try {
      sampleSlides(template, slides, { dir: languageDir(lang), lang });
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
  // A drawing that covers the slide stays its ground, and a press on the slide never picks it:
  // right for a grid, a border or a field; a drawing of the whole board is cut into its parts.
  if (editable.kept.length)
    console.log(
      `drawn by the layouts and not the slide's, to look at (a ground is a grid, a border or a field, not a drawing to cut into parts):\n${editable.kept.map((k) => `  ${k}`).join('\n')}`,
    );
}
