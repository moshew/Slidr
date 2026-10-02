import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

export type Dir = 'rtl' | 'ltr' | 'auto';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphDir: {
      /** Set `dir` on every paragraph / list item touched by the selection. */
      setParagraphDir: (dir: Dir | null) => ReturnType;
    };
  }
}

/**
 * Paragraph-level direction (SPEC 5.4: Paragraph.dir = rtl | ltr | auto).
 * `dir` is rendered as the HTML attribute; alignment stays `text-align: start` in CSS so it follows the direction.
 * For list items the attribute lives on the <li> (not the inner <p>) so that the marker side follows the direction.
 */
export const ParagraphDir = Extension.create({
  name: 'paragraphDir',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const d = el.getAttribute('dir');
              return d === 'rtl' || d === 'ltr' || d === 'auto' ? d : null;
            },
            renderHTML: (attrs: Record<string, unknown>) => (attrs.dir ? { dir: attrs.dir as string } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphDir:
        (dir) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          const targets: { pos: number; node: PMNode }[] = [];
          state.doc.nodesBetween(from, to, (node, pos, parent) => {
            if (node.type.name === 'listItem') targets.push({ pos, node });
            else if (node.isTextblock && parent?.type.name !== 'listItem') targets.push({ pos, node });
          });
          if (!targets.length) return false;
          if (dispatch) for (const t of targets) tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, dir });
          return true;
        },
    };
  },
});

/**
 * "Outside history" demo (measurement 7). TipTap's own UndoRedo is disabled; this extension shows the hook an
 * application-level history can use to own undo: it watches doc-changing transactions, groups continuous typing
 * into one entry (same rule Slidr wants: a typing burst = one undo transaction), and takes over Mod-z / Mod-y.
 * Entries are doc snapshots (before/after) - in Slidr they would be RichText values handed to the model history.
 */
export interface ExternalEntry {
  before: unknown;
  after: unknown;
  /** number of ProseMirror transactions merged into this entry */
  transactions: number;
  startedAt: number;
  lastAt: number;
}

export interface ExternalHistoryStorage {
  entries: ExternalEntry[];
  redo: ExternalEntry[];
  /** ms without input after which the next change opens a new entry */
  groupDelay: number;
  /** document range (new coordinates) written by the most recent recorded change */
  range: { from: number; to: number } | null;
}

const EXTERNAL_META = 's6ExternalHistory';

export const ExternalHistory = Extension.create<{ groupDelay: number }, ExternalHistoryStorage>({
  name: 'externalHistory',

  addOptions() {
    return { groupDelay: 500 };
  },

  addStorage() {
    return { entries: [], redo: [], groupDelay: 500, range: null };
  },

  onCreate() {
    this.storage.groupDelay = this.options.groupDelay;
  },

  // The hook: every ProseMirror transaction passes through here after it was applied (editor.on('transaction')).
  onTransaction({ transaction: tr }) {
    const st = this.storage;
    if (!tr.docChanged) return;
    if (tr.getMeta(EXTERNAL_META) || tr.getMeta('addToHistory') === false) {
      st.range = null;
      return;
    }
    // Range this transaction replaced (old coordinates) and wrote (new coordinates).
    let oldFrom = Infinity;
    let oldTo = -Infinity;
    let newFrom = Infinity;
    let newTo = -Infinity;
    tr.mapping.maps.forEach((map) =>
      map.forEach((os, oe, ns, ne) => {
        oldFrom = Math.min(oldFrom, os);
        oldTo = Math.max(oldTo, oe);
        newFrom = Math.min(newFrom, ns);
        newTo = Math.max(newTo, ne);
      }),
    );
    const now = tr.time;
    const last = st.entries[st.entries.length - 1];
    // Same burst = recent enough and touching what the previous change wrote (the rule prosemirror-history uses).
    const adjacent = st.range !== null && oldFrom <= st.range.to && oldTo >= st.range.from;
    if (last !== undefined && now - last.lastAt < st.groupDelay && adjacent) {
      last.after = tr.doc.toJSON();
      last.lastAt = now;
      last.transactions += 1;
    } else {
      st.entries.push({ before: tr.before.toJSON(), after: tr.doc.toJSON(), transactions: 1, startedAt: now, lastAt: now });
    }
    st.redo.length = 0;
    st.range = { from: newFrom, to: newTo };
  },

  addKeyboardShortcuts() {
    const apply = (editor: Editor, json: unknown) => {
      const doc = editor.schema.nodeFromJSON(json);
      const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content).setMeta(EXTERNAL_META, true);
      editor.view.dispatch(tr);
    };
    return {
      'Mod-z': ({ editor }) => {
        const e = this.storage.entries.pop();
        if (e) {
          apply(editor, e.before);
          this.storage.redo.push(e);
          this.storage.range = null;
        }
        return true; // always swallow: the browser's native undo must never run
      },
      'Mod-y': ({ editor }) => {
        const e = this.storage.redo.pop();
        if (e) {
          apply(editor, e.after);
          this.storage.entries.push(e);
          this.storage.range = null;
        }
        return true;
      },
      'Shift-Mod-z': ({ editor }) => {
        const e = this.storage.redo.pop();
        if (e) {
          apply(editor, e.after);
          this.storage.entries.push(e);
          this.storage.range = null;
        }
        return true;
      },
    };
  },
});
