// TEMPORARY review harness (not part of the app): what each template source draws today, written
// where the dev pages /dev/zz-tpl.html and /dev/zz-switch.html read it. Nothing in Slidr-media
// is written.
//   node scripts/zz-probe-templates.mjs <id> ... [--source <dir>] [--out <name>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(desktop, '..');
const media = resolve(repo, '..', 'Slidr-media');
const builtin = join(repo, 'packages', 'templates', 'src', 'builtin');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const source = resolve(option('--source') ?? join(media, 'archive', 'templates-source'));
const out = join(desktop, 'test-results', 'templates', option('--out') ?? 'zz-probe');
const ids = args.filter((arg, i) => !arg.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const BESIDE = new Set(['./kit', './contract', './pictures.generated']);
const server = await createServer({
  configFile: false,
  root: desktop,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
  plugins: [
    {
      name: 'names-from-the-package',
      enforce: 'pre',
      async resolveId(id, importer, options) {
        if (!importer || id.startsWith('\0')) return null;
        const from = importer.split('?')[0].split('/').join(sep);
        if (!from.startsWith(source + sep)) return null;
        if (BESIDE.has(id)) return join(builtin, `${id.slice(2)}.ts`);
        if (id.startsWith('../')) return join(builtin, '..', `${id.slice(3)}.ts`);
        if (/^[./]/.test(id) || /^[a-zA-Z]:[\\/]/.test(id)) return null;
        return this.resolve(id, join(desktop, 'src', 'main.tsx'), { ...options, skipSelf: true });
      },
    },
  ],
});
let failed = 0;
try {
  const kit = await server.ssrLoadModule(join(builtin, 'kit.ts'));
  const { contractGaps } = await server.ssrLoadModule(join(builtin, 'contract.ts'));
  const { withStandardLayouts } = await server.ssrLoadModule(
    join(builtin, '..', 'standardLayouts.ts'),
  );
  const { Template } = await server.ssrLoadModule(join(builtin, '..', 'template.ts'));
  mkdirSync(out, { recursive: true });
  for (const id of ids) {
    try {
      const module = await server.ssrLoadModule(join(source, `${id}.ts`));
      const template = withStandardLayouts(module[`${id}Template`]());
      const samples = module[`${id}Samples`];
      const problems = [];
      const parsed = Template.safeParse(template);
      if (!parsed.success)
        problems.push(`not a template: ${JSON.stringify(parsed.error.issues[0])}`);
      problems.push(...template.layouts.flatMap(contractGaps));
      for (const lang of ['he', 'en']) {
        try {
          kit.sampleSlides(template, samples[lang], { dir: lang === 'he' ? 'rtl' : 'ltr', lang });
        } catch (error) {
          problems.push(`${lang}: ${error.message}`);
        }
      }
      writeFileSync(join(out, `${id}.json`), JSON.stringify({ template, samples }));
      console.log(`${id}: he ${samples.he.length}, en ${samples.en.length}`);
      if (problems.length) {
        failed += problems.length;
        console.error(`${id} PROBLEMS:\n  ${problems.join('\n  ')}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`${id} FAILED: ${error.stack ?? error}`);
    }
  }
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
