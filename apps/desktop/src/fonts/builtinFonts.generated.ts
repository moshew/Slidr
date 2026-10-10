import source from '../../../../../Slidr-media/fonts/catalog.json?raw';

export interface BuiltinFace {
  family: string;
  style: string;
  weight: string;
  url: string;
  unicodeRange?: string;
}

interface MediaFace extends Omit<BuiltinFace, 'url'> {
  path: string;
}

const catalog = JSON.parse(source) as {
  families: { family: string; scripts: string[] }[];
  faces: MediaFace[];
};
const files = import.meta.glob<string>('../../../../../Slidr-media/fonts/**/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
});
const prefix = '../../../../../Slidr-media/';

export const builtinFamilies = catalog.families;
export const builtinFaces: BuiltinFace[] = catalog.faces.map(({ path, ...face }) => {
  const url = files[`${prefix}${path}`];
  if (!url) throw new Error(`Missing built-in font in media: ${path}`);
  return { ...face, url };
});
