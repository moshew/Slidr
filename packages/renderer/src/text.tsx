import type {
  Direction,
  Insets,
  ListInfo,
  Marks,
  Paragraph,
  RichText,
  Run,
  TextElement,
  TextStyleRef,
  Theme,
} from '@slidr/model';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useRenderContext } from './context';
import { colorCss, runFontStack } from './theme';

/**
 * Rich text (SPEC 5.4) as real text: paragraphs are `<p>`, consecutive list paragraphs are
 * `<ul>` / `<ol>` with `<li>` items (EXP-03). Everything is styled inline, so the result is the
 * same with or without a page stylesheet around it (RND-01).
 *
 * Conventions this file fixes for the model:
 * - A paragraph without `styleRef` uses the `body` style.
 * - `letterSpacing` (marks and text styles) is in slide pixels.
 * - A `\n` inside a run is a line break within the paragraph.
 * - `indent` is the first-line indent of a paragraph that is not a list item, in slide pixels.
 * - A sup/sub run is drawn at 65% of its size.
 */

const BULLETS = ['•', '◦', '▪'];
/** Width of the marker column, in em of the paragraph's text. */
export const MARKER_EM = 1.25;
/** Extra indent per list level, in em. */
export const LEVEL_EM = 1.5;

function alpha(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26))
    s = String.fromCharCode(97 + ((v - 1) % 26)) + s;
  return s;
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let s = '';
  let v = n;
  for (const [value, letters] of table) {
    while (v >= value) {
      s += letters;
      v -= value;
    }
  }
  return s;
}

function numberLabel(n: number, level: number): string {
  const kind = level % 3;
  return `${kind === 0 ? n : kind === 1 ? alpha(n) : roman(n)}.`;
}

/** The marker text of every list paragraph: numbering restarts after any non-list paragraph. */
export function listMarkers(paragraphs: readonly Paragraph[]): (string | undefined)[] {
  const counters: number[] = [];
  return paragraphs.map((p) => {
    const list = p.list;
    if (!list) {
      counters.length = 0;
      return undefined;
    }
    counters.length = list.level + 1;
    if (list.kind === 'bullet') {
      counters[list.level] = 0;
      return list.glyph ?? BULLETS[list.level % BULLETS.length];
    }
    const n = (counters[list.level] ?? 0) + 1;
    counters[list.level] = n;
    return list.glyph ?? numberLabel(n, list.level);
  });
}

export interface TextDefaults {
  styleRef: TextStyleRef;
  /** False keeps every paragraph on one line (`TextElement.wrap`). */
  wrap: boolean;
  /** Overrides the text style's colour and weight, e.g. in a table's header row. Marks still win. */
  color?: string;
  weight?: number;
}

/** The style of a paragraph. The text editor (WG4) uses it too, so text does not move on entering it. */
export function paragraphStyle(p: Paragraph, theme: Theme, defaults: TextDefaults): CSSProperties {
  const ts = theme.textStyles[p.styleRef ?? defaults.styleRef];
  return {
    margin: 0,
    padding: 0,
    fontFamily: `var(--font-${ts.font})`,
    fontSize: ts.size,
    fontWeight: defaults.weight ?? ts.weight,
    fontStyle: 'normal',
    lineHeight: p.lineHeight ?? ts.lineHeight,
    letterSpacing: ts.letterSpacing ?? 'normal',
    color: defaults.color ?? colorCss(ts.color),
    textTransform: ts.case === 'upper' ? 'uppercase' : ts.case === 'lower' ? 'lowercase' : 'none',
    textAlign: p.align,
    textIndent: !p.list && p.indent ? p.indent : 0,
    paddingBlockStart: p.spaceBefore || undefined,
    paddingBlockEnd: p.spaceAfter || undefined,
    whiteSpace: defaults.wrap ? 'pre-wrap' : 'pre',
    overflowWrap: defaults.wrap ? 'break-word' : 'normal',
  };
}

/** The style of a run's marks, over its paragraph's style. Shared with the text editor. */
export function runStyle(
  marks: Marks | undefined,
  role: 'heading' | 'body',
): CSSProperties | undefined {
  if (!marks) return undefined;
  const style: CSSProperties = {};
  if (marks.font) style.fontFamily = runFontStack(marks.font, role);
  if (marks.size !== undefined) style.fontSize = marks.script ? marks.size * 0.65 : marks.size;
  else if (marks.script) style.fontSize = '0.65em';
  if (marks.script) style.verticalAlign = marks.script === 'sup' ? 'super' : 'sub';
  if (marks.weight !== undefined) style.fontWeight = marks.weight;
  if (marks.italic) style.fontStyle = 'italic';
  const lines = [marks.underline && 'underline', marks.strike && 'line-through'].filter(Boolean);
  if (lines.length) style.textDecorationLine = lines.join(' ');
  if (marks.color) style.color = colorCss(marks.color);
  if (marks.highlight) {
    style.backgroundColor = colorCss(marks.highlight);
    style.boxDecorationBreak = 'clone';
    style.WebkitBoxDecorationBreak = 'clone';
  }
  if (marks.letterSpacing !== undefined) style.letterSpacing = marks.letterSpacing;
  if (marks.case) style.textTransform = marks.case === 'upper' ? 'uppercase' : 'lowercase';
  return style;
}

