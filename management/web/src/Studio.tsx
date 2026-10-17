import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api, isRunning, isTemplate, useStudio, type ServerStatus } from './api';
import { useLang, useT } from './i18n';
import { LanguagePicker } from './languages';
import type { LibraryRoute } from './library/shared';
import './library/library.css';
import { PublishPanel } from './PublishPanel';
import { RequestForm } from './RequestForm';
import { RequestView } from './RequestView';
import { TemplateVariantDetail } from './TemplateVariantDetail';
import { VariantDetail } from './VariantDetail';

// The browser of the published library, loaded when it is first opened.
const Library = lazy(() => import('./library/Library').then((m) => ({ default: m.Library })));

const NEW = 'new';
const LIBRARY = 'library';

interface Route {
  tab: string;
  variant?: string;
  /** Where the library browser is, when it is the tab open. */
  lib?: LibraryRoute;
}

function readHash(): Route {
  const params = new URLSearchParams(location.hash.slice(1));
  const section = params.get('lib');
  if (section !== null) {
    const slide = params.get('s');
    return {
      tab: LIBRARY,
      lib: {
        section,
        group: params.get('g') ?? undefined,
        item: params.get('i') ?? undefined,
        folder: params.get('f') ?? undefined,
        slide: slide === null ? undefined : Number(slide),
      },
    };
  }
  return { tab: params.get('tab') ?? NEW, variant: params.get('v') ?? undefined };
}

function hashOf(route: Route): string {
  if (route.lib) {
    const { section, group, item, folder, slide } = route.lib;
    const params = new URLSearchParams({ lib: section });
    if (group) params.set('g', group);
    if (folder) params.set('f', folder);
    if (item) params.set('i', item);
    if (slide !== undefined) params.set('s', String(slide));
    return `#${params}`;
  }
  const params = new URLSearchParams({
    tab: route.tab,
    ...(route.variant ? { v: route.variant } : {}),
  });
  return `#${params}`;
}

function Programs({ status }: { status?: ServerStatus }) {
  const t = useT();
  if (!status) return null;
  return (
    <div className="programs">
      {status.programs.map((program) => (
        <span
          key={program.name}
          className={`chip ${program.ready ? 'ok' : 'bad'}`}
          title={[program.path, program.version, program.note].filter(Boolean).join('\n')}
        >
          {program.ready ? '●' : '○'} {program.name}
        </span>
      ))}
      {!status.media.exists && (
        <span className="chip bad" title={status.media.dir}>
          ○ {t('shell.mediaCopyMissing')}
        </span>
      )}
    </div>
  );
}

