import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/*
 * Authored content lives in the external Slidr-media directory beside the repository. Tauri
 * installs its active folders beside the executable as `media/`:
 *
 *   media/icons/lucide/*.json     the Lucide set: its drawings and its search words
 *   media/icons/tabler/*.json     the Tabler set: line and filled drawings, its search words
 *   media/icons/hebrew.json       the Hebrew search words of both sets
 *   media/images/templates/*.webp the photographs of the built-in templates
 *   media/images/designs/*.webp   the pictures of the ready-made slides of Elements
 *   media/fonts/<family>/*.woff2  the built-in fonts of decks
 *   media/templates/index.json    the built-in templates, by id, in the order they are shown
 *   media/templates/<id>/template.json   each of them: its theme, its master, its layouts
 *
 * The build generates individual template files from the external catalog. Imports of other
 * media files use `?url` or `?raw`: during development Vite reads the external files; in a
 * package this plugin returns an address under the core's media protocol. The active folders
 * are declared as bundle resources in `src-tauri/tauri.conf.json`.
 */

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

/** The place of an imported module in the media library; undefined when it is not media. */
export function mediaFile(id: string): (MediaFile & { source: string }) | undefined {
  const [source = '', query] = id.replace(/^\0+/, '').replaceAll('\\', '/').split('?');
  // Authored resources live in the media source beside the repository. Vite can import them
  // during development; in a package the same imports become URLs into the installed media.
  const external =
    /\/Slidr-media\/((?:elements|fonts|icons|images|templates)\/[a-zA-Z0-9_./-]+)$/.exec(source);
  if (external && (query === 'url' || query === 'raw')) {
    return { path: external[1]!, as: query === 'url' ? 'url' : 'text', source };
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

/** The module of the app that hands the built-in templates to its library. */
const TEMPLATES_MODULE = /\/src\/templates\/builtIn\.ts$/;

/** Whether an imported module exposes the built-in template catalog to the app. */
export function isTemplatesModule(id: string): boolean {
  return TEMPLATES_MODULE.test(id.replaceAll('\\', '/'));
}

/**
 * What `src/templates/builtIn.ts` becomes in a build: the templates read from the media
 * library, in the order of its index. A file that is missing or is not a template is said to
 * the console and left out: the app still opens, with the templates it could read.
 */
export function templatesModule(origin: string): string {
  return `import { Template } from '@slidr/templates';

const read = async (path) => {
  const response = await fetch(${JSON.stringify(`${origin}templates/`)} + path);
  if (!response.ok) throw new Error('The media library has no templates/' + path + ' (' + response.status + ').');
  return response.json();
};

const load = async () => {
  const ids = await read('index.json');
  const templates = await Promise.all(
    ids.map((id) =>
      read(id + '/template.json')
        .then((template) => Template.parse(template))
        .catch((error) => {
          console.error('The built-in template "' + id + '" could not be read', error);
          return undefined;
        }),
    ),
  );
  return templates.filter((template) => template !== undefined);
};

export const builtIn = await load().catch((error) => {
  console.error('The built-in templates could not be read', error);
  return [];
});
`;
}

/** The fields retained when the external catalog is split into installed template files. */
interface BuiltTemplate {
  theme: { id: string };
  sample?: unknown;
  assets?: unknown;
}

/**
 * The files of the templates folder, by their place in it. A template is written as a deck
 * takes it: without its sample slides and their pictures, which the app does not show.
 */
export function templateFiles(templates: readonly BuiltTemplate[]): Map<string, string> {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const files = new Map<string, string>();
  files.set('index.json', json(templates.map((template) => template.theme.id)));
  for (const { sample: _sample, assets: _assets, ...template } of templates) {
    files.set(`${template.theme.id}/template.json`, json(template));
  }
  return files;
}

export interface MediaLibraryOptions {
  /** The media source beside the repository, installed beside the executable. */
  dir: string;
}

export function mediaLibrary({ dir }: MediaLibraryOptions): Plugin {
  const origin = mediaOrigin();
  /** What the bundle asked for: place in the library, to the external source file. */
  const files = new Map<string, string>();
  let asksForTemplates = false;
  return {
    name: 'slidr:media-library',
    apply: 'build',
    // Before the bundler's own answer to `?url` and `?raw`.
    enforce: 'pre',
    buildStart() {
      files.clear();
      asksForTemplates = false;
    },
    load(id) {
      if (isTemplatesModule(id)) {
        asksForTemplates = true;
        return templatesModule(origin);
      }
      const file = mediaFile(id);
      if (!file) return null;
      files.set(file.path, file.source);
      return mediaModule(file, origin);
    },
    writeBundle() {
      for (const source of files.values()) {
        if (!existsSync(source)) throw new Error(`Missing media source: ${source}`);
      }
      let written = files.size;
      if (asksForTemplates) {
        const catalogFile = join(dir, 'templates', 'catalog.json');
        const catalog = JSON.parse(readFileSync(catalogFile, 'utf8')) as {
          templates: BuiltTemplate[];
        };
        for (const [path, text] of templateFiles(catalog.templates)) {
          const target = join(dir, 'templates', path);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, text);
          written += 1;
        }
      }
      this.info(`media library: ${written} files in ${dir}`);
    },
  };
}
