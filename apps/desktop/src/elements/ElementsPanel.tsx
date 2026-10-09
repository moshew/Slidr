import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search } from '@slidr/ui/icons';
import { IconButton, Input, Skeleton, Tooltip } from '@slidr/ui';
import { findIcons, type FoundIcon } from '../media/icons/library';
import { IconsTab } from '../media/IconsTab';
import { insertIcon } from '../media/insert';
import { StockTab } from '../media/StockTab';
import { tell, useEditor } from '../shell';
import {
  ChartsCollection,
  ClipsCollection,
  EmojiCollection,
  GraphicsCollection,
  NothingFound,
  Section,
  ShapesCollection,
  TablesCollection,
  useLoaded,
} from './collections';
import { loadFrames, searchFrames } from './frames';
import { FrameGrid, FramesCollection } from './FramesCollection';
import { useRecentStickers } from './recent';
import { DesignsCollection } from './DesignsCollection';
import { StickerButton, StickerGrid } from './StickerGrid';
import { loadEmoji, loadGraphics, searchStickers } from './stickers';
import { COLLECTIONS, CollectionTile, FrameThumbDefs, type CollectionId } from './tiles';

/**
 * Elements: everything that can be put on a slide, by kind. The first screen offers the
 * collections (designs, shapes, graphics, emoji, icons, photos, frames, clips, tables, charts),
 * what was used lately, and one search over the drawings of all of them; a collection opens in
 * its place.
 */
