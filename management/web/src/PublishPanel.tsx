import { useEffect, useRef, useState } from 'react';
import { api, type PublishState, type ServerStatus, type Variant } from './api';
import { PUBLISH_PHASE, time } from './labels';
import { SlideView } from './SlideView';

function Paths({ title, paths, tone }: { title: string; paths: string[]; tone?: string }) {
  if (paths.length === 0) return null;
  return (
    <details open={paths.length <= 12} className={tone}>
      <summary>
        {title} ({paths.length})
      </summary>
      <ul className="paths" dir="ltr">
        {paths.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Publishing: the approved designs, what sending them would change in the library, and the
 * confirmation. Nothing reaches Cloudflare before the person has read the report and confirmed.
 */
export function PublishPanel({
  publish,
  approved,
  status,
  onStatus,
  onClose,
}: {
  publish: PublishState;
  approved: Variant[];
  status?: ServerStatus;
  onStatus: () => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const list = useRef<HTMLOListElement>(null);
  const report = publish.report;
  const phase = publish.phase;
  const hasToken = status?.cloudflare.token ?? false;

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [publish.log.length]);

  const run = (work: Promise<unknown>) =>
    work.then(
      () => setError(undefined),
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    );

  const saveToken = () =>
    void run(
      api.cloudflare(token, status?.cloudflare.accountId ?? '').then(() => {
        setToken('');
        onStatus();
      }),
    );

  const items = phase === 'idle' ? approved.map((variant) => variant.id) : publish.items;
  const busy = phase === 'preparing' || phase === 'publishing';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="פרסום">
      <div className="drawer">
        <header className="detail-head">
          <div>
            <h2>פרסום לספריית המדיה</h2>
            <p className="muted small" dir="ltr">
              {status?.media.url} · Cloudflare Pages slidr-media
            </p>
          </div>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            aria-label="סגור"
            disabled={busy}
          >
            ✕
          </button>
        </header>

        <div className="drawer-body">
          <section>
            <h3>{items.length ? `${items.length} עיצובים לפרסום` : 'אין עיצובים מאושרים'}</h3>
            <div className="publish-items">
              {approved
                .filter((variant) => items.includes(variant.id))
                .map((variant) => (
                  <figure key={variant.id}>
                    <SlideView variant={variant} lang="he" width={192} />
                    <figcaption>
                      {variant.brief.name.he}
                      <span className="muted" dir="ltr">
                        {variant.designId}
                      </span>
                    </figcaption>
                  </figure>
                ))}
            </div>
            <p className="muted small">
              העיצובים נכנסים לקטלוג משלהם, <code>elements/designs/managed.json</code>, עם מזהים
              שמתחילים ב-<code>m-</code>, לצד העיצובים שנכתבו ביד. הפרסום עובר דרך{' '}
              <code>pnpm media:publish</code> של המאגר, מהעותק{' '}
              <code dir="ltr">{status?.media.dir}</code>.
            </p>
          </section>

          {!hasToken && (
            <section className="token">
              <h3>מפתח Cloudflare</h3>
              <p className="muted small">
                מפתח API עם הרשאת Cloudflare Pages: Edit. נשמר בזיכרון של השרת בלבד, לא בדיסק.
              </p>
              <div className="row">
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="CLOUDFLARE_API_TOKEN"
                  dir="ltr"
                  autoComplete="off"
                />
                <button type="button" disabled={token.trim().length < 20} onClick={saveToken}>
                  שמור
                </button>
              </div>
            </section>
          )}

          <section>
            {PUBLISH_PHASE[phase] && (
              <p className={`phase phase-${phase}`}>{PUBLISH_PHASE[phase]}</p>
            )}
            {publish.error && <p className="error-text">{publish.error}</p>}
            {error && <p className="error-text">{error}</p>}

            {report && phase === 'prepared' && (
              <div className="report">
                <p>
                  מול הספרייה שפורסמה ({report.before} קבצים): {report.added.length} יתווספו,{' '}
                  {report.changed.length} ישתנו, {report.removed.length} יוסרו. אחרי הפרסום יהיו בה{' '}
                  {report.files} קבצים ({(report.bytes / 1024 / 1024).toFixed(1)} MB).
                </p>
                {report.unexpected.length > 0 && (
                  <p className="warn">
                    שימו לב: {report.unexpected.length} קבצים ישתנו מעבר לעיצובים האלה — יש בעותק
                    המקומי שינויים שלא פורסמו. בדקו את הרשימה לפני שתשלחו.
                  </p>
                )}
                {report.removed.length > 0 && (
                  <p className="warn">{report.removed.length} קבצים שפורסמו יוסרו מהספרייה.</p>
                )}
                <Paths title="יתווספו" paths={report.added} />
                <Paths title="ישתנו" paths={report.changed} />
                <Paths title="יוסרו" paths={report.removed} tone="danger" />
              </div>
            )}

            <div className="form-actions">
              {(phase === 'idle' || phase === 'done' || phase === 'failed') && (
                <button
                  type="button"
                  className="primary"
                  disabled={approved.length === 0}
                  onClick={() => void run(api.prepare(approved.map((variant) => variant.id)))}
                >
                  הכן פרסום ובדוק מה ישתנה
                </button>
              )}
              {phase === 'prepared' && (
                <>
                  <button
                    type="button"
                    className="primary"
                    disabled={!hasToken}
                    onClick={() => {
                      if (
                        window.confirm(
                          `לשלוח ${publish.items.length} עיצובים לספרייה ב-Cloudflare? הם יופיעו אצל כל משתמשי Slidr.`,
                        )
                      ) {
                        void run(api.confirm());
                      }
                    }}
                  >
                    אשר ושלח ל-Cloudflare
                  </button>
                  <button type="button" onClick={() => void run(api.cancelPublish())}>
                    בטל
                  </button>
                </>
              )}
            </div>
            {phase === 'prepared' && !hasToken && (
              <p className="warn small">הזינו מפתח Cloudflare כדי לשלוח.</p>
            )}
          </section>

          {publish.log.length > 0 && (
            <section className="log-box">
              <h3>יומן</h3>
              <ol className="log" dir="ltr" ref={list}>
                {publish.log.map((entry, i) => (
                  <li key={i}>
                    <span className="log-time">{time(entry.t)}</span>
                    <span className="log-text">{entry.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
