import { useEffect, useRef, useState } from 'react';
import { api, isRunning, type Lang, type Variant } from './api';
import type { DesignResult } from './design';
import { LOG_KIND, money, time } from './labels';
import { StatusLine } from './RequestView';
import { SlideView, useResult } from './SlideView';

const THUMB = 384;

function Findings({ result }: { result: DesignResult }) {
  const rows: { lang: string; kind: string; text: string; severe: boolean }[] = [];
  for (const issue of result.issues)
    rows.push({ lang: 'שתיהן', kind: 'חוזה', text: issue, severe: true });
  for (const lang of ['he', 'en'] as const) {
    const side = result.langs[lang];
    const name = lang === 'he' ? 'עברית' : 'English';
    if (side.error) rows.push({ lang: name, kind: 'המרה', text: side.error, severe: true });
    for (const issue of side.issues)
      rows.push({ lang: name, kind: 'חוזה', text: issue, severe: true });
    for (const finding of side.findings) {
      rows.push({
        lang: name,
        kind: `${finding.severity === 'error' ? 'שגיאה' : 'אזהרה'} ${finding.rule}`,
        text: finding.message,
        severe: finding.severity === 'error',
      });
    }
  }
  if (rows.length === 0) {
    return <p className="ok">בדיקת העיצוב של האפליקציה וחוזה הגלריה עברו ללא ממצאים.</p>;
  }
  return (
    <ul className="findings">
      {rows.map((row, i) => (
        <li key={i} className={row.severe ? 'severe' : ''}>
          <span className="tag">{row.lang}</span>
          <span className="tag">{row.kind}</span>
          <span dir="auto">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Log({ variant }: { variant: Variant }) {
  const list = useRef<HTMLOListElement>(null);
  // The list follows its newest line; the panel around it stays where the person left it.
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [variant.log.length]);
  return (
    <ol className="log" ref={list}>
      {variant.log.map((entry, i) => (
        <li key={i} className={`log-${entry.kind}`}>
          <span className="log-time">{time(entry.t)}</span>
          <span className="tag">{LOG_KIND[entry.kind] ?? entry.kind}</span>
          <span dir="auto" className="log-text">
            {entry.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One variant, up close: both languages at full size and as the gallery's thumbnail. */
export function VariantDetail({
  variant,
  lang: initial,
  onClose,
}: {
  variant: Variant;
  lang: Lang;
  onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  const [feedback, setFeedback] = useState('');
  const [imageNote, setImageNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const result = useResult(variant);
  const running = isRunning(variant);
  const render = variant.render;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      after?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (render && render.errors > 0) {
      const sure = window.confirm(
        `בדיקת העיצוב מצאה ${render.errors} שגיאות. לאשר לפרסום בכל זאת?`,
      );
      if (!sure) return;
    }
    void run(() => api.approve(variant.id, true));
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={variant.brief.name.he}>
      <div className="detail">
        <header className="detail-head">
          <div>
            <h2>
              {variant.brief.name.he} <span className="muted">·</span>{' '}
              <span className="muted" dir="ltr">
                {variant.brief.name.en}
              </span>
            </h2>
            <p className="muted small" dir="ltr">
              {variant.designId} · {variant.brief.group}
              {render && ` · revision ${render.revision}`}
              {variant.cost > 0 && ` · ${money(variant.cost)}`}
            </p>
          </div>
          <div className="actions">
            <div className="segmented" role="group" aria-label="שפה">
              <button type="button" aria-pressed={lang === 'he'} onClick={() => setLang('he')}>
                עברית
              </button>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
                English
              </button>
            </div>
            <button type="button" className="ghost" onClick={onClose} aria-label="סגור">
              ✕
            </button>
          </div>
        </header>

        <div className="detail-body">
          <div className="stage">
            {render ? (
              <>
                <SlideView variant={variant} lang={lang} result={result} />
                <h3>כך זה ייראה בגלריה (384 פיקסלים)</h3>
                <div className="thumbs">
                  {(['he', 'en'] as const).map((side) => (
                    <figure key={side}>
                      <SlideView variant={variant} lang={side} width={THUMB} result={result} />
                      <figcaption>{side === 'he' ? 'עברית' : 'English'}</figcaption>
                    </figure>
                  ))}
                </div>
                <p className="muted small">
                  ההמרה: עברית {Math.round((render.editability.he ?? 0) * 100)}% ניתן לעריכה ·
                  English {Math.round((render.editability.en ?? 0) * 100)}% ניתן לעריכה. הרינדור
                  והבדיקה נעשים עם המנוע, הרנדרר ובדיקת העיצוב של Slidr עצמה.
                </p>
              </>
            ) : (
              <div className="slide-empty working big">
                <StatusLine variant={variant} />
              </div>
            )}
          </div>

          <aside className="side">
            <section>
              <div className="row">
                <StatusLine variant={variant} />
                {running && (
                  <button type="button" onClick={() => void run(() => api.cancel(variant.id))}>
                    עצור
                  </button>
                )}
                {(variant.status === 'failed' || variant.status === 'cancelled') && (
                  <button type="button" onClick={() => void run(() => api.retry(variant.id))}>
                    נסה שוב
                  </button>
                )}
              </div>
              {variant.error && <p className="error-text">{variant.error}</p>}
              {error && <p className="error-text">{error}</p>}
            </section>

            <section className="approve-box">
              {variant.approved ? (
                <>
                  <p className="ok">העיצוב מאושר ויישלח בפרסום הבא.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api.approve(variant.id, false))}
                  >
                    בטל אישור
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || running || variant.status !== 'ready' || !render?.publishable}
                    onClick={approve}
                  >
                    אשר לפרסום
                  </button>
                  {render && !render.publishable && (
                    <p className="warn small">
                      העיצוב לא עומד בחוזה של הגלריה, ולכן אי אפשר לאשר אותו. בקשו תיקון.
                    </p>
                  )}
                </>
              )}
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void run(() => api.discard(variant.id, !variant.discarded), onClose)}
              >
                {variant.discarded ? 'החזר הצעה' : 'פסול הצעה'}
              </button>
            </section>

            <section>
              <h3>ממצאים</h3>
              {result ? <Findings result={result} /> : <p className="muted">אין עדיין רינדור.</p>}
            </section>

            <section>
              <h3>בקשת שינוי</h3>
              <textarea
                rows={3}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="למשל: הכותרת גדולה מדי בתמונה הממוזערת; העבירו את התאריך מעל הכפתור"
              />
              <button
                type="button"
                disabled={busy || running || feedback.trim().length < 2}
                onClick={() =>
                  void run(
                    () => api.refine(variant.id, feedback.trim()),
                    () => setFeedback(''),
                  )
                }
              >
                שלח ל-Claude
              </button>
            </section>

            <section>
              <h3>תמונה</h3>
              {variant.image && (
                <details className="small">
                  <summary className="muted">
                    {variant.image.width}×{variant.image.height} · התיאור שממנו נוצרה
                  </summary>
                  <p className="muted" dir="ltr">
                    {variant.image.prompt}
                  </p>
                </details>
              )}
              <input
                value={imageNote}
                onChange={(event) => setImageNote(event.target.value)}
                placeholder="שינוי בתמונה (ריק = תמונה חדשה מאותו תיאור)"
              />
              <button
                type="button"
                disabled={busy || running}
                onClick={() =>
                  void run(
                    () => api.newImage(variant.id, imageNote.trim()),
                    () => setImageNote(''),
                  )
                }
              >
                {imageNote.trim() ? 'שנה את התמונה' : 'תמונה חדשה'}
              </button>
            </section>

            <details>
              <summary>הקונספט</summary>
              <p dir="auto">{variant.brief.concept}</p>
              <p dir="auto" className="muted small">
                {variant.brief.art}
              </p>
            </details>

            <section className="log-box">
              <h3>יומן</h3>
              <Log variant={variant} />
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
