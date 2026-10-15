// Prints, as one JSON object, the instructions the app gives its design agent
// (`packages/prompts`), so the management server builds its prompts from the app's own text and
// never from a copy of it:
//
//   node management/web/tools/instructions.mjs
//   → { "design": "## Design guidelines …", "html": "## Writing a slide as HTML …", "sources": [...] }
//
// The modules are TypeScript that import the app's packages by name, so Vite loads them, as
// `apps/desktop/scripts/export-designs.mjs` loads the design packs.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const prompts = join(repo, 'packages', 'prompts');

const server = await createServer({
  configFile: false,
  root: prompts,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
});

try {
  const { DESIGN } = await server.ssrLoadModule(join(prompts, 'src', 'design.ts'));
  const { HTML_CONVENTIONS } = await server.ssrLoadModule(join(prompts, 'src', 'html.ts'));
  process.stdout.write(
    JSON.stringify({
      design: DESIGN,
      html: HTML_CONVENTIONS,
      sources: ['packages/prompts/src/design.ts', 'packages/prompts/src/html.ts'],
    }),
  );
} finally {
  await server.close();
}
