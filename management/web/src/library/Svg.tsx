import { useState, type ReactNode } from 'react';
import { mediaJson } from './media';
import { useRead } from './shared';

/** How many tiles a grid of drawings shows at first, and how many more each time. */
const PAGE = 240;

/** A drawing of the library, as the app puts it in a tile: its own SVG markup. */
export function Markup({ svg, className }: { svg: string | undefined; className?: string }) {
  if (!svg) return <span className={className} />;
  // The library's own drawings, inserted as the app's panels insert them.
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** A grid of many tiles, shown a page at a time. */
export function Paged<T>({
  items,
  render,
  className = 'tile-grid icons',
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      <div className={className}>{items.slice(0, shown).map(render)}</div>
      {items.length > shown && (
        <button type="button" className="link" onClick={() => setShown(shown + PAGE * 2)}>
          הצג עוד ({items.length - shown} נוספים)
        </button>
      )}
    </>
  );
}

interface Notice {
  name: string;
  version?: string;
  license?: string;
  author?: string;
  homepage?: string;
  text?: string;
}

/** The licence notice published beside a file of the library (`<name>.notice.json`). */
export function NoticeFacts({ path }: { path: string }) {
  const notice = useRead(() => mediaJson<Notice>(path), [path]);
  if (notice.error) return <p className="muted small">אין הודעת רישיון ({path}).</p>;
  if (!notice.value) return <p className="muted small">טוען…</p>;
  return (
    <>
      <dl className="facts" dir="ltr">
        <dt>package</dt>
        <dd>
          {notice.value.name} {notice.value.version}
        </dd>
        <dt>license</dt>
        <dd>{notice.value.license}</dd>
        {notice.value.author && (
          <>
            <dt>author</dt>
            <dd>{notice.value.author}</dd>
          </>
        )}
        {notice.value.homepage && (
          <>
            <dt>home</dt>
            <dd>
              <a href={notice.value.homepage} target="_blank" rel="noreferrer">
                {notice.value.homepage}
              </a>
            </dd>
          </>
        )}
      </dl>
      {notice.value.text && (
        <details>
          <summary>נוסח הרישיון</summary>
          <pre className="file-text small" dir="ltr">
            {notice.value.text}
          </pre>
        </details>
      )}
    </>
  );
}

/** A drawing large, at the sizes it is seen at, with its markup. */
export function DrawingStage({
  svg,
  sizes = [256, 96, 48, 24],
}: {
  svg?: string;
  sizes?: number[];
}) {
  return (
    <>
      <div className="drawing-stage checker">
        {sizes.map((side) => (
          <span key={side} className="drawing-size">
            <span style={{ width: side, height: side, display: 'inline-flex' }}>
              <Markup svg={svg} className="drawing" />
            </span>
            <span className="muted small" dir="ltr">
              {side}px
            </span>
          </span>
        ))}
      </div>
      {svg && (
        <details>
          <summary>SVG · {(svg.length / 1024).toFixed(1)} KB</summary>
          <pre className="file-text small" dir="ltr">
            {svg}
          </pre>
        </details>
      )}
    </>
  );
}
