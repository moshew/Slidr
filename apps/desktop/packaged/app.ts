import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Browser, type Page } from '@playwright/test';

/*
 * The packaged app, started and driven from a test (WG13-T02, ADR-066): the `slidr.exe` that
 * `tauri build` made, its WebView2 reached over the DevTools protocol.
 *
 * The app is built with an identifier of its own (`e2e/hardening.tauri.conf.json`), so its data
 * is `%APPDATA%\dev.slidr.app.hardening` and the user's `dev.slidr.app` is never touched. The
 * identifier is compiled into the binary, and `launchApp` refuses a binary that carries another.
 *
 * `window.slidr` does not exist in a production build. What a test does, it does as a user
 * would: through the page. What it checks beyond the page, it reads from the files the app wrote.
 */

export const IDENTIFIER = 'dev.slidr.app.hardening';
const CDP_PORT = Number(process.env.SLIDR_CDP_PORT) || 9371;
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

/** The binary under test: the release build of this worktree, unless `SLIDR_APP_EXE` names one. */
export function appBinary(): string {
  return process.env.SLIDR_APP_EXE ?? join(REPO, 'target', 'release', 'slidr.exe');
}

/** Where the app under test keeps its data: workspaces, settings, the agent's session folders. */
export function dataDir(): string {
  const roaming = process.env.APPDATA;
  if (!roaming) throw new Error('APPDATA is not set: the packaged app runs on Windows.');
  return join(roaming, IDENTIFIER);
}

export interface LaunchOptions {
  /** Extra environment of the app's process (`SLIDR_AGENT_MOCK`, …). */
  env?: Record<string, string>;
  /** Keep the workspaces a previous run left, so the app offers to recover them. */
  keepWorkspaces?: boolean;
  /** Extra arguments of the WebView2 browser process. */
  browserArgs?: string[];
}

export interface RunningApp {
  browser: Browser;
  /** The main window's page. */
  page: Page;
  process: ChildProcess;
  /** When the process was started: milliseconds since the epoch, as the page's clock counts. */
  startedAt: number;
  /** The page of the capture window, once the app has opened one. */
  capturePage(): Page | undefined;
  /** Ends the app as a crash would: the process is killed, nothing is asked. */
  kill(): Promise<void>;
}

function assertIdentifier(binary: string): void {
  if (!existsSync(binary)) {
    throw new Error(
      `${binary} does not exist. Build it first:\n` +
        '  pnpm --filter @slidr/desktop tauri build --config e2e/hardening.tauri.conf.json',
    );
  }
  // The identifier decides the data folder, and is fixed when the binary is built.
  if (!readFileSync(binary).includes(Buffer.from(IDENTIFIER, 'utf8'))) {
    throw new Error(
      `${binary} was not built with the identifier ${IDENTIFIER}: it would write into another ` +
        "copy's data. Build it with --config e2e/hardening.tauri.conf.json.",
    );
  }
}

async function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`The app did not open port ${port} in time.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function cdpFree(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    return false;
  } catch {
    return true;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits, from outside, until the app has started its document. A debugger that attaches while
 * the page is still loading makes the page's calls to the core fall back from requests to
 * messages (found on 2026-10-04: after an early attach no call crossed the network again), and
 * `answerDialog` answers requests. So nothing attaches before the first workspace is on disk.
 */
async function started(leftovers: boolean): Promise<void> {
  const root = join(dataDir(), 'workspaces');
  const deadline = Date.now() + 30_000;
  // With leftovers the app stops at the recovery dialog, and makes no workspace until answered.
  while (!leftovers && Date.now() < deadline) {
    const made =
      existsSync(root) &&
      readdirSync(root).some((id) => existsSync(join(root, id, '.workspace.json')));
    if (made) break;
    await sleep(25);
  }
  await sleep(leftovers ? 1500 : 250);
}

/** Starts the packaged app and connects to its main window. */
export async function launchApp(options: LaunchOptions = {}): Promise<RunningApp> {
  const binary = appBinary();
  assertIdentifier(binary);
  if (!(await cdpFree(CDP_PORT))) {
    throw new Error(
      `Port ${CDP_PORT} already answers: another copy of the app under test is running.`,
    );
  }
  if (!options.keepWorkspaces) {
    // Leftovers of an earlier run would open the recovery dialog over the app.
    rmSync(join(dataDir(), 'workspaces'), { recursive: true, force: true });
  }
  const browserArgs = [`--remote-debugging-port=${CDP_PORT}`, ...(options.browserArgs ?? [])];
  const startedAt = Date.now();
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArgs.join(' '),
      ...options.env,
    },
    stdio: 'ignore',
    detached: false,
  });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  try {
    await waitForCdp(CDP_PORT, 30_000);
    await started(Boolean(options.keepWorkspaces));
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('The app has no browser context.');
    const isMain = (page: Page) => !page.url().includes('capture.html');
    const page = context.pages().find(isMain) ?? (await context.waitForEvent('page'));
    await page.waitForSelector('[data-testid="stage"], [role="dialog"]', { timeout: 30_000 });
    // The window may open behind the one the user works in; keys reach a page only while it
    // believes it has the focus. The desktop itself is never sent a key.
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    return {
      browser,
      page,
      process: child,
      startedAt,
      capturePage: () => context.pages().find((p) => !isMain(p)),
      kill: async () => {
        await browser.close().catch(() => undefined);
        if (child.exitCode === null) child.kill();
        await exited;
        // The WebView2 processes let go of the port a moment after their parent.
        const deadline = Date.now() + 10_000;
        while (!(await cdpFree(CDP_PORT)) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

/**
 * Answers the next native file dialog of the app, which cannot be driven: the dialog's request
 * to the core is answered on its way out with `path` (null: the user cancelled), and no dialog
 * shows. Everything else of the app runs as it is. The app's own `invoke` cannot be replaced
 * (the property is not writable), so the answer is given where the request travels.
 */
export async function answerDialog(
  page: Page,
  kind: 'open' | 'save',
  path: string | null,
): Promise<void> {
  await page.route(
    // A pattern, not a string: a string is a glob, and the encoded name does not survive one.
    new RegExp(`^http://ipc\\.localhost/plugin%3Adialog%7C${kind}$`),
    (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'Tauri-Response': 'ok',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'Tauri-Response',
        },
        body: JSON.stringify(path),
      }),
    { times: 1 },
  );
}

/**
 * What the page complains about from now on: console errors (a missing string is one, and so is
 * a request the content policy refused) and uncaught exceptions. A spec checks it is empty.
 */
/**
 * Shows a panel of the Tool Panel. The app remembers which panel was showing, between runs
 * too, and the button of the panel that is showing closes it: so the button is pressed only
 * when another panel, or none, is showing. A suite cannot know what the one before it left.
 */
export async function showPanel(page: Page, panel: string): Promise<void> {
  const button = page.getByTestId('activity-bar').locator(`[data-panel="${panel}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  return problems;
}

/** Calls a command of the app from its main window, as the app's own code does. */
export async function invoke<T>(page: Page, command: string, args?: unknown): Promise<T> {
  const result = await page.evaluate(
    ({ name, payload }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      return internals.invoke(name, payload);
    },
    { name: command, payload: args },
  );
  return result as T;
}

/** The workspaces on disk, each with the deck it holds, when it holds one. */
export function workspaces(): { id: string; dir: string; deck: unknown }[] {
  const root = join(dataDir(), 'workspaces');
  if (!existsSync(root)) return [];
  return readdirSync(root).map((id) => {
    const dir = join(root, id);
    const file = join(dir, 'deck.json');
    const deck: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    return { id, dir, deck };
  });
}
