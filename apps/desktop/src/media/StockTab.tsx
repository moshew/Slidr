import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, KeyRound, Search, SearchX } from '@slidr/ui/icons';
import {
  Button,
  cx,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
} from '@slidr/ui';
import { useSettings } from '../settings';
import { isWebAddress, openPanel, PanelId, tell, useDeck, useEditor } from '../shell';
import { stockOf } from './appStock';
import { toEnglish } from './icons/library';
import { insertAsset } from './insert';
import { Group, ReplaceButton, ReplaceHint, TabBody, type TileReplacement } from './parts';
import { replaceSelected, useSelectedPicture } from './replace';
import {
  creditOf,
  stockAsset,
  StockError,
  type StockClient,
  type StockOrientation,
  type StockPhoto,
  type StockSource,
} from './stock';

type Shape = StockOrientation | 'any';

const SHAPES: Shape[] = ['any', 'landscape', 'portrait', 'square'];
const PAGE = 20;

/** What the tab shows under the search field. */
type View =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | {
      state: 'results';
      photos: StockPhoto[];
      page: number;
      hasMore: boolean;
      loadingMore: boolean;
    };

/** The words for a failure, by its kind: the libraries' own text is English and for logs. */
function errorKey(error: unknown): string {
  const kind = error instanceof StockError ? error.kind : 'failed';
  return ['invalid_key', 'no_key', 'rate_limit', 'network'].includes(kind)
    ? `stock.error.${kind}`
    : 'stock.error.other';
}

/**
 * Stock photos (GEN-08, WG12-T06): search a photo library, and add a photo to the slide with a
 * click. The photo is taken into the deck's assets with its credit (who took it, where, under
 * which licence), and the element and the asset are one undo step. While a picture is selected
 * on the Stage, a photo can be taken in that one's place instead.
 *
 * The tab shows what the libraries' terms ask of an app that shows their photos: the
 * photographer under every photo, and a line that names the library.
 */