export function ElementsPanel() {
  const [collection, setCollection] = useState<CollectionId | null>(null);
  return (
    <div className="@container flex flex-col" data-testid="elements-panel">
      {collection ? (
        <Collection id={collection} onBack={() => setCollection(null)} />
      ) : (
        <Home onOpen={setCollection} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the first screen */

/** How long the search waits after the last key before it looks. */
const PAUSE_MS = 150;

function Home({ onOpen }: { onOpen: (id: CollectionId) => void }) {
  const { t } = useTranslation('elements');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), text.trim() ? PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="flex flex-col gap-5 px-4 pt-3 pb-6">
      <Input
        icon={Search}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('search')}
        data-testid="elements-query"
      />
      {query ? (
        <Found query={query} />
      ) : (
        <>
          <Recent />
          <Section title={t('browse')}>
            <div
              className="grid grid-cols-3 gap-x-1 gap-y-2 @md:grid-cols-4"
              data-testid="element-collections"
            >
              {COLLECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-collection={id}
                  onClick={() => onOpen(id)}
                  className="group flex cursor-default flex-col items-center gap-0.5 rounded-panel px-1 pt-1 pb-2.5 transition-colors hover:bg-ui-hover active:bg-ui-pressed"
                >
                  <CollectionTile id={id} className="w-full max-w-28" />
                  <span className="text-sm font-medium text-ui-fg">{t(`collection.${id}`)}</span>
                </button>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/** The graphics and emoji used lately, the latest first. Nothing before the first one is used. */
function Recent() {
  const { t } = useTranslation('elements');
  const stickers = useRecentStickers((state) => state.stickers);
  if (stickers.length === 0) return null;
  return (
    <Section title={t('recent')}>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" data-testid="elements-recent">
        {stickers.map((sticker) => (
          <div key={sticker.id} className="w-18 shrink-0">
            <StickerButton sticker={sticker} size="graphic" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** How many of each kind the search of the first screen shows. */
const FOUND = { graphics: 18, frames: 12, emoji: 24, icons: 24 };

/** What a query finds across the collections that are searched by word. */
function Found({ query }: { query: string }) {
  const { t } = useTranslation('elements');
  const allGraphics = useLoaded(loadGraphics);
  const allFrames = useLoaded(loadFrames);
  const allEmoji = useLoaded(loadEmoji);
  const [icons, setIcons] = useState<{ query: string; icons: FoundIcon[] }>();

  useEffect(() => {
    let current = true;
    findIcons(query, { count: FOUND.icons, style: 'line' })
      .then((found) => current && setIcons({ query, icons: found }))
      .catch(() => current && setIcons({ query, icons: [] }));
    return () => {
      current = false;
    };
  }, [query]);

  const graphics = useMemo(
    () => (Array.isArray(allGraphics) ? searchStickers(allGraphics, query, FOUND.graphics) : []),
    [allGraphics, query],
  );
  const frames = useMemo(
    () => (Array.isArray(allFrames) ? searchFrames(allFrames, query, FOUND.frames) : []),
    [allFrames, query],
  );
  const emoji = useMemo(
    () => (Array.isArray(allEmoji) ? searchStickers(allEmoji, query, FOUND.emoji) : []),
    [allEmoji, query],
  );

  // The icons found for an earlier query are not this query's.
  const foundIcons = icons?.query === query ? icons.icons : undefined;
  if (!allGraphics || !allFrames || !allEmoji || !foundIcons) {
    return (
      <div className="element-grid" data-size="graphic" aria-busy>
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="m-1 aspect-square" />
        ))}
      </div>
    );
  }
  if (graphics.length + frames.length + emoji.length + foundIcons.length === 0) {
    return <NothingFound />;
  }
  return (
    <div className="flex flex-col gap-5" data-testid="elements-found">
      {graphics.length > 0 && (
        <Section title={t('collection.graphics')} data-group="graphics">
          <StickerGrid stickers={graphics} size="graphic" label={t('collection.graphics')} />
        </Section>
      )}
      {frames.length > 0 && (
        <Section title={t('collection.frames')} data-group="frames">
          <FrameThumbDefs />
          <FrameGrid frames={frames} label={t('collection.frames')} />
        </Section>
      )}
      {emoji.length > 0 && (
        <Section title={t('collection.emoji')} data-group="emoji">
          <StickerGrid stickers={emoji} size="emoji" label={t('collection.emoji')} />
        </Section>
      )}
      {foundIcons.length > 0 && (
        <Section title={t('collection.icons')} data-group="icons">
          <FoundIcons icons={foundIcons} />
        </Section>
      )}
    </div>
  );
}

function FoundIcons({ icons }: { icons: readonly FoundIcon[] }) {
  const { t } = useTranslation('media');
  const editor = useEditor();
  return (
    <div role="group" aria-label={t('icons.list')} className="element-grid" data-size="emoji">
      {icons.map((icon) => (
        <Tooltip key={icon.id} content={icon.name}>
          <button
            type="button"
            aria-label={t('icons.insert', { name: icon.name })}
            data-icon={icon.id}
            onClick={() => {
              if (!insertIcon(editor, icon)) void tell(t('noSlide'));
            }}
            className="flex aspect-square cursor-default items-center justify-center rounded-control text-ui-fg transition-colors hover:bg-ui-hover active:bg-ui-pressed focus-visible:-outline-offset-2 [&>svg]:size-6"
            // The library's own markup: paths in `currentColor`, built in `library.ts`.
            dangerouslySetInnerHTML={{ __html: icon.svg }}
          />
        </Tooltip>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- an open collection */

/** What each collection shows. Photos are the media panel's stock tab, which has its own gutter. */
const views: Record<Exclude<CollectionId, 'photos'>, () => ReactNode> = {
  designs: () => <DesignsCollection />,
  shapes: () => <ShapesCollection />,
  graphics: () => <GraphicsCollection />,
  emoji: () => <EmojiCollection />,
  icons: () => <IconsTab />,
  frames: () => <FramesCollection />,
  clips: () => <ClipsCollection />,
  tables: () => <TablesCollection />,
  charts: () => <ChartsCollection />,
};

function Collection({ id, onBack }: { id: CollectionId; onBack: () => void }) {
  const { t } = useTranslation('elements');
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-ui-panel px-2 pt-2 pb-1">
        <IconButton icon={ArrowLeft} mirror label={t('back')} onClick={onBack} />
        <h3 className="min-w-0 flex-1 truncate text-md font-semibold text-ui-fg">
          {t(`collection.${id}`)}
        </h3>
      </div>
      {id === 'photos' ? (
        <StockTab />
      ) : (
        <div className="flex flex-col gap-4 px-4 pt-2 pb-6" data-collection-view={id}>
          {views[id]()}
        </div>
      )}
    </>
  );
}
