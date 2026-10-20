import { referencedAssetIds, type AssetMeta } from '@slidr/model';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, Trash2, Volume2 } from '@slidr/ui/icons';
import { Button, cx, EmptyState, Icon, IconButton } from '@slidr/ui';
import { tell, useDeck, useEditor } from '../shell';
import { formatMoment, isClip } from './clip';
import { startAssetDrag } from './drag';
import { insertAsset } from './insert';
import { insertClips } from './insertClip';
import { Group, TabBody } from './parts';

/** Video and audio files already in the deck, and the way to add more. */
export function ClipsTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const assets = useDeck((state) => state.deck.assets);
  const clips = useMemo(() => Object.values(assets).filter(isClip), [assets]);

  const remove = (asset: AssetMeta) => {
    if (referencedAssetIds(editor.bus.deck).has(asset.id)) {
      void tell(t('clip.inUse'));
      return;
    }
    editor.bus.dispatch(
      { type: 'asset.remove', assetIds: [asset.id] },
      { label: t('clip.removed') },
    );
  };

  return (
    <TabBody testId="media-clips">
      <Button icon={Clapperboard} onClick={() => void insertClips(editor)}>
        {t('clip.upload')}
      </Button>
      {clips.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title={t('clip.emptyTitle')}
          description={t('clip.emptyBody')}
          className="min-h-64"
        />
      ) : (
        <Group title={t('clip.list')}>
          <div role="group" aria-label={t('clip.list')} className="flex flex-col gap-2">
            {clips.map((asset) => (
              <ClipTile key={asset.id} asset={asset} onRemove={() => remove(asset)} />
            ))}
          </div>
        </Group>
      )}
    </TabBody>
  );
}

function ClipTile({ asset, onRemove }: { asset: AssetMeta; onRemove: () => void }) {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const video = asset.kind === 'video';
  const name = asset.name || t(`clip.${video ? 'video' : 'audio'}`);
  const extension = name.match(/\.[^.]+$/)?.[0];
  const stem = extension ? name.slice(0, -extension.length) : name;
  const duration = asset.durationMs ? formatMoment(asset.durationMs / 1000) : undefined;

  return (
    <div className="group/tile relative flex min-w-0 items-center rounded-control border border-ui-line bg-ui-field transition-colors hover:border-ui-accent focus-within:border-ui-accent">
      <button
        type="button"
        aria-label={t('clip.insert', { name })}
        data-asset={asset.id}
        draggable
        onDragStart={(event) => startAssetDrag(event, asset.id)}
        onClick={() => {
          if (!insertAsset(editor, asset)) void tell(t('noSlide'));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Delete' && event.key !== 'Backspace') return;
          event.preventDefault();
          onRemove();
        }}
        className="flex min-w-0 flex-1 cursor-default items-center gap-3 rounded-control p-2 text-start focus-visible:-outline-offset-2"
      >
        <span
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-control',
            video
              ? 'bg-ui-tool-rose text-ui-tool-rose-fg'
              : 'bg-ui-tool-violet text-ui-tool-violet-fg',
          )}
        >
          <Icon icon={video ? Clapperboard : Volume2} className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className="flex min-w-0 items-baseline gap-0.5 text-sm font-medium text-ui-fg"
            title={name}
          >
            <span dir="auto" className="min-w-0 truncate">
              {stem}
            </span>
            {extension && (
              <span dir="ltr" className="shrink-0 text-ui-fg-muted">
                {extension}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ui-fg-muted">
            <span>{t(`clip.${video ? 'video' : 'audio'}`)}</span>
            {duration && <span dir="ltr">· {duration}</span>}
          </span>
        </span>
      </button>
      <IconButton
        icon={Trash2}
        size="sm"
        variant="secondary"
        label={t('clip.remove', { name })}
        data-remove-asset={asset.id}
        onClick={onRemove}
        className="me-2 shrink-0 bg-ui-raised opacity-0 shadow-raised group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
      />
    </div>
  );
}