export function StockTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const { client, workspaceId } = stockOf(editor);
  const revision = useSettings((state) => state.revision);
  const [sources, setSources] = useState<StockSource[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [shape, setShape] = useState<Shape>('any');
  const [view, setView] = useState<View>({ state: 'idle' });
  /** What the last search asked for, to load its next page. */
  const [asked, setAsked] = useState<{ query: string; english: string | null } | null>(null);
  const [taking, setTaking] = useState<string | null>(null);
  const picture = useSelectedPicture();
  /** Counts the searches, so an answer that arrives late does not replace a newer one. */
  const latest = useRef(0);

  // The libraries and their keys: read again when a key is saved or removed in the settings.
  useEffect(() => {
    let current = true;
    Promise.all([client.sources(), client.defaultSource()])
      .then(([list, chosen]) => {
        if (!current) return;
        setSources(list);
        setSource((before) => (before && list.some((s) => s.id === before) ? before : chosen));
      })
      .catch(() => current && setSources([]));
    return () => {
      current = false;
    };
  }, [client, revision]);

  const ready = useMemo(() => sources?.filter((s) => s.state === 'ready') ?? [], [sources]);
  const active = ready.find((s) => s.id === source) ?? ready[0];

  const search = async (page: number, shapeNow: Shape = shape) => {
    const query = page === 1 ? text.trim() : (asked?.query ?? '');
    if (!query || !active) return;
    const ticket = ++latest.current;
    if (page === 1) setView({ state: 'loading' });
    else
      setView((before) => (before.state === 'results' ? { ...before, loadingMore: true } : before));
    try {
      // The libraries index English: a Hebrew query goes through the app's own dictionary.
      const english =
        page === 1 ? await toEnglish(query).catch(() => null) : (asked?.english ?? null);
      const results = await client.search(active.id, {
        query: english ?? query,
        page,
        perPage: PAGE,
        ...(shapeNow === 'any' ? {} : { orientation: shapeNow }),
      });
      if (ticket !== latest.current) return;
      setAsked({ query, english });
      setView((before) => ({
        state: 'results',
        photos:
          page > 1 && before.state === 'results'
            ? [...before.photos, ...results.photos]
            : results.photos,
        page,
        hasMore: results.hasMore,
        loadingMore: false,
      }));
    } catch (error) {
      if (ticket !== latest.current) return;
      setView({ state: 'failed', message: t(errorKey(error)) });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(1);
  };

  /** Takes a photo into the deck: onto the slide, or in place of the picture `instead`. */
  const take = async (photo: StockPhoto, instead?: typeof picture) => {
    const workspace = workspaceId();
    if (!workspace || taking) return;
    setTaking(photo.id);
    try {
      const imported = await client.import(workspace, photo.source, photo.id);
      if (instead) replaceSelected(editor, instead, stockAsset(imported));
      else if (!insertAsset(editor, stockAsset(imported))) await tell(t('noSlide'));
    } catch {
      await tell(t('stock.error.import'));
    } finally {
      setTaking(null);
    }
  };

  if (!sources) {
    return (
      <TabBody testId="media-stock">
        <Skeleton className="h-control w-full" />
      </TabBody>
    );
  }

  if (ready.length === 0) {
    return (
      <TabBody testId="media-stock">
        <EmptyState
          icon={KeyRound}
          title={t('stock.noKeyTitle')}
          description={t('stock.noKeyBody')}
          action={
            <Button variant="primary" onClick={() => openPanel(PanelId.settings)}>
              {t('stock.openSettings')}
            </Button>
          }
          className="min-h-64"
        />
        <Credits />
      </TabBody>
    );
  }

  return (
    <TabBody testId="media-stock">
      <form className="flex flex-col gap-2" onSubmit={submit} role="search">
        <div className="flex items-center gap-2">
          <Input
            icon={Search}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('stock.placeholder')}
            aria-label={t('stock.search')}
            className="min-w-0 flex-1"
            data-testid="stock-query"
          />
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            {t('stock.submit')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl<Shape>
            aria-label={t('stock.shape')}
            size="sm"
            fill
            value={shape}
            onValueChange={(next) => {
              setShape(next);
              if (asked) void search(1, next);
            }}
            options={SHAPES.map((value) => ({ value, label: t(`stock.orientation.${value}`) }))}
          />
        </div>
        {ready.length > 1 && (
          <Select
            aria-label={t('stock.source')}
            size="sm"
            value={active?.id ?? null}
            onValueChange={(next) => {
              setSource(next);
              setView({ state: 'idle' });
              setAsked(null);
            }}
            options={ready.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
      </form>

      {view.state === 'idle' && (
        <EmptyState
          icon={Search}
          title={t('stock.startTitle')}
          description={t('stock.startBody')}
          className="min-h-48"
        />
      )}
      {view.state === 'loading' && (
        <div className="columns-2 gap-2" aria-busy data-testid="stock-loading">
          {[36, 24, 28, 40, 32, 24].map((height, i) => (
            <Skeleton key={i} className={cx('mb-2 w-full', heights[height])} />
          ))}
        </div>
      )}
      {view.state === 'failed' && (
        <EmptyState
          icon={ImageOff}
          tone="error"
          title={t('stock.error.title')}
          description={view.message}
          action={
            <Button variant="secondary" onClick={() => openPanel(PanelId.settings)}>
              {t('stock.openSettings')}
            </Button>
          }
          className="min-h-48"
        />
      )}
      {view.state === 'results' && view.photos.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={t('stock.emptyTitle')}
          description={t('stock.emptyBody')}
          className="min-h-48"
        />
      )}
      {view.state === 'results' && view.photos.length > 0 && active && (
        <div className="flex flex-col gap-3">
          {asked?.english && (
            <p className="text-xs text-ui-fg-muted" data-testid="stock-translated">
              {t('stock.searchingFor', { query: asked.english })}
            </p>
          )}
          <ReplaceHint shown={picture !== undefined} />
          <div
            role="group"
            aria-label={t('stock.results')}
            className="columns-2 gap-2"
            data-testid="stock-results"
          >
            {view.photos.map((photo) => (
              <PhotoTile
                key={`${photo.source}/${photo.id}`}
                photo={photo}
                client={client}
                busy={taking === photo.id}
                onPick={() => void take(photo)}
                replace={
                  picture
                    ? {
                        label: t('replace', { name: photo.description ?? photo.author }),
                        onReplace: () => void take(photo, picture),
                      }
                    : undefined
                }
              />
            ))}
          </div>
          {view.hasMore && (
            <Button loading={view.loadingMore} onClick={() => void search(view.page + 1)}>
              {t('stock.more')}
            </Button>
          )}
          {/* The libraries ask that the app name them where their photos are shown. */}
          <p className="text-xs text-ui-fg-muted" data-testid="stock-provided-by">
            {t('stock.providedBy', { source: active.name })}
            {' · '}
            <span dir="ltr">{hostOf(active.homeUrl)}</span>
          </p>
        </div>
      )}
      <Credits />
    </TabBody>
  );
}

/** Skeleton heights in the spacing scale, by their step. */
const heights: Record<number, string> = {
  24: 'h-24',
  28: 'h-28',
  32: 'h-32',
  36: 'h-36',
  40: 'h-40',
};

/** The host of a link, as a short text: the app opens no links of its own. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A found photo: its thumbnail in its own proportions, and the photographer under it. */
function PhotoTile({
  photo,
  client,
  busy,
  onPick,
  replace,
}: {
  photo: StockPhoto;
  client: StockClient;
  busy: boolean;
  onPick: () => void;
  /** Offered while a picture is selected on the Stage: the photo in that one's place. */
  replace: TileReplacement | undefined;
}) {
  const { t } = useTranslation('media');
  const [url, setUrl] = useState<string | null>(null);

  // The thumbnail arrives as bytes from the core, which fetched it: the page asks no library.
  useEffect(() => {
    let current = true;
    let made: string | null = null;
    client
      .thumbnail(photo.source, photo.id)
      .then((blob) => {
        if (!current) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      current = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [client, photo.source, photo.id]);

  const label = t('stock.insert', { description: photo.description ?? photo.author });
  return (
    <figure className="relative mb-2 flex break-inside-avoid flex-col gap-1">
      <button
        type="button"
        aria-label={label}
        aria-busy={busy || undefined}
        data-photo={photo.id}
        onClick={onPick}
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          backgroundColor: photo.color ?? undefined,
        }}
        className={cx(
          'relative w-full cursor-default overflow-hidden rounded-control border border-ui-line bg-ui-field transition-colors',
          'hover:border-ui-accent focus-visible:-outline-offset-2',
        )}
      >
        {url && <img src={url} alt="" draggable={false} className="size-full object-cover" />}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-ui-scrim text-ui-on-accent">
            <Spinner />
          </span>
        )}
      </button>
      {replace && !busy && <ReplaceButton replace={replace} id={photo.id} />}
      <figcaption className="truncate text-xs text-ui-fg-muted">
        {t('stock.by', { author: photo.author })}
      </figcaption>
    </figure>
  );
}

/** The credits of the stock photos the deck uses, as the libraries ask them to read. */
function Credits() {
  const { t } = useTranslation('media');
  const assets = useDeck((s) => s.deck.assets);
  const credits = useMemo(
    () =>
      Object.values(assets).flatMap((asset) => {
        const credit = asset.origin === 'stock' ? creditOf(asset) : undefined;
        return credit ? [{ id: asset.id, ...credit }] : [];
      }),
    [assets],
  );
  if (credits.length === 0) return null;
  return (
    <Group title={t('stock.used')}>
      <ul className="flex flex-col gap-1.5" data-testid="stock-credits">
        {credits.map((credit) => (
          <li key={credit.id} className="flex flex-col text-xs text-ui-fg">
            <span>
              {credit.library
                ? t('stock.creditOn', { author: credit.author, library: credit.library })
                : t('stock.credit', { author: credit.author })}
            </span>
            {credit.url &&
              // The page of the photo, which its library asks to link to: in the app the shell
              // hands the link to the browser of the system.
              (isWebAddress(credit.url) ? (
                <a
                  dir="ltr"
                  href={credit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate rounded-small text-ui-fg-muted underline underline-offset-2 hover:text-ui-fg"
                >
                  {credit.url}
                </a>
              ) : (
                <span dir="ltr" className="truncate text-ui-fg-muted">
                  {credit.url}
                </span>
              ))}
          </li>
        ))}
      </ul>
    </Group>
  );
}
