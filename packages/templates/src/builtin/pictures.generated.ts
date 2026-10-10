import type { AssetMeta } from '@slidr/model';
import source from '../../../../../Slidr-media/templates/catalog.json?raw';

export const pictures = (JSON.parse(source) as { pictures: Record<string, AssetMeta> }).pictures;
