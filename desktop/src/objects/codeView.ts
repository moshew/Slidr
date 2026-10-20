import { defaultKeymap, indentWithTab, temporarilySetTabFocusMode } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/*
 * The code editor of an `html` element (HTM-04): CodeMirror 6 with the HTML or the CSS grammar.
 * This module is the only one that imports CodeMirror, and it is loaded when a code editor is
 * first shown, never at start-up.
 *
 * It keeps no history of its own: what is typed is written to the deck, and undo is the deck's
 * (ADR-006), so Ctrl+Z here undoes what Ctrl+Z on the Stage would.
 */

export type CodeLanguage = 'html' | 'css';

export interface CodeViewOptions {
  language: CodeLanguage;
  text: string;
  /** The accessible name of the editor. */
  label: string;
  /** The user changed the text. Not called for `set`. */
  onChange: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export interface CodeView {
  /** Shows other text: a change that came from elsewhere (an undo, the agent). */
  set(text: string): void;
  focus(): void;
  destroy(): void;
}

/*
 * The look: the design system's tokens, read as CSS variables, so the editor follows the light
 * and the dark theme with the rest of the app. Code is left-to-right whatever the UI's direction.
 */
const look = EditorView.theme({
  '&': {
    color: 'var(--color-ui-fg)',
    backgroundColor: 'var(--color-ui-field)',
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--text-sm)',
  },
  '&.cm-focused': { outline: '2px solid var(--color-ui-focus)', outlineOffset: '-1px' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
    lineHeight: 'var(--text-sm--line-height)',
    overflow: 'visible',
  },
  '.cm-content': { padding: 'calc(var(--spacing) * 2) 0', caretColor: 'var(--color-ui-fg)' },
  '.cm-line': { padding: '0 calc(var(--spacing) * 3) 0 calc(var(--spacing) * 2)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--color-ui-fg-subtle)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 calc(var(--spacing) * 2) 0 calc(var(--spacing) * 3)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-ui-hover)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-ui-fg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--color-ui-accent-soft-hover)' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--color-ui-accent-soft)',
    outline: '1px solid var(--color-ui-line-strong)',
  },
});

const colours = HighlightStyle.define([
  { tag: [tags.tagName, tags.propertyName], color: 'var(--color-ui-accent-fg)' },
  {
    tag: [tags.attributeName, tags.className, tags.labelName],
    color: 'var(--color-ui-warning-fg)',
  },
  { tag: [tags.string, tags.attributeValue, tags.url], color: 'var(--color-ui-success-fg)' },
  { tag: [tags.number, tags.unit, tags.color, tags.atom], color: 'var(--color-ui-danger-fg)' },
  {
    tag: [tags.keyword, tags.definitionKeyword, tags.modifier],
    color: 'var(--color-ui-accent-fg)',
  },
  { tag: [tags.comment, tags.meta], color: 'var(--color-ui-fg-muted)', fontStyle: 'italic' },
  { tag: [tags.angleBracket, tags.punctuation, tags.separator], color: 'var(--color-ui-fg-muted)' },
]);

/** Puts a code editor in `parent`. */
export function createCodeView(parent: HTMLElement, options: CodeViewOptions): CodeView {
  /** True while `set` replaces the text: that is not the user typing. */
  let setting = false;
  const deckHistory = keymap.of([
    {
      key: 'Mod-z',
      run: () => {
        options.onUndo();
        return true;
      },
    },
    {
      key: 'Mod-y',
      mac: 'Mod-Shift-z',
      run: () => {
        options.onRedo();
        return true;
      },
    },
    {
      key: 'Mod-Shift-z',
      run: () => {
        options.onRedo();
        return true;
      },
    },
  ]);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        deckHistory,
        // Tab indents; Escape and then Tab moves the focus on, so the keyboard is never trapped.
        keymap.of([{ key: 'Escape', run: temporarilySetTabFocusMode }, indentWithTab]),
        keymap.of(defaultKeymap),
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        EditorView.lineWrapping,
        options.language === 'html' ? html() : css(),
        syntaxHighlighting(colours),
        look,
        EditorView.contentAttributes.of({
          'aria-label': options.label,
          'data-testid': `code-${options.language}`,
          spellcheck: 'false',
          autocapitalize: 'off',
        }),
        EditorView.editorAttributes.of({ dir: 'ltr' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !setting) options.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    set(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      setting = true;
      try {
        const head = Math.min(view.state.selection.main.head, text.length);
        view.dispatch({
          changes: { from: 0, to: current.length, insert: text },
          selection: { anchor: head },
        });
      } finally {
        setting = false;
      }
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
