import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { invoke, launchApp, showPanel, watchProblems, workspaces, type RunningApp } from './app';

/*
 * What the ADRs from 027 on wrote down as never run in a production build (WG13-T05), run in
 * one: the fonts when the app is served from `dist/`, the scripted agent of the dev page leaving
 * the bundle, the capture window's page, the chart library's chunks, and a file of the workspace
 * read over the asset protocol.
 *
 * The app is started with `SLIDR_AGENT_MOCK` set, which offers the scripted harness that is
 * compiled into the core: its turns make real tool calls through the tool bridge, so a slide is
 * built here the way an agent builds one, without a CLI and without cost.
 */

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SCRIPTS = fileURLToPath(
  new URL('../src-tauri/src/harness/fixtures/scripts/', import.meta.url),
);

let app: RunningApp;
let problems: string[];

test.beforeAll(async () => {
  app = await launchApp({ env: { SLIDR_AGENT_MOCK: '1' } });
  problems = watchProblems(app.page);
});

test.afterAll(async () => {
  await app?.kill();
});

test.describe.configure({ mode: 'serial' });

/** The addresses the page has asked for since it loaded. */
const requested = (page: Page) =>
  page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));

test('the bundle holds no scripted agent, no dev page and no editor handle', async () => {
  // The editor is handed to the window in development only. (The text `window.slidr=` is in the
  // bundle all the same: it is the player's own name inside the script of an exported file.)
  expect(await app.page.evaluate(() => 'slidr' in window)).toBe(false);
  // Every script the dev page's mock plays has a description nobody else writes.
  const markers = readdirSync(SCRIPTS)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const script = JSON.parse(readFileSync(join(SCRIPTS, name), 'utf8')) as {
        description: string;
      };
      return script.description.slice(0, 60);
    });
  expect(markers.length).toBeGreaterThan(5);
  const assets = readdirSync(join(DIST, 'assets')).filter((name) => name.endsWith('.js'));
  for (const name of assets) {
    const code = readFileSync(join(DIST, 'assets', name), 'utf8');
    for (const marker of markers) expect(code.includes(marker), `${name}: ${marker}`).toBe(false);
  }
  // The three pages of the app (the editor's, the capture window's, the import window's), their
  // files, and the notices: no dev page was built.
  expect(readdirSync(DIST).sort()).toEqual([
    'THIRD-PARTY-NOTICES.txt',
    'assets',
    'capture.html',
    'favicon.svg',
    'import.html',
    'index.html',
  ]);
});

test('the app carries the licences of what it is built from, and shows them', async () => {
  const { page } = app;
  await showPanel(page, 'settings');
  const about = page.locator('[data-settings-section="about"]');
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByTestId('about-version')).toContainText(/\d+\.\d+\.\d+/);
  await about.getByTestId('about-licenses').click();
  const text = page.getByTestId('licenses-text');
  await expect(text).toContainText('third-party notices');
  const notices = (await text.textContent()) ?? '';
  // What the ADRs named as owed a notice: the chart library and what it draws with (ADR-048),
  // the two icon sets (ADR-051), the font subsetting (ADR-032), and the built-in fonts.
  for (const name of [
    'echarts ',
    'zrender ',
    'lucide-static ',
    '@tabler/icons ',
    'harfbuzzjs ',
    'woff2-encoder ',
    '@fontsource-variable/heebo ',
    '@fontsource-variable/inter ',
    '@fontsource/alef ',
  ]) {
    expect(notices, name).toContain(`\n${name}`);
  }
  expect(notices).toMatch(/In the interface: libraries, fonts and icons \(\d{3}\)/);
  // The crates of the core were listed too: Cargo was there when the app was built.
  expect(notices).toMatch(/In the core: Rust crates \(\d{3}\)/);
  expect(notices).toContain('\ntauri ');
  expect(notices).toContain('Apache License');
  expect(notices).toContain('SIL OPEN FONT LICENSE');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('licenses-dialog')).toHaveCount(0);
  // Back to the deck's chat, where the next test writes.
  await showPanel(page, 'ai');
  await expect(page.getByTestId('chat-input')).toBeVisible();
});

test('the fonts of the app and of decks are served from the bundle', async () => {
  const { page } = app;
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts];
    // A face of a deck font that nothing on screen uses yet: loading it reads its file.
    const rubik = faces.find((face) => face.family.includes('Rubik'));
    await rubik?.load();
    const loaded = new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family));
    return { count: faces.length, loaded: [...loaded].sort(), rubik: rubik?.status };
  });
  expect(fonts.count).toBeGreaterThan(150);
  // The two the interface is set in, and the one that was asked for.
  expect(fonts.loaded).toEqual(expect.arrayContaining(['Heebo Variable', 'Inter Variable']));
  expect(fonts.rubik).toBe('loaded');
  const woff = (await requested(page)).filter((url) => url.endsWith('.woff2'));
  expect(woff.length).toBeGreaterThan(2);
  for (const url of woff) expect(url).toMatch(/^http:\/\/tauri\.localhost\/assets\//);
});

