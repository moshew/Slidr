import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import capability from '../src-tauri/capabilities/default.json';

/*
 * The evaluation's runner drives the real window, where a call to a plugin of the framework is
 * refused unless the window's capability lists it (SEC-05, ADR-066). The app's own commands need
 * no permission. The runner once asked the path plugin for the data folder, and stopped at its
 * first step when the capabilities were cut down to what the app itself calls: nothing in the
 * regular checks runs it. What it asks the window for is held to the capability here.
 */

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const SOURCES = { 'page.ts': read('./page.ts'), 'scripts/run.mjs': read('./scripts/run.mjs') };

/** The permissions the main window has, as the capability names them. */
const allowed = new Set(
  capability.permissions.map((permission) =>
    typeof permission === 'string' ? permission : permission.identifier,
  ),
);

/** `plugin:path|resolve_directory` as the permission that allows it: `core:path:allow-resolve-directory`. */
function permissionOf(plugin: string, command: string): string {
  const core = ['path', 'event', 'window', 'webview', 'app', 'image', 'menu', 'tray', 'resources'];
  const owner = core.includes(plugin) ? `core:${plugin}` : plugin;
  return `${owner}:allow-${command.replaceAll('_', '-')}`;
}

describe('the evaluation runner, in the real window', () => {
  it.each(Object.entries(SOURCES))('%s calls no plugin the window may not call', (_, source) => {
    const calls = [...source.matchAll(/plugin:([a-z-]+)\|([a-z_]+)/g)];
    const refused = calls
      .map(([, plugin = '', command = '']) => permissionOf(plugin, command))
      .filter((permission) => !allowed.has(permission));
    expect(refused).toEqual([]);
  });

  it.each(Object.entries(SOURCES))(
    '%s takes from the framework only the call of a command',
    (_, source) => {
      // Every other module of the API is a plugin behind a permission (`path`, `window`, `event`).
      const modules = [...source.matchAll(/from '@tauri-apps\/api\/([a-z-]+)'/g)].map(
        ([, module]) => module,
      );
      expect(modules.filter((module) => module !== 'core')).toEqual([]);
    },
  );

  it('asks for the data folder through a command of the app, before anything is written', () => {
    const run = SOURCES['scripts/run.mjs'];
    const ask = run.indexOf("invoke('agent_diagnostics_read'");
    expect(ask).toBeGreaterThan(-1);
    // On the page the window opens on, before the app's own page is loaded.
    expect(ask).toBeLessThan(run.indexOf('await page.goto(APP_URL)'));
  });
});
