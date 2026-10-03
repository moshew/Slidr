import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Images } from '@slidr/ui/icons';
import { Button, EmptyState } from '@slidr/ui';
import { insertImages } from '../objects/insert';
import { tell, useDeck, useEditor } from '../shell';
import { insertAsset } from './insert';
import { AssetTile, TabBody, TileGrid } from './parts';

/**
 * The deck's own pictures (SPEC 4.2, WG5-T13): what the user uploaded, dropped or pasted, and
 * what an imported file brought with it. Uploading puts the picture on the current slide, as the
 * Insert button does; a picture already in the deck is added to a slide again with a click.
 */
export function UploadsTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const assets = useDeck((s) => s.deck.assets);
  const pictures = useMemo(
    () =>
      Object.values(assets).filter(
        (asset) =>
          (asset.origin === 'upload' || asset.origin === 'import') &&
          (asset.kind === 'image' || asset.kind === 'svg'),
      ),
    [assets],
  );

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
        <TileGrid label={t('uploads.list')}>
          {pictures.map((asset) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              label={t('uploads.insert', {
                name: asset.name?.replace(/\.[^.]+$/, '') || t('uploads.unnamed'),
              })}
              onPick={() => {
                if (!insertAsset(editor, asset)) void tell(t('noSlide'));
              }}
            />
          ))}
        </TileGrid>
      )}
    </TabBody>
  );
}
