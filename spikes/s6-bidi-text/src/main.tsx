import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';

import { BOXES, SLIDE_H, SLIDE_W, readConfig } from './boxes.ts';
import type { BoxSpec, PageConfig } from './boxes.ts';
import { ExternalHistory, ParagraphDir } from './extensions.ts';
import type { Dir } from './extensions.ts';
import { installHarness, registerEditor } from './harness.ts';

const cfg = readConfig(window.location.search);
installHarness(cfg);

/** In `plain` mode nothing is transformed: every length is multiplied by s and laid out at its final size. */
const k = cfg.mode === 'plain' ? cfg.s : 1;

function boxStyle(spec: BoxSpec): CSSProperties {
  return {
    left: spec.x * k,
    top: spec.y * k,
    width: spec.w * k,
    height: spec.h * k,
    padding: 12 * k,
    fontFamily: `'${spec.font}'`,
    fontSize: spec.size * k,
    transform: spec.rot && !cfg.norot ? `rotate(${spec.rot}deg)` : undefined,
  };
}

function TextBox({ spec, stage }: { spec: BoxSpec; stage: HTMLElement }) {
  const editor = useEditor({
    extensions: [
      // trailingNode: StarterKit v3 appends an empty paragraph after a trailing list, which a slide text box does not want
      // (?trailing=1 keeps the default so the effect can be recorded).
      StarterKit.configure({
        link: false,
        ...(cfg.trailing ? {} : { trailingNode: false }),
        ...(cfg.hist === 'tiptap' ? {} : { undoRedo: false }),
      }),
      ParagraphDir,
      ...(cfg.hist === 'external' ? [ExternalHistory] : []),
    ],
    content: spec.html,
    ...(cfg.tiptapDir ? { textDirection: 'auto' as const } : {}),
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    registerEditor(spec.id, editor);
  }, [spec.id, editor]);

  return (
    <div className="box" data-box={spec.id} style={boxStyle(spec)}>
      <EditorContent editor={editor} />
      {cfg.bubble !== 'none' && (
        <BubbleMenu
          editor={editor}
          className="bubble"
          data-bubble={spec.id}
          {...(cfg.bubble === 'body' ? { appendTo: () => document.body } : {})}
          options={{ placement: 'top', offset: 8, flip: false, shift: false, scrollTarget: stage }}
        >
          <button onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
        </BubbleMenu>
      )}
    </div>
  );
}

/** Control: the same markup in a plain contenteditable, no ProseMirror. */
function NativeBox({ spec }: { spec: BoxSpec }) {
  return (
    <div className="box" data-box={spec.id} style={boxStyle(spec)}>
      <div>
        <div
          className="ProseMirror native"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: spec.html }}
        />
      </div>
    </div>
  );
}

function Hud() {
  const setDir = (dir: Dir) => window.__s6.focusedEditor()?.chain().focus().setParagraphDir(dir).run();
  const link = (s: number, mode = cfg.mode) => {
    const q = new URLSearchParams(window.location.search);
    q.set('s', String(s));
    q.set('mode', mode);
    return `?${q.toString()}`;
  };
  return (
    <div id="hud">
      <div>
        mode=<b>{cfg.mode}</b> s=<b>{cfg.s}</b> bubble={cfg.bubble} hist={cfg.hist}
      </div>
      <div>
        {[0.25, 0.64, 1, 2].map((s) => (
          <a key={s} href={link(s)}>
            {s}
          </a>
        ))}
        {(['transform', 'zoom', 'plain'] as const).map((m) => (
          <a key={m} href={link(cfg.s, m)}>
            {m}
          </a>
        ))}
      </div>
      <div>
        paragraph dir:{' '}
        {(['rtl', 'ltr', 'auto'] as const).map((d) => (
          <button key={d} onMouseDown={(e) => e.preventDefault()} onClick={() => setDir(d)}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const slideStyle: CSSProperties =
    cfg.mode === 'transform'
      ? { width: SLIDE_W, height: SLIDE_H, transform: `scale(${cfg.s})` }
      : cfg.mode === 'zoom'
        ? { width: SLIDE_W, height: SLIDE_H, zoom: cfg.s }
        : { width: SLIDE_W * cfg.s, height: SLIDE_H * cfg.s };
  return (
    <>
      <div id="stage" ref={setStage}>
        <div id="sizer" style={{ width: SLIDE_W * cfg.s, height: SLIDE_H * cfg.s }}>
          <div id="slide" style={slideStyle}>
            {stage &&
              BOXES.map((spec) =>
                cfg.native ? <NativeBox key={spec.id} spec={spec} /> : <TextBox key={spec.id} spec={spec} stage={stage} />,
              )}
          </div>
        </div>
      </div>
      {new URLSearchParams(window.location.search).get('hud') !== '0' && <Hud />}
    </>
  );
}

declare global {
  interface Window {
    __s6cfg: PageConfig;
  }
}
window.__s6cfg = cfg;

createRoot(document.getElementById('root')!).render(<App />);