/** The studio: a tab for each request, the variants of the open one, and publishing. */
export function Studio() {
  const studio = useStudio();
  const [route, setRoute] = useState(readHash);
  const openVariant = route.variant;
  // Every design is made in Hebrew and English; a language it lacks shows none of it.
  const [lang, setLang] = useLang();
  const t = useT();
  const [status, setStatus] = useState<ServerStatus>();
  const [publishing, setPublishing] = useState(false);

  const refreshStatus = useCallback(() => {
    api.status().then(setStatus, () => undefined);
  }, []);
  useEffect(refreshStatus, [refreshStatus]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const go = (next: Route) => {
    // Browsing the library is kept in the history, so Back leaves an item or a section.
    if (next.lib || route.lib) history.pushState(null, '', hashOf(next));
    else history.replaceState(null, '', hashOf(next));
    setRoute(next);
  };

  const requests = studio.requests;
  // A closed tab, or one another page deleted: the last tab is shown in its place.
  const known =
    route.tab === NEW ||
    route.tab === LIBRARY ||
    requests.some((request) => request.id === route.tab);
  const tab = known || !studio.loaded ? route.tab : (requests.at(-1)?.id ?? NEW);
  const active = requests.find((request) => request.id === tab);

  const variantsOf = (rid: string) =>
    (requests.find((request) => request.id === rid)?.variantIds ?? [])
      .map((vid) => studio.variants[vid])
      .filter((variant) => variant !== undefined);

  const approved = useMemo(
    () =>
      Object.values(studio.variants).filter((variant) => variant.approved && !variant.discarded),
    [studio.variants],
  );
  const detail = openVariant ? studio.variants[openVariant] : undefined;
  const publishBusy = studio.publish.phase === 'preparing' || studio.publish.phase === 'publishing';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            S
          </span>
          <div>
            <h1>Slidr Studio</h1>
            <p>{t('shell.subtitle')}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Programs status={status} />
          {!studio.connected && <span className="chip bad">{t('shell.disconnected')}</span>}
          <LanguagePicker lang={lang} onChange={setLang} label={t('shell.displayLanguage')} />
          <button
            type="button"
            className={approved.length || publishBusy ? 'primary' : ''}
            onClick={() => setPublishing(true)}
          >
            {publishBusy
              ? t('shell.publishing')
              : approved.length
                ? t('shell.publishCount', { count: approved.length })
                : t('shell.publish')}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t('shell.requestsTabs')}>
        <button
          type="button"
          className="tab library-tab"
          aria-current={route.lib ? 'page' : undefined}
          onClick={() => go({ tab: LIBRARY, lib: { section: 'overview' } })}
          title={t('shell.libraryTitle')}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="tab-icon">
            <path
              d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6.5a2.5 2.5 0 0 0 0 5H19M8 7h7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('shell.library')}
        </button>
        <span className="tabs-divider" aria-hidden />
        {requests.map((request) => {
          const variants = variantsOf(request.id);
          const running = request.status === 'planning' || variants.some(isRunning);
          const ready = variants.filter((variant) => variant.status === 'ready').length;
          return (
            <button
              type="button"
              key={request.id}
              className="tab"
              aria-current={request.id === tab ? 'page' : undefined}
              onClick={() => go({ tab: request.id })}
              title={request.prompt}
            >
              {running ? (
                <span className="spinner" aria-hidden />
              ) : (
                <span className="dot" aria-hidden />
              )}
              <span className="tab-title">{request.title}</span>
              {variants.length > 0 && (
                <span className="tab-count">
                  {ready}/{variants.length}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          className="tab new"
          aria-current={tab === NEW ? 'page' : undefined}
          onClick={() => go({ tab: NEW })}
        >
          {t('shell.newRequest')}
        </button>
      </nav>

      <main>
        {route.lib ? (
          <Suspense fallback={<p className="muted">{t('shell.loadingLibrary')}</p>}>
            <Library
              route={route.lib}
              go={(lib) => go({ tab: LIBRARY, lib })}
              lang={lang}
              variants={studio.variants}
              serverUrl={status?.media.url}
              onOpenVariant={(variant) => go({ tab: variant.requestId, variant: variant.id })}
            />
          </Suspense>
        ) : !studio.loaded ? (
          <p className="muted">{t('shell.loading')}</p>
        ) : tab === NEW || !active ? (
          <RequestForm onCreated={(request) => go({ tab: request.id })} />
        ) : (
          <RequestView
            key={active.id}
            request={active}
            variants={variantsOf(active.id)}
            lang={lang}
            onOpen={(vid) => go({ tab: active.id, variant: vid })}
            onClosed={() => go({ tab: NEW })}
          />
        )}
      </main>

      {detail &&
        (isTemplate(detail) ? (
          <TemplateVariantDetail
            key={detail.id}
            variant={detail}
            onClose={() => go({ tab: detail.requestId })}
          />
        ) : (
          <VariantDetail
            key={detail.id}
            variant={detail}
            lang={lang}
            onClose={() => go({ tab: detail.requestId })}
          />
        ))}
      {publishing && (
        <PublishPanel
          publish={studio.publish}
          approved={
            studio.publish.phase === 'idle'
              ? approved
              : studio.publish.items
                  .map((vid) => studio.variants[vid])
                  .filter((v) => v !== undefined)
          }
          status={status}
          onStatus={refreshStatus}
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