/** Letters of the scripts written right to left. */
const RTL_LETTER =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const LETTER = /\p{L}/u;
// The invisible direction marks, by code point so that they can be seen in the source.
const RLM = String.fromCodePoint(0x200f);
const ALM = String.fromCodePoint(0x061c);
const LRM = String.fromCodePoint(0x200e);

/**
 * The direction of the first strong character, as `dir="auto"` finds it: letters are strong,
 * digits, punctuation, spaces and emoji are not. Undefined when the text has no strong character.
 */
export function firstStrong(text: string): Direction | undefined {
  for (const char of text) {
    if (char === RLM || char === ALM) return 'rtl';
    if (char === LRM) return 'ltr';
    if (LETTER.test(char)) return RTL_LETTER.test(char) ? 'rtl' : 'ltr';
  }
  return undefined;
}

/**
 * The direction a paragraph is laid out in. `auto` follows the first strong character of its own
 * text. Text without one (a figure, "87%", an empty line) has nothing to go by and takes
 * `fallback`, the direction of the deck: in a Hebrew deck a lone number sits on the right, and a
 * list keeps its bullets on one side.
 *
 * The renderer writes the result as an explicit `dir`, never `dir="auto"`: the browser's own
 * `auto` falls back to left-to-right, and it counts a list marker ("a.") as part of the text.
 * The text editor uses this function too, so text does not turn when editing starts.
 */
export function paragraphDirection(
  dir: Paragraph['dir'],
  text: string,
  fallback: Direction,
): Direction {
  if (dir !== 'auto') return dir;
  return firstStrong(text) ?? fallback;
}

/**
 * A `dir: auto` paragraph of figures only ("+4%", "12.10.2026") in a right-to-left deck. It sits
 * on the deck's side, like the text around it, but it reads left to right, as every number does:
 * laid out right to left, "+4%" would be drawn "4%+". Each of its runs is drawn as a left-to-right
 * island (`dir="ltr"`); the text editor does the same, run by run.
 */
export function readsAsNumber(dir: Paragraph['dir'], text: string, fallback: Direction): boolean {
  return dir === 'auto' && fallback === 'rtl' && text !== '' && firstStrong(text) === undefined;
}

const paragraphText = (p: Paragraph) => p.runs.map((r) => r.text).join('');

const LINK_STYLE: CSSProperties = { color: 'inherit', textDecoration: 'inherit' };

function RunView({ run, role, ltr }: { run: Run; role: 'heading' | 'body'; ltr: boolean }) {
  const style = runStyle(run.marks, role);
  const dir = ltr ? 'ltr' : undefined;
  const link = run.marks?.link;
  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        dir={dir}
        style={{ ...LINK_STYLE, ...style }}
      >
        {run.text}
      </a>
    );
  }
  return style || ltr ? (
    <span dir={dir} style={style}>
      {run.text}
    </span>
  ) : (
    <>{run.text}</>
  );
}

function Marker({ text, list, firstRun }: { text: string; list: ListInfo; firstRun?: Run }) {
  const size = firstRun?.marks?.size;
  const color = list.color ?? firstRun?.marks?.color;
  return (
    <span
      aria-hidden
      data-slidr-marker
      style={{
        display: 'inline-block',
        width: `${MARKER_EM}em`,
        marginInlineStart: `-${MARKER_EM}em`,
        textIndent: 0,
        textAlign: 'start',
        textDecorationLine: 'none',
        ...(size !== undefined ? { fontSize: size } : {}),
        ...(color ? { color: colorCss(color) } : {}),
      }}
    >
      {text}
    </span>
  );
}

function paragraphContent(p: Paragraph, role: 'heading' | 'body', ltr: boolean): ReactNode {
  const empty = p.runs.every((r) => r.text === '');
  if (empty) {
    // An empty line still has the height of its text: a line break, in the first run's marks.
    const style = runStyle(p.runs[0]?.marks, role);
    return style ? (
      <span style={style}>
        <br />
      </span>
    ) : (
      <br />
    );
  }
  return p.runs.map((run, i) => <RunView key={i} run={run} role={role} ltr={ltr} />);
}

