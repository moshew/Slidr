// Runs a TypeScript module of `packages/templates` through Vite (as export-designs.mjs does),
// calling its default export with the remaining arguments:
//   node tools/run-ts.mjs src/authoring/catalog.ts <out>        (from packages/templates)
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('../../../', import.meta.url));
const app = fileURLToPath(new URL('../../../../../apps/desktop/package.json', import.meta.url));
const { createServer } = await import(createRequire(app).resolve('vite'));
const [entry, ...args] = process.argv.slice(2);
const server = await createServer({
  configFile: false,
  root: pkg,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
});
try {
  const mod = await server.ssrLoadModule(resolve(entry));
  await mod.default(...args);
} finally {
  await server.close();
}
