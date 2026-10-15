// Runs a TypeScript module of `packages/templates` through Vite (as export-designs.mjs does),
// calling its default export with the remaining arguments:
//   node tools/run-ts.mjs src/authoring/catalog.ts <out>        (from packages/templates)
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkg = fileURLToPath(new URL('../../../', import.meta.url));
const app = fileURLToPath(new URL('../../../../../apps/desktop/package.json', import.meta.url));
// A path is imported as a URL: on Windows a bare path reads as a URL whose scheme is its drive.
const { createServer } = await import(pathToFileURL(createRequire(app).resolve('vite')).href);
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
