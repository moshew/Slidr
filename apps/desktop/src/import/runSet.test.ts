import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The runner of the import test set (ADR-036) reads four files of the user's from a folder it
 * is given, on any machine, and none from a path of one machine.
 */

const script = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/import/run-set.mjs');
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SLIDR_IMPORT_EXAMPLES: '', ...env },
    timeout: 20_000,
  }).stdout;

describe('the runner of the import test set', () => {
  it('names no folder of one machine', () => {
    expect(readFileSync(script, 'utf8')).not.toMatch(/[A-Z]:[\\/]|\/Users\/|\/home\//);
  });

  it("reads the user's files from the folder given by --examples", () => {
    const folder = mkdtempSync(join(tmpdir(), 'slidr-examples-'));
    const out = run(['--only', 'dapflow', '--examples', folder]);
    expect(out).toContain(`dapflow: missing (${join(folder, 'dapflow.html')})`);
  });

  it('or by SLIDR_IMPORT_EXAMPLES', () => {
    const folder = mkdtempSync(join(tmpdir(), 'slidr-examples-'));
    const out = run(['--only', 'devops'], { SLIDR_IMPORT_EXAMPLES: folder });
    expect(out).toContain(`devops: missing (${join(folder, 'devops.html')})`);
  });

  it('says how to give the folder when it was not given', () => {
    const out = run(['--only', 'devops']);
    expect(out).toMatch(/devops: skipped.*--examples.*SLIDR_IMPORT_EXAMPLES/);
  });
});
