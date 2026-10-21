import { ScaledSlide } from '@slidr/renderer';
import { Button, IconButton, Input, Skeleton } from '@slidr/ui';
import { ArrowLeft, Search } from '@slidr/ui/icons';
import { Suspense, use, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n';
import { focusStage, tell, useEditor, useElementSize } from '../shell';
import {
  Drill,
  NothingFound,
  OpenGroupContext,
  Section,
  useLoaded,
  useOpenGroup,
  type OpenGroup,
} from './collections';
import { designAssetFile, designBackdropFile } from './designAssets';
import { designWords, searchDesigns } from './designCatalog';
import { loadDesigns, type DesignGroup, type DesignId, type Designs } from './designs';
import { loadDesignThumbs, type FindDesignThumb } from './designThumbs';
import { useNear } from './StickerGrid';

/** How many designs of a group the overview shows. */
const PREVIEW = 4;

/** The designs of a language, and the pictures made of them. */
interface Gallery {
  designs: Designs;
  thumb: FindDesignThumb;
}

const galleries = new Map<string, Promise<Gallery>>();

/**
 * The gallery of a language, read once and kept (ADR-109). It is asked for as the panel is drawn,
 * not in an effect: a panel not yet opened is drawn hidden at a quiet moment, and runs no effects,
 * so the designs are read then and are there when it is opened.
 */
function galleryIn(lang: string): Promise<Gallery> {
  let gallery = galleries.get(lang);
  if (!gallery) {
    gallery = Promise.all([loadDesigns(lang), loadDesignThumbs()]).then(([designs, thumb]) => ({
      designs,
      thumb,
    }));
    galleries.set(lang, gallery);
  }
  return gallery;
}

/**
 * The names of designs and of their groups, in the language of the interface or in `lng`: the
 * app's own, else the one `managed.json` gives a design of Slidr Studio, else the id. A name
 * that neither has is reported as a missing string.
 */
function useDesignNames(designs: Designs) {
  const { t, i18n } = useTranslation('elements');
  const lang = i18n.language;
  return useMemo(() => {
    const named = (key: string, managed: string | undefined, id: string, lng: string) =>
      i18n.exists(key, { ns: 'elements', lng })
        ? t(key, { lng })
        : (managed ?? t(key, { lng, defaultValue: id }));
    return {
      design: (id: DesignId, lng = lang) =>
        named(`designs.name.${id}`, designs.designName(id, lng), id, lng),
      group: (group: DesignGroup, lng = lang) =>
        named(`designs.group.${group}`, designs.designGroupName(group, lng), group, lng),
    };
  }, [t, i18n, lang, designs]);
}

/**
 * One design: a click adds a new slide after the current one, in one undo step. It is shown once
 * the tile has come near the visible part of the panel, as the picture made of it ahead; a design
 * that has none, or has changed since, is drawn live: a whole slide with a large picture.
 */
function DesignTile({
  designs,
  thumb,
  id,
  busy,
  onChoose,
}: {
  designs: Designs;
  thumb: FindDesignThumb;
  id: DesignId;
  busy: boolean;
  onChoose: (id: DesignId) => void;
}) {
  const { t } = useTranslation('elements');
  const names = useDesignNames(designs);
  const lang = useLanguage();
  const [tile, near] = useNear<HTMLButtonElement>();
  const picture = useRef<HTMLSpanElement>(null);
  const { width } = useElementSize(picture);
  const drawnIn = designs.designLanguage(id, lang);
  const made = useMemo(() => thumb(id, drawnIn), [thumb, id, drawnIn]);
  const preview = useMemo(
    () => (near && !made ? designs.designPreview(id, lang) : undefined),
    [near, made, designs, id, lang],
  );
  const name = names.design(id);
  return (
    <button
      ref={tile}
      type="button"
      data-design={id}
      aria-label={t('designs.insert', { name })}
      disabled={busy}
      className="group flex min-w-0 cursor-default flex-col gap-1.5 rounded-inset text-start focus-visible:outline-2 focus-visible:outline-ui-accent"
      onClick={() => onChoose(id)}
    >
      <span
        ref={picture}
        aria-hidden
        className="block aspect-video w-full overflow-hidden rounded-inset shadow-sm transition-shadow group-hover:shadow-floating"
      >
        {near && made && width > 0 ? (
          <img
            src={made.src}
            srcSet={made.srcSet}
            sizes={`${Math.floor(width)}px`}
            lang={drawnIn}
            data-design-picture
            alt=""
            draggable={false}
            decoding="async"
            className="block size-full"
          />
        ) : (
          preview &&
          width > 0 && (
            <ScaledSlide
              deck={preview.deck}
              slide={preview.slide}
              width={Math.floor(width)}
              mode="thumbnail"
              resolveAsset={preview.resolveAsset}
            />
          )
        )}
      </span>
      <span className="px-1 pb-0.5 text-xs leading-4 font-semibold text-ui-fg">{name}</span>
    </button>
  );
}

/** Two compact design previews in every row of the panel. */
function DesignList({
  ids,
  testId,
  ...tile
}: {
  ids: readonly DesignId[];
  testId?: string;
  designs: Designs;
  thumb: FindDesignThumb;
  busy: boolean;
  onChoose: (id: DesignId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid={testId}>
      {ids.map((id) => (
        <DesignTile key={id} id={id} {...tile} />
      ))}
    </div>
  );
}

/**
 * The Ready slides panel (ADR-106): the designs, out of Elements, since a click on one adds a
 * slide where every piece of Elements goes on the slide that is open. The title bar of the shell
 * names the panel; while one group is opened in full, a header under it names the group and
 * leads back to all of them.
 */
export function DesignsPanel() {
  const { t } = useTranslation('elements');
  const [group, setGroup] = useState<OpenGroup>();
  return (
    <OpenGroupContext value={setGroup}>
      <div className="@container flex flex-col" data-testid="designs-panel">
        {group && (
          <div className="sticky top-0 z-10 flex items-center gap-1 bg-ui-panel px-2 pt-2 pb-1">
            <IconButton
              icon={ArrowLeft}
              mirror
              label={t('backTo', { name: t('designs.title') })}
              onClick={group.onBack}
            />
            <h3
              key={group.title}
              className="min-w-0 flex-1 animate-fade-in truncate text-md font-semibold text-ui-fg"
            >
              {group.title}
            </h3>
          </div>
        )}
        <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
          <Suspense fallback={<DesignsLoading />}>
            <DesignsCollection />
          </Suspense>
        </div>
      </div>
    </OpenGroupContext>
  );
}

/** The gallery while its designs are read: the tiles of a group, empty. */
function DesignsLoading() {
  return (
    <div className="grid grid-cols-2 gap-2" aria-busy data-testid="designs-loading">
      {Array.from({ length: PREVIEW * 2 }, (_, index) => (
        <Skeleton key={index} className="aspect-video rounded-inset" />
      ))}
    </div>
  );
}

/**
 * Ready compositions, by what they are for: the first of every group, one group in full under
 * its own name, or what a search found. Only the designs drawn in the UI language (`designIn`):
 * a group with none of them is not shown. The search reads Hebrew and English, in the names of
 * the designs and of their groups and in their tags, best first; after those come the designs
 * whose name in the UI language holds the query as typed.
 */
export function DesignsCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const lang = useLanguage();
  const { designs, thumb } = use(galleryIn(lang));
  const names = useDesignNames(designs);
  const tags = useLoaded(designs.loadDesignTags);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setGroup] = useState<DesignGroup>();

  const groups = useMemo(
    () =>
      designs.groups
        .map((id) => ({ id, ids: designs.designsIn(id, lang) }))
        .filter((one) => one.ids.length > 0),
    [designs, lang],
  );
  // A group the language was switched away from, open as it was switched, is no longer shown.
  const group = groups.find(({ id }) => id === chosen);
  const index = useMemo(
    () =>
      groups.flatMap(({ id: group, ids }) => {
        const groupName = { he: names.group(group, 'he'), en: names.group(group, 'en') };
        return ids.map((id) =>
          designWords(
            id,
            { he: names.design(id, 'he'), en: names.design(id, 'en') },
            groupName,
            tags && tags !== 'failed' ? tags[id] : undefined,
          ),
        );
      }),
    [groups, names, tags],
  );
  const found = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return undefined;
    const best = searchDesigns(index, query);
    const taken = new Set(best);
    const named = groups.flatMap(({ ids }) =>
      ids.filter(
        (id) =>
          !taken.has(id) &&
          (id.includes(wanted) || names.design(id).toLowerCase().includes(wanted)),
      ),
    );
    return [...best, ...named];
  }, [query, names, groups, index]);
  // One group in full has the header of the panel: its name, and the way back to all of them.
  const opened = found ? undefined : group?.id;
  const showGroups = useCallback(() => setGroup(undefined), []);
  useOpenGroup(opened && names.group(opened), showGroups);

  const choose = (id: DesignId) => {
    setBusy(true);
    void (async () => {
      try {
        const asset = await editor.assets.import(await designAssetFile(id), 'import');
        const backdropFile = await designBackdropFile(id);
        const backdrop = backdropFile && (await editor.assets.import(backdropFile, 'import'));
        designs.insertDesign(
          editor.bus,
          editor.selection,
          id,
          lang,
          names.design(id),
          t('designs.history'),
          asset,
          backdrop,
        );
        focusStage();
      } catch {
        void tell(t('loadFailed'));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (designs.ids.length === 0 || groups.length === 0) {
    // The designs are read from the media library: without it there are none to offer. With it,
    // a language may have none drawn in it yet.
    return (
      <p className="py-8 text-center text-sm text-ui-fg-muted" data-testid="elements-designs">
        {t(designs.ids.length === 0 ? 'loadFailed' : 'designs.none')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="elements-designs">
      <Input
        icon={Search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('designs.searchPlaceholder')}
        aria-label={t('designs.search')}
        data-testid="designs-query"
      />
      <p className="text-xs leading-relaxed text-ui-fg-muted">{t('designs.hint')}</p>
      {found ? (
        found.length === 0 ? (
          <NothingFound />
        ) : (
          <DesignList
            ids={found}
            testId="design-results"
            designs={designs}
            thumb={thumb}
            busy={busy}
            onChoose={choose}
          />
        )
      ) : (
        <Drill screen={group?.id ?? 'groups'} depth={group ? 1 : 0} className="flex flex-col gap-4">
          {group ? (
            <DesignList
              ids={group.ids}
              testId="design-results"
              designs={designs}
              thumb={thumb}
              busy={busy}
              onChoose={choose}
            />
          ) : (
            groups.map(({ id, ids }) => (
              <Section
                key={id}
                title={names.group(id)}
                data-group={id}
                action={
                  <Button variant="ghost" size="sm" onClick={() => setGroup(id)}>
                    {t('showAll')}
                  </Button>
                }
              >
                <DesignList
                  ids={ids.slice(0, PREVIEW)}
                  designs={designs}
                  thumb={thumb}
                  busy={busy}
                  onChoose={choose}
                />
              </Section>
            ))
          )}
        </Drill>
      )}
    </div>
  );
}