test('the scripted harness is offered because it was asked for', async () => {
  const harnesses = await invoke<{ id: string }[]>(app.page, 'agent_harnesses');
  expect(harnesses.map((harness) => harness.id)).toEqual(['claude-code', 'mock']);
});

test('a turn builds a slide: the bridge, the capture window, the conversion and its fonts', async () => {
  const { page } = app;
  await page.evaluate(() =>
    localStorage.setItem('slidr.agent', JSON.stringify({ harnessId: 'mock', model: 'deck-build' })),
  );
  await showPanel(page, 'ai');
  const input = page.getByTestId('chat-input');
  await input.fill('מצגת על תוכנית העבודה');
  await input.press('Enter');
  const turn = page.getByTestId('chat-assistant').first();
  await expect(turn).toHaveAttribute('data-outcome', 'completed', { timeout: 60_000 });
  await expect(turn.getByTestId('tool-chip')).toHaveAttribute('data-state', 'ok');

  // The HTML became objects of the model, with its text as text: the conversion found, in a
  // frame of its own, the fonts the page had registered, and the picture it compared against
  // was taken in the capture window.
  const stage = page.getByTestId('stage-frame');
  await expect(stage.locator('[data-element-type="text"]')).toHaveCount(3);
  await expect(stage.locator('[data-element-type="html"]')).toHaveCount(0);
  await expect(stage).toContainText('תוכנית העבודה לשנת 2027');
  // The capture window shows the app's own capture page, from where the app itself is served.
  expect(app.capturePage()?.url()).toBe(new URL('/capture.html', page.url()).href);
});

test('a slide is captured as a PNG of the size asked for', async () => {
  const { page } = app;
  // The deck as the app keeps it: the autosave writes it a few seconds after a change.
  await expect
    .poll(() => workspaces().find((w) => w.deck)?.deck ?? null, { timeout: 15_000 })
    .not.toBeNull();
  const workspace = workspaces().find((w) => w.deck)!;
  const deck = workspace.deck as { slides: { elements: unknown[] }[] };
  const built = deck.slides.find((slide) => slide.elements.length > 0)!;
  const png = await page.evaluate(
    async ({ request, width }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (command: string, args: unknown) => Promise<ArrayBuffer> };
        }
      ).__TAURI_INTERNALS__;
      const bytes = new Uint8Array(await internals.invoke('capture_slide', { request, width }));
      const view = new DataView(bytes.buffer);
      return {
        signature: [...bytes.subarray(1, 4)].map((b) => String.fromCharCode(b)).join(''),
        width: view.getUint32(16),
        height: view.getUint32(20),
        bytes: bytes.length,
      };
    },
    { request: { deck: { ...deck, slides: [built] }, workspaceId: workspace.id }, width: 960 },
  );
  expect(png).toMatchObject({ signature: 'PNG', width: 960, height: 540 });
  expect(png.bytes).toBeGreaterThan(5_000);
});

test('the chart library is fetched when the first chart is drawn, not before', async () => {
  const { page } = app;
  const engine = (urls: string[]) => urls.filter((url) => /\/assets\/engine-[^/]+\.js$/.test(url));
  expect(engine(await requested(page))).toEqual([]);
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'גרף', exact: true }).click();
  await page.getByRole('group', { name: 'סוגי גרפים' }).getByRole('button').first().click();
  await expect(
    page.getByTestId('stage-frame').locator('[data-element-type="chart"] svg'),
  ).toBeVisible();
  expect(engine(await requested(page))).toHaveLength(1);
});

test('a file of the workspace is read over the asset protocol', async () => {
  const { page } = app;
  const workspace = workspaces()[0]!;
  // A 1x1 PNG, stored as a pasted picture is.
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const read = await page.evaluate(
    async ({ base64, workspaceId, dir }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
              args: unknown,
              options?: unknown,
            ) => Promise<{ file: string }>;
            convertFileSrc: (path: string, protocol?: string) => string;
          };
        }
      ).__TAURI_INTERNALS__;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const asset = await internals.invoke('asset_import_bytes', bytes, {
        headers: { 'x-workspace-id': workspaceId, 'x-file-name': 'dot.png' },
      });
      const url = internals.convertFileSrc(`${dir}/assets/${asset.file}`);
      // As the app reads an asset's bytes: to export it, to copy it, to keep a template's logo.
      const response = await fetch(url);
      const body = new Uint8Array(await response.arrayBuffer());
      // And as it shows one.
      const image = new Image();
      image.src = url;
      await image.decode();
      return {
        url,
        status: response.status,
        same: body.length === bytes.length,
        width: image.naturalWidth,
      };
    },
    { base64: png, workspaceId: workspace.id, dir: workspace.dir },
  );
  expect(read.url).toMatch(/^http:\/\/asset\.localhost\//);
  expect(read).toMatchObject({ status: 200, same: true, width: 1 });
});

test('nothing was reported to the console along the way', () => {
  expect(problems).toEqual([]);
});
