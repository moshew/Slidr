import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeck, useEditor, type ActionPopoverProps } from '../shell';
import { insertLine, insertShape } from './insert';
import { Hint } from './parts';
import { GLYPH_BOX, LINE_GLYPHS, LINE_KINDS, shapeGlyph, shapeLibrary } from './shapes';

/* What the Shape and Line buttons of row A open (SHP-01, SHP-05). */

function ShapeGlyph({ preset }: { preset: string }) {
  const glyph = useMemo(() => shapeGlyph(preset), [preset]);
  if (!glyph) return null;
  return (
    <svg aria-hidden viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} className="size-6">
      <path
        d={glyph.d}
        transform={`translate(${glyph.x} ${glyph.y})`}
        fill={glyph.closed ? 'currentColor' : 'none'}
        fillOpacity={0.16}
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The shape library: every preset the renderer draws, by group. A click inserts the shape in the
 * middle of the slide, in the theme's colours, selects it and closes the library.
 */
export function ShapeLibrary({ close }: ActionPopoverProps) {
  const { t, i18n } = useTranslation('objects');
  const editor = useEditor();
  const groups = useMemo(() => shapeLibrary(), []);
  // A preset the renderer gained before it was named here still shows, under its own name.
  const nameOf = (preset: string) =>
    i18n.exists(`objects:shape.${preset}`) ? t(`shape.${preset}`) : preset;

  return (
    <div data-testid="shape-library" className="flex flex-col gap-3">
      {groups.map(({ group, presets }) => (
        <div
          key={group}
          role="group"
          aria-label={t(`library.${group}`)}
          className="flex flex-col gap-1"
        >
          <span className="text-xs font-medium text-ui-fg-muted">{t(`library.${group}`)}</span>
          <div className="grid grid-cols-8">
            {presets.map((preset) => (
              <Hint key={preset} content={nameOf(preset)}>
                <button
                  type="button"
                  aria-label={nameOf(preset)}
                  data-preset={preset}
                  className="inline-flex size-control cursor-default items-center justify-center rounded-control text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed"
                  onClick={() => {
                    insertShape(editor, preset);
                    close();
                  }}
                >
                  <ShapeGlyph preset={preset} />
                </button>
              </Hint>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The lines of the Insert menu: line, arrow, two-way arrow, elbow and curved. */
export function LineLibrary({ close }: ActionPopoverProps) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  // A new line runs in the deck's reading direction (see `newLine`), and so does its glyph.
  const rtl = useDeck((s) => s.deck.meta.dir === 'rtl');
  return (
    <div
      data-testid="line-library"
      role="group"
      aria-label={t('insert.line')}
      className="-m-2 flex flex-col gap-0.5"
    >
      {LINE_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          data-line={kind}
          className="flex h-control cursor-default items-center gap-2.5 rounded-control px-2 text-sm text-ui-fg transition-colors hover:bg-ui-hover active:bg-ui-pressed"
          onClick={() => {
            insertLine(editor, kind);
            close();
          }}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
            className="size-6 shrink-0 text-ui-fg-muted"
          >
            <path
              d={LINE_GLYPHS[kind]}
              transform={rtl ? `translate(${GLYPH_BOX} 0) scale(-1 1)` : undefined}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {t(`line.${kind}`)}
        </button>
      ))}
    </div>
  );
}
