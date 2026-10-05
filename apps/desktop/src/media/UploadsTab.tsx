import { referencedAssetIds, type AssetMeta } from '@slidr/model';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Images } from '@slidr/ui/icons';
import { Button, EmptyState } from '@slidr/ui';
import { insertImages } from '../objects/insert';
import { tell, useDeck, useEditor } from '../shell';
import { insertAsset } from './insert';
import { AssetTile, ReplaceHint, TabBody, TileGrid } from './parts';
import { offersReplace, replaceSelected, useSelectedPicture } from './replace';

/**
 * The deck's own pictures (SPEC 4.2, WG5-T13): what the user uploaded, dropped or pasted, and
 * what an imported file brought with it. Uploading puts the picture on the current slide, as the
 * Insert button does; a picture already in the deck is added to a slide again with a click, and
 * one the deck no longer uses can be taken out of it. While a picture is selected on the Stage,
 * a tile also offers its own picture in that one's place.
 */
export function UploadsTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const assets = useDeck((s) => s.deck.assets);
  const picture = useSelectedPicture();
  const pictures = useMemo(
    () =>
      Object.values(assets).filter(
        (asset) =>
          (asset.origin === 'upload' || asset.origin === 'import') &&
          (asset.kind === 'image' || asset.kind === 'svg'),
      ),
    [assets],
  );

  /**
   * Takes a picture out of the deck, as one undo step. One the deck still uses is refused with
   * the reason (`asset.remove`): it is looked up when asked, not on every change of the deck.
   */
  const remove = (asset: AssetMeta) => {
    if (referencedAssetIds(editor.bus.deck).has(asset.id)) {
      void tell(t('uploads.inUse'));
      return;
    }
    editor.bus.dispatch(
      { type: 'asset.remove', assetIds: [asset.id] },
      { label: t('uploads.removed') },
    );
  };

  const nameOf = (asset: AssetMeta) => asset.name?.replace(/\.[^.]+$/, '') || t('uploads.unnamed');

  return (
    <TabBody testId="media-uploads">
      <Button icon={ImageUp} onClick={() => void insertImages(editor)}>
        {t('uploads.upload')}
      </Button>
      {pictures.length === 0 ? (
        <EmptyState
          icon={Images}
          title={t('uploads.emptyTitle')}
          description={t('uploads.emptyBody')}
          className="min-h-64"
        />
      ) : (
        <>
          <ReplaceHint shown={picture !== undefined} />
          <TileGrid label={t('uploads.list')}>
            {pictures.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                label={t('uploads.insert', { name: nameOf(asset) })}
                onPick={() => {
                  if (!insertAsset(editor, asset)) void tell(t('noSlide'));
                }}
                replace={
                  offersReplace(picture, asset.id)
                    ? {
                        label: t('replace', { name: nameOf(asset) }),
                        onReplace: () => replaceSelected(editor, picture, asset),
                      }
                    : undefined
                }
                remove={{
                  label: t('uploads.remove', { name: nameOf(asset) }),
                  onRemove: () => remove(asset),
                }}
              />
            ))}
          </TileGrid>
        </>
      )}
    </TabBody>
  );
}
