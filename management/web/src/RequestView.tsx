import { useState } from 'react';
import { api, isRunning, type Lang, type StudioRequest, type Variant } from './api';
import { money, STAGE, STATUS } from './labels';
import { SlideView } from './SlideView';

function Badge({ variant }: { variant: Variant }) {
  if (variant.published && variant.published.revision === variant.revision) {
    return <span className="badge published">פורסם</span>;
  }
  if (variant.approved) return <span className="badge approved">מאושר לפרסום</span>;
  if (variant.published) return <span className="badge changed">שונה מאז הפרסום</span>;
  return null;
}

export function StatusLine({ variant }: { variant: Variant }) {
  const running = isRunning(variant);
  const stage = variant.stage ? (STAGE[variant.stage] ?? variant.stage) : undefined;
  return (
    <span className={`status status-${variant.status}`}>
      {running && <span className="spinner" aria-hidden />}
      {STATUS[variant.status]}
      {stage && ` · ${stage}`}
    </span>
  );
}

function VariantCard({
  variant,
  lang,
  onOpen,
}: {
  variant: Variant;
  lang: Lang;
  onOpen: () => void;
}) {
  const render = variant.render;
  return (
    <article className={`card${variant.discarded ? ' discarded' : ''}`}>
      <button
        type="button"
        className="card-picture"
        onClick={onOpen}
        aria-label={`פתח את ${variant.brief.name.he}`}
      >
        {render ? (
          <SlideView variant={variant} lang={lang} />
        ) : (
          <div className="slide-empty working">
            <StatusLine variant={variant} />
          </div>
        )}
      </button>
      <div className="card-body">
        <div className="card-title">
          <strong>{variant.brief.name.he}</strong>
          <span className="muted" dir="ltr">
            {variant.brief.name.en}
          </span>
        </div>
        <div className="card-meta">
          <StatusLine variant={variant} />
          <Badge variant={variant} />
        </div>
        {render && (
          <div className="card-meta small">
            <span className={render.errors ? 'warn' : 'ok'}>
              {render.errors} שגיאות · {render.warnings} אזהרות
            </span>
            {!render.publishable && <span className="warn">לא עומד בחוזה הגלריה</span>}
            <span className="muted">{variant.brief.groupName.he ?? variant.brief.group}</span>
          </div>
        )}
        {variant.error && <p className="error-text clamp">{variant.error}</p>}
      </div>
    </article>
  );
}

/** One request: its prompt, and its variants side by side. */
export function RequestView({
  request,
  variants,
  lang,
  onOpen,
  onClosed,
}: {
  request: StudioRequest;
  variants: Variant[];
  lang: Lang;
  onOpen: (vid: string) => void;
  onClosed: () => void;
}) {
  const [more, setMore] = useState(2);
  const [error, setError] = useState<string>();
  const running = request.status === 'planning' || variants.some(isRunning);
  const cost = request.cost + variants.reduce((sum, variant) => sum + variant.cost, 0);
  const shown = variants.filter((variant) => !variant.discarded);
  const hidden = variants.length - shown.length;
  const [showHidden, setShowHidden] = useState(false);

  const run = (work: Promise<unknown>) =>
    work.then(
      () => setError(undefined),
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    );

  const close = () => {
    const pending = variants.filter((variant) => variant.approved && !variant.published);
    const question = pending.length
      ? `לסגור את הבקשה? ${pending.length} עיצובים מאושרים שעוד לא פורסמו יימחקו איתה.`
      : 'לסגור את הבקשה ולמחוק את התוצרים שלה?';
    if (!window.confirm(question)) return;
    void run(api.deleteRequest(request.id).then(onClosed));
  };

  return (
    <section className="request">
      <header className="request-head">
        <div>
          <p className="prompt">{request.prompt}</p>
          <p className="muted small">
            {request.count} הצעות · סבבי בדיקה: {request.reviewRounds}
            {request.model && ` · ${request.model}`}
            {request.effort && ` · מאמץ ${request.effort}`}
            {request.group && ` · קבוצה ${request.group}`}
            {cost > 0 && ` · ${money(cost)}`}
          </p>
        </div>
        <div className="actions">
          <select
            value={more}
            onChange={(event) => setMore(Number(event.target.value))}
            aria-label="כמה הצעות להוסיף"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void run(api.more(request.id, more))}
            disabled={request.status === 'planning'}
          >
            עוד הצעות
          </button>
          {running && (
            <button type="button" onClick={() => void run(api.cancelRequest(request.id))}>
              עצור הכל
            </button>
          )}
          <button type="button" className="ghost" onClick={close}>
            סגור בקשה
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {request.status === 'failed' && request.error && (
        <p className="error-text">התכנון נכשל: {request.error}</p>
      )}

      <div className="grid">
        {(showHidden ? variants : shown).map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            lang={lang}
            onOpen={() => onOpen(variant.id)}
          />
        ))}
        {request.status === 'planning' &&
          Array.from({ length: variants.length ? more : request.count }, (_, i) => (
            <article className="card placeholder" key={`plan-${i}`}>
              <div className="slide-empty working">
                <span className="status">
                  <span className="spinner" aria-hidden /> Claude מתכנן קונספטים…
                </span>
              </div>
              <div className="card-body">
                <div className="bar" />
                <div className="bar short" />
              </div>
            </article>
          ))}
      </div>
      {hidden > 0 && (
        <button type="button" className="link" onClick={() => setShowHidden(!showHidden)}>
          {showHidden ? 'הסתר הצעות שנפסלו' : `הצג ${hidden} הצעות שנפסלו`}
        </button>
      )}
    </section>
  );
}
