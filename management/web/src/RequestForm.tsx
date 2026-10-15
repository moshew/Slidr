import { BASE_LANGUAGES, CONTENT_LANGUAGES, LANGUAGE_NAMES } from '@slidr/model';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Lang, type LibraryInfo, type StudioRequest } from './api';
import { designLanguages } from './design';
import { EFFORTS, MODELS } from './labels';

const isBase = (lang: Lang) => (BASE_LANGUAGES as readonly Lang[]).includes(lang);

/**
 * The languages to make the designs in. Hebrew and English are always made (the app gives the
 * English design to a deck in a language it was not made in), so they are ticked and fixed; any
 * other is made only when ticked for this request.
 */
function Languages({ extra, onChange }: { extra: Lang[]; onChange: (extra: Lang[]) => void }) {
  return (
    <fieldset className="languages">
      <legend>שפות</legend>
      <div className="language-list">
        {CONTENT_LANGUAGES.map((lang) => {
          const base = isBase(lang);
          return (
            <label key={lang} className="language" title={LANGUAGE_NAMES[lang].english}>
              <input
                type="checkbox"
                checked={base || extra.includes(lang)}
                disabled={base}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...extra, lang] : extra.filter((one) => one !== lang),
                  )
                }
              />
              <span lang={lang} dir="auto">
                {LANGUAGE_NAMES[lang].native}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const EXAMPLES = [
  'הזמנה לערב השקה של ספר שירה בבית קפה תל-אביבי, אווירה אינטימית וחמה',
  'שקופית פתיחה לוובינר על בינה מלאכותית לעסקים קטנים',
  'מודעת מבצע סוף עונה לחנות ציוד טיולים',
  'תמונה ממוזערת לסרטון יוטיוב: מדריך אפייה של לחם מחמצת',
];

/** A new request: what to make, how many concepts, and how Claude works on them. */
export function RequestForm({ onCreated }: { onCreated: (request: StudioRequest) => void }) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(3);
  const [group, setGroup] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [reviewRounds, setReviewRounds] = useState(2);
  // The languages ticked beside Hebrew and English: none by default.
  const [extra, setExtra] = useState<Lang[]>([]);
  const [library, setLibrary] = useState<LibraryInfo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.library().then(setLibrary, () => undefined);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const languages = designLanguages(extra);
      onCreated(
        await api.newRequest({ prompt, count, group, model, effort, reviewRounds, languages }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  return (
    <form className="request-form" onSubmit={(event) => void submit(event)}>
      <div className="form-intro">
        <h2>בקשה חדשה</h2>
        <p>
          תארו את העיצוב שאתם צריכים. Claude יתכנן קונספטים שונים, Codex ייצור לכל אחד תמונה,
          והעיצובים יומרו לשקופיות עם המנוע של Slidr, בעברית ובאנגלית, ובכל שפה נוספת שתסמנו. תראו
          את התוצאות, תבקשו שינויים ותאשרו לפני שמשהו נשלח לספרייה.
        </p>
      </div>

      <label className="field">
        <span>מה ליצור</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          required
          minLength={3}
          placeholder="למשל: הזמנה לחתונה בגן בשעת שקיעה, אלגנטית ושקטה"
        />
      </label>
      <div className="examples">
        {EXAMPLES.map((example) => (
          <button type="button" key={example} className="chip" onClick={() => setPrompt(example)}>
            {example}
          </button>
        ))}
      </div>

      <div className="form-grid">
        <label className="field">
          <span>מספר הצעות</span>
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>קבוצה בגלריה</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">Claude יבחר</option>
            {library?.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.he ? `${g.he} · ${g.id}` : g.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>מודל</span>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>מאמץ</span>
          <select value={effort} onChange={(event) => setEffort(event.target.value)}>
            {EFFORTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>סבבי בדיקה עצמית</span>
          <select
            value={reviewRounds}
            onChange={(event) => setReviewRounds(Number(event.target.value))}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'ללא' : n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        בכל סבב Claude מסתכל על הרינדור בגודל מלא ובגודל ממוזער, בכל השפות של הבקשה, יחד עם ממצאי
        בדיקת העיצוב של האפליקציה, ומתקן.
        {library &&
          !library.reachable &&
          ' (הספרייה ב-Cloudflare לא זמינה כרגע — הקבוצות לא נטענו.)'}
      </p>

      <Languages extra={extra} onChange={setExtra} />
      <p className="hint">
        עברית ואנגלית נוצרות תמיד: מצגת בשפה שהעיצוב לא נכתב בה מקבלת את העיצוב באנגלית. כל שפה
        נוספת היא עוד קובץ, עוד רינדור ועוד בדיקה בכל הצעה, ו״עוד הצעות״ בבקשה הזאת יהיו באותן שפות.
      </p>

      {error && <p className="error-text">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy || prompt.trim().length < 3}>
          {busy ? 'שולח…' : `צור ${count === 1 ? 'עיצוב' : `${count} הצעות`}`}
        </button>
      </div>
    </form>
  );
}
