import type { CSSProperties } from 'react';

/** `clip-path` -> `clipPath`, `-webkit-text-stroke` -> `WebkitTextStroke`; custom properties stay. */
export function cssPropertyName(name: string): string {
  if (name.startsWith('--')) return name;
  // React spells the Microsoft prefix in lower case: msTransform, not MsTransform.
  const bare = name.startsWith('-ms-') ? name.slice(1) : name;
  return bare.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The `css` field of an element as a React style (SPEC 5.9, RND-07). `!important` is dropped:
 * an inline style cannot carry it, and it already wins over every stylesheet rule without it.
 */
export function passthroughStyle(css: Record<string, string> | undefined): CSSProperties {
  if (!css) return {};
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(css)) {
    style[cssPropertyName(name.trim())] = value.replace(/\s*!important\s*$/i, '');
  }
  return style;
}

/** At-rules that mean the same wherever they are written, so they stay outside the scope. */
const GLOBAL_AT_RULES = new Set([
  'charset',
  'import',
  'namespace',
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'keyframes',
  '-webkit-keyframes',
  'property',
  'counter-style',
]);

/**
 * Splits a stylesheet into its top-level statements: rules, and at-rules with or without a block.
 * Strings, comments and parentheses are respected, so `url(data:...;...)` or a `}` inside a string
 * does not end a statement.
 */
export function splitStatements(css: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let depth = 0;
  let parens = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < css.length && css[i] !== c) i += css[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '(') parens++;
    else if (c === ')') parens = Math.max(0, parens - 1);
    else if (parens === 0) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
          statements.push(css.slice(start, i + 1));
          start = i + 1;
        }
      } else if (c === ';' && depth === 0) {
        statements.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
    i++;
  }
  const rest = css.slice(start);
  if (rest.trim()) statements.push(rest);
  return statements.map((s) => s.trim()).filter(Boolean);
}

function atRuleName(statement: string): string | undefined {
  const withoutComments = statement.replace(/\/\*[\s\S]*?\*\//g, '').trimStart();
  return /^@([-\w]+)/.exec(withoutComments)?.[1]?.toLowerCase();
}

/**
 * The `css` of a slide, scoped to that slide (RND-07): rules apply only inside the slide's root,
 * so two slides on one page (the Stage and the Filmstrip) do not restyle each other. `@keyframes`,
 * `@font-face` and the other definitions are global by nature and are left as they are; two slides
 * that define the same keyframes name differently still collide.
 */
export function scopeSlideCss(css: string, rootSelector: string): string {
  const global: string[] = [];
  const local: string[] = [];
  for (const statement of splitStatements(css)) {
    const name = atRuleName(statement);
    (name && GLOBAL_AT_RULES.has(name) ? global : local).push(statement);
  }
  const parts = [...global];
  if (local.length) parts.push(`@scope (${rootSelector}) {\n${local.join('\n')}\n}`);
  return parts.join('\n');
}

/** A CSS string literal. */
export function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`;
}

/** `url("...")` for a URL that may contain quotes or spaces. */
export function cssUrl(url: string): string {
  return `url(${cssString(url)})`;
}

/** Rounds away floating-point noise, so styles and snapshots stay stable. */
export function num(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
