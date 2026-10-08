import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/*
 * The media library of the packaged app: the graphics the app offers (the icon sets, the
 * photographs of the built-in templates, the built-in fonts of decks) are not part of the
 * bundle, and so not part of the executable. A build writes them into a folder of their own,
 * which is installed beside the executable as `media/`:
 *
 *   media/icons/lucide/*.json     the Lucide set: its drawings and its search words
 *   media/icons/tabler/*.json     the Tabler set: line and filled drawings, its search words
 *   media/icons/hebrew.json       the Hebrew search words of both sets
 *   media/images/templates/*.webp the photographs of the built-in templates
 *   media/fonts/<family>/*.woff2  the built-in fonts of decks
 *
 * The code names these files where they live in the repository, as it always did: an import
 * with `?url` or `?raw`. In development and in the tests the bundler answers such an import
 * itself. In a build this plugin answers it: the import gives the file's address in the media
 * library (`?url`), or its text read from there when it is first asked for (`?raw`), and the
 * file is copied into the folder. The core serves the folder under that address
 * (`src-tauri/src/media_dir.rs`), so where the folder is, is decided there and nowhere else.
 */

/** The subfolders a build writes, and empties first. */
const FOLDERS = ['icons', 'images', 'fonts'] as const;

/**
 * Where the pages of the app reach the media library: the address of the core's `media`
 * protocol, which is spelled as WebView2 spells a custom protocol on Windows.
 */
export function mediaOrigin(platform = process.env.TAURI_ENV_PLATFORM ?? process.platform): string {
  return /^win/.test(platform) || platform === 'android'
    ? 'http://media.localhost/'
    : 'media://localhost/';
}

export interface MediaFile {
  /** The file's place in the media library, e.g. `fonts/heebo/heebo-hebrew-wght-normal.woff2`. */
  path: string;
  /** How the import reads it: as an address, or as its text. */
  as: 'url' | 'text';
}

const RULES: readonly [
  query: 'url' | 'raw',
  file: RegExp,
  path: (match: RegExpExecArray) => string,
][] = [
  [
    'url',
    /\/node_modules\/@fontsource(?:-variable)?\/([a-z0-9-]+)\/files\/([a-z0-9-]+\.woff2)$/,
    ([, family, file]) => `fonts/${family}/${file}`,
  ],
  [
    'url',
    /\/docs\/reference-decks\/images\/([a-z0-9-]+\.webp)$/,
    ([, file]) => `images/templates/${file}`,
  ],
  [
    'raw',
    /\/node_modules\/lucide-static\/((?:icon-nodes|tags)\.json)$/,
    ([, file]) => `icons/lucide/${file}`,
  ],
  [
    'raw',
    /\/node_modules\/@tabler\/icons\/([a-z0-9-]+\.json)$/,
    ([, file]) => `icons/tabler/${file}`,
  ],
  ['raw', /\/src\/media\/icons\/(hebrew\.json)$/, ([, file]) => `icons/${file}`],
];

/** The place of an imported module in the media library; undefined when it is not media. */
export function mediaFile(id: string): (MediaFile & { source: string }) | undefined {
  const [source = '', query] = id.replace(/^\0+/, '').replaceAll('\\', '/').split('?');
  for (const [wanted, file, path] of RULES) {
    if (query !== wanted) continue;
    const match = file.exec(source);
    if (match) return { path: path(match), as: wanted === 'url' ? 'url' : 'text', source };
  }
  return undefined;
}

/** The module an import of a media file becomes in a build. */
export function mediaModule(file: MediaFile, origin: string): string {
  const url = JSON.stringify(origin + file.path);
  if (file.as === 'url') return `export default ${url};\n`;
  return [
    `const response = await fetch(${url});`,
    `if (!response.ok) throw new Error('The media library has no ' + ${JSON.stringify(file.path)} + ' (' + response.status + ').');`,
    'export default await response.text();',
    '',
  ].join('\n');
}

export interface MediaLibraryOptions {
  /** The folder the build writes: the one `tauri.conf.json` installs beside the executable. */
  dir: string;
}

export function mediaLibrary({ dir }: MediaLibraryOptions): Plugin {
  const origin = mediaOrigin();
  /** What the bundle asked for: place in the library, to the file in the repository. */
  const files = new Map<string, string>();
  return {
    name: 'slidr:media-library',
    apply: 'build',
    // Before the bundler's own answer to `?url` and `?raw`.
    enforce: 'pre',
    buildStart() {
      files.clear();
    },
    load(id) {
      const file = mediaFile(id);
      if (!file) return null;
      files.set(file.path, file.source);
      return mediaModule(file, origin);
    },
    writeBundle() {
      for (const folder of FOLDERS) rmSync(join(dir, folder), { recursive: true, force: true });
      for (const [path, source] of files) {
        const target = join(dir, path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
      this.info(`media library: ${files.size} files in ${dir}`);
    },
  };
}