/** The paragraphs of a rich text, without a box around them. */
export function RichTextView({
  content,
  theme,
  defaults,
  dir,
}: {
  content: RichText;
  theme: Theme;
  defaults: TextDefaults;
  /** The direction of a `dir: auto` paragraph without letters: the deck's, or the table's. */
  dir: Direction;
}) {
  const markers = listMarkers(content.paragraphs);
  const direction = (p: Paragraph) => paragraphDirection(p.dir, paragraphText(p), dir);
  const number = (p: Paragraph) => readsAsNumber(p.dir, paragraphText(p), dir);
  const out: ReactNode[] = [];
  let i = 0;
  while (i < content.paragraphs.length) {
    const first = content.paragraphs[i] as Paragraph;
    if (!first.list) {
      const role = theme.textStyles[first.styleRef ?? defaults.styleRef].font;
      out.push(
        <p key={i} dir={direction(first)} style={paragraphStyle(first, theme, defaults)}>
          {paragraphContent(first, role, number(first))}
        </p>,
      );
      i++;
      continue;
    }
    // A run of list paragraphs is one list element, of the kind of its first item.
    const start = i;
    const items: ReactNode[] = [];
    while (i < content.paragraphs.length && content.paragraphs[i]?.list) {
      const p = content.paragraphs[i] as Paragraph & { list: ListInfo };
      const role = theme.textStyles[p.styleRef ?? defaults.styleRef].font;
      items.push(
        <li
          key={i}
          dir={direction(p)}
          style={{
            ...paragraphStyle(p, theme, defaults),
            display: 'block',
            listStyle: 'none',
            paddingInlineStart: `${p.list.level * LEVEL_EM + MARKER_EM}em`,
          }}
        >
          <Marker text={markers[i] ?? ''} list={p.list} firstRun={p.runs[0]} />
          {paragraphContent(p, role, number(p))}
        </li>,
      );
      i++;
    }
    const Tag = first.list.kind === 'number' ? 'ol' : 'ul';
    out.push(
      <Tag key={`list-${start}`} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items}
      </Tag>,
    );
  }
  return <>{out}</>;
}

const V_ALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
/** Smallest scale `shrink` goes down to; below it the text overflows instead. */
const MIN_FIT = 0.25;

function insetsStyle(padding: Insets | undefined): CSSProperties {
  if (!padding) return { padding: 0 };
  return {
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingLeft: padding.left,
  };
}

/**
 * Fits the content into the box (TXT-07 "shrink") and returns the scale. Text and spacing shrink
 * together through CSS `zoom` on the content, so the text re-wraps at the smaller size exactly as
 * if every size had been scaled. Measured in layout pixels, which ancestor transforms (the Stage
 * zoom) do not affect. The zoom is set on the DOM directly and is not part of the React style, so
 * a re-render does not undo it; an export that serialises the DOM keeps it.
 */
export function shrinkToFit(box: HTMLElement, measure: HTMLElement, content: HTMLElement): number {
  const cs = getComputedStyle(box);
  const available =
    box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  let result = 1;
  // No layout (a detached or hidden box) measures zero: leave the text as it is.
  if (available > 0) {
    const fits = (z: number) => {
      content.style.zoom = z === 1 ? '' : String(z);
      return measure.offsetHeight <= available + 0.5;
    };
    if (!fits(1)) {
      let lo = MIN_FIT;
      let hi = 1;
      if (fits(lo)) {
        for (let step = 0; step < 8; step++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
      }
      result = Math.floor(lo * 1000) / 1000;
    }
  }
  content.style.zoom = result === 1 ? '' : String(result);
  return result;
}

/** Counts finished web-font loads, so text measured before its font arrived is measured again. */
function useFontLoads(enabled: boolean): number {
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || !document.fonts) return;
    const bump = () => setLoads((n) => n + 1);
    document.fonts.addEventListener('loadingdone', bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, [enabled]);
  return loads;
}

/** The box of a text element or of the text inside a shape: padding, vertical alignment, fitting. */
export function TextBox({
  content,
  vAlign,
  padding,
  autoFit,
  columns,
  wrap,
  styleRef = 'body',
  children,
}: {
  content: RichText;
  vAlign: TextElement['vAlign'];
  padding?: Insets;
  autoFit: TextElement['autoFit'];
  columns?: number;
  wrap?: boolean;
  styleRef?: TextStyleRef;
  /** Shown instead of the text (a `TextSlot`); the box around it stays the same. */
  children?: ReactNode;
}) {
  const ctx = useRenderContext();
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const shrink = autoFit === 'shrink';
  const fontLoads = useFontLoads(shrink);
  useLayoutEffect(() => {
    if (!box.current || !measure.current || !inner.current) return;
    if (shrink) shrinkToFit(box.current, measure.current, inner.current);
    else inner.current.style.zoom = '';
  }, [shrink, fontLoads, content, padding, columns, wrap, ctx.theme]);
  const grow = autoFit === 'growHeight';
  return (
    <div
      ref={box}
      data-slidr-text
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: V_ALIGN[vAlign],
        boxSizing: 'border-box',
        width: '100%',
        height: grow ? 'auto' : '100%',
        ...insetsStyle(padding),
      }}
    >
      <div ref={measure} style={{ flex: 'none' }}>
        <div
          ref={inner}
          style={columns && columns > 1 ? { columnCount: columns, columnGap: 48 } : undefined}
        >
          {children ?? (
            <RichTextView
              content={content}
              theme={ctx.theme}
              defaults={{ styleRef, wrap: wrap ?? true }}
              dir={ctx.dir}
            />
          )}
        </div>
      </div>
    </div>
  );
}
