import type { Paragraph, TextStyleRef, Theme } from '@slidr/model';
import { LEVEL_EM, MARKER_EM, paragraphStyle, runStyle } from '@slidr/renderer';
import { Mark, Node, type AnyExtension } from '@tiptap/core';
import type { CSSProperties } from 'react';
import { safeLink } from './paste';
import { BOOLEAN_MARKS, MARK_TYPES, PARAGRAPH_ATTRS, type MarkType } from './richTextDoc';

/** Properties React writes without a unit; every other number is pixels. */
const UNITLESS = new Set([
  'fontWeight',
  'lineHeight',
  'opacity',
  'zoom',
  'zIndex',
  'flex',
  'order',
]);

/** A React style object as a `style` attribute. */
export function cssText(style: CSSProperties | undefined): string {
  if (!style) return '';
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const name = k.startsWith('--')
        ? k
        : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^(webkit|moz|ms)-/, '-$1-');
      const value = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v);
      return `${name}: ${value}`;
    })
    .join('; ');
}

export interface TextSchemaOptions {
  /** The deck theme; paragraph styles come from it. Read on every render, so it may change. */
  getTheme: () => Theme;
  /** The text style of paragraphs without `styleRef`. */
  styleRef: TextStyleRef;
  /** False keeps every paragraph on one line. */
  wrap: boolean;
  /** Over the text style's colour and weight, as in a table's header row (`TextDefaults`). */
  color?: string;
  weight?: number;
}

interface AttributeSpec {
  default: unknown;
  rendered: boolean;
  keepOnSplit: boolean;
}

const nullable = (): AttributeSpec => ({ default: null, rendered: false, keepOnSplit: true });

const SlidrDoc = Node.create({ name: 'doc', topNode: true, content: 'paragraph+' });

const SlidrText = Node.create({ name: 'text', group: 'inline' });

const SlidrHardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: 'br' }],
  renderHTML: () => ['br'],
});

/**
 * A paragraph, or a list item when it has `list`: one node type, as in the model. It is drawn with
 * the renderer's own paragraph style, so text does not move when the editor takes over a box. The
 * list marker is drawn by the editor view (WG4-T04), not by this node.
 */
const SlidrParagraph = Node.create<TextSchemaOptions>({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  addOptions: () => ({
    getTheme: () => undefined as unknown as Theme,
    styleRef: 'body',
    wrap: true,
  }),
  addAttributes() {
    const attrs: Record<string, AttributeSpec> = {};
    for (const key of PARAGRAPH_ATTRS) attrs[key] = nullable();
    attrs.dir = { ...nullable(), default: 'auto' };
    attrs.align = { ...nullable(), default: 'start' };
    // Formatting of an empty line; ProseMirror has no empty text node to carry it.
    attrs.emptyMarks = { ...nullable(), keepOnSplit: false };
    return attrs;
  },
  parseHTML: () => [{ tag: 'p' }, { tag: 'li' }],
  renderHTML({ node }) {
    const theme = this.options.getTheme();
    const attrs = node.attrs as Record<string, unknown>;
    const p = Object.fromEntries(
      Object.entries(attrs).filter(([k, v]) => k !== 'emptyMarks' && v !== null),
    ) as unknown as Paragraph;
    const style: CSSProperties = {
      ...paragraphStyle({ ...p, runs: [] }, theme, {
        styleRef: this.options.styleRef,
        wrap: this.options.wrap,
        color: this.options.color,
        weight: this.options.weight,
      }),
      ...(p.list ? { paddingInlineStart: `${p.list.level * LEVEL_EM + MARKER_EM}em` } : {}),
    };
    return ['p', { dir: p.dir, style: cssText(style), 'data-list': p.list?.kind ?? null }, 0];
  },
});

function markExtension(type: MarkType) {
  const boolean = BOOLEAN_MARKS.has(type);
  return Mark.create({
    name: type,
    // Nesting order follows MARK_TYPES: earlier marks are outer.
    priority: 1000 - MARK_TYPES.indexOf(type),
    addAttributes: () => (boolean ? {} : { value: { default: null, rendered: false } }),
    renderHTML({ mark }) {
      const value: unknown = boolean ? true : mark.attrs.value;
      if (type === 'link') {
        return [
          'a',
          {
            // Only a link that opens a page or a mail; never one that runs code.
            href: safeLink(String(value)) ?? null,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: 'color: inherit; text-decoration: inherit',
          },
          0,
        ];
      }
      return ['span', { style: cssText(runStyle({ [type]: value }, 'body')) }, 0];
    },
  });
}

/** The extensions of the slide text editor, without TipTap's history (ADR-006 rule 3). */
export function textExtensions(options: TextSchemaOptions): AnyExtension[] {
  return [
    SlidrDoc,
    SlidrParagraph.configure(options),
    SlidrText,
    SlidrHardBreak,
    ...MARK_TYPES.map(markExtension),
  ];
}
