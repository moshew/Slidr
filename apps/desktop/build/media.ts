import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runnerImport, type Plugin } from 'vite';

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
 *   media/templates/index.json    the built-in templates, by id, in the order they are shown
 *   media/templates/<id>/template.json   each of them: its theme, its master, its layouts
 *
 * The templates are code (`@slidr/templates/builtin`), not files: the build runs that code and
 * writes what it makes, and the app reads the files in its place (`templatesModule`, below).
 *
 * The code names these files where they live in the repository, as it always did: an import
 * with `?url` or `?raw`. In development and in the tests the bundler answers such an import
 * itself. In a build this plugin answers it: the import gives the file's address in the media
 * library (`?url`), or its text read from there when it is first asked for (`?raw`), and the
 * file is copied into the folder. The core serves the folder under that address
 * (`src-tauri/src/media_dir.rs`), so where the folder is, is decided there and nowhere else.
 */

/** The subfolders a build writes, and empties first. */
const FOLDERS = ['icons', 'images', 'fonts', 'templates'] as const;

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

/** The module of the app that hands the built-in templates to its library. */
const TEMPLATES_MODULE = /\/src\/templates\/builtIn\.ts$/;

/** Whether an imported module is the one that makes the built-in templates from their code. */
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

/** A template as the code makes it: what of it the files keep is decided in `templateFiles`. */
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
  /** The folder the build writes: the one `tauri.conf.json` installs beside the executable. */
  dir: string;
  /** The module whose `builtInTemplates()` makes the templates the app ships with. */
  templates: string;
}

export function mediaLibrary({ dir, templates }: MediaLibraryOptions): Plugin {
  const origin = mediaOrigin();
  /** What the bundle asked for: place in the library, to the file in the repository. */
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
    async writeBundle() {
      for (const folder of FOLDERS) rmSync(join(dir, folder), { recursive: true, force: true });
      for (const [path, source] of files) {
        const target = join(dir, path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
      let written = files.size;
      if (asksForTemplates) {
        // The templates are code: it is run here, once, and what it makes is what is written.
        const { module } = await runnerImport<{ builtInTemplates(): BuiltTemplate[] }>(templates, {
          configFile: false,
          logLevel: 'error',
        });
        for (const [path, text] of templateFiles(module.builtInTemplates())) {
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
