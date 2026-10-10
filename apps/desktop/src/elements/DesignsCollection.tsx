import { ScaledSlide } from '@slidr/renderer';
import { Button, Input } from '@slidr/ui';
import { Search } from '@slidr/ui/icons';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusStage, tell, useDeck, useEditor, useElementSize } from '../shell';
import { NothingFound, Section } from './collections';
import { designAssetFile, designBackdropFile } from './designAssets';
import {
  DESIGN_GROUPS,
  DESIGN_IDS,
  designPreview,
  designsOf,
  insertDesign,
  type DesignGroup,
  type DesignId,
} from './designs';
import { useNear } from './StickerGrid';

/** How many designs of a group the overview shows. */
const PREVIEW = 4;

/**
 * One design: a click adds a new slide after the current one, in one undo step. The slide is
 * drawn live, and only once the tile has come near the visible part of the panel: a design is a
 * whole slide with a large picture, and there are many.
 */
function DesignTile({
  id,
  busy,
  onChoose,
}: {
  id: DesignId;
  busy: boolean;
  onChoose: (id: DesignId) => void;
}) {
  const { t } = useTranslation('elements');
  const lang = useDeck((state) => state.deck.meta.lang);
  const [tile, near] = useNear<HTMLButtonElement>();
  const picture = useRef<HTMLSpanElement>(null);
  const { width } = useElementSize(picture);
  const preview = useMemo(() => (near ? designPreview(id, lang) : undefined), [near, id, lang]);
  const name = t(`designs.name.${id}`);
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
        {preview && width > 0 && (
          <ScaledSlide
            deck={preview.deck}
            slide={preview.slide}
            width={Math.floor(width)}
            mode="thumbnail"
            resolveAsset={preview.resolveAsset}
          />
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
 * Ready compositions, by what they are for: the first of every group, one group in full, or
 * what a search of their names found.
 */
export function DesignsCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<DesignGroup>();

  const found = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return undefined;
    return DESIGN_IDS.filter(
      (id) => id.includes(wanted) || t(`designs.name.${id}`).toLowerCase().includes(wanted),
    );
  }, [query, t]);

  const choose = (id: DesignId) => {
    setBusy(true);
    void (async () => {
      try {
        const asset = await editor.assets.import(await designAssetFile(id), 'import');
        const backdropFile = await designBackdropFile(id);
        const backdrop = backdropFile && (await editor.assets.import(backdropFile, 'import'));
        insertDesign(
          editor.bus,
          editor.selection,
          id,
          t(`designs.name.${id}`),
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
          <DesignList ids={found} testId="design-results" busy={busy} onChoose={choose} />
        )
      ) : group ? (
        <Section
          title={t(`designs.group.${group}`)}
          data-group={group}
          action={
            <Button variant="ghost" size="sm" onClick={() => setGroup(undefined)}>
              {t('designs.allGroups')}
            </Button>
          }
        >
          <DesignList
            ids={designsOf(group)}
            testId="design-results"
            busy={busy}
            onChoose={choose}
          />
        </Section>
      ) : (
        DESIGN_GROUPS.map((id) => (
          <Section
            key={id}
            title={t(`designs.group.${id}`)}
            data-group={id}
            action={
              <Button variant="ghost" size="sm" onClick={() => setGroup(id)}>
                {t('showAll')}
              </Button>
            }
          >
            <DesignList ids={designsOf(id).slice(0, PREVIEW)} busy={busy} onChoose={choose} />
          </Section>
        ))
      )}
    </div>
  );
}
