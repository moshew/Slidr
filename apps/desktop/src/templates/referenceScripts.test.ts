import { spawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The scripts of the reference decks (docs/reference-decks/scripts, ADR-039): the ledger of
 * picture generations keeps the record of every run when several run at once, and the index
 * page is the same file when it is built twice from the same templates.
 */

const scripts = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/reference-decks/scripts',
);
const load = <T>(name: string) =>
  import(/* @vite-ignore */ pathToFileURL(join(scripts, name)).href) as Promise<T>;

type FileSystem = typeof nodeFs;
type Ledger = {
  record: (file: string, entry: unknown, fs?: FileSystem) => Promise<number>;
  readLedger: (file: string) => unknown[];
};

/**
 * A process of its own that adds one record, as one run of picture.mjs does. Resolves with what
 * the process said if it failed, and with nothing if it did not.
 */
const recordElsewhere = (file: string, name: string) =>
  new Promise<string | undefined>((resolve) => {
    const code = `import(${JSON.stringify(pathToFileURL(join(scripts, 'ledger.mjs')).href)}).then((l) => l.record(${JSON.stringify(file)}, { name: ${JSON.stringify(name)} }))`;
    const run = spawn(process.execPath, ['--input-type=module', '-e', code], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let said = '';
    run.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
    run.on('close', (status) =>
      resolve(status === 0 ? undefined : `${name} ended with ${status}: ${said.trim()}`),
    );
  });

const failure = (code: string) => Object.assign(new Error(code), { code });

describe('the ledger of picture generations', () => {
  // Twelve processes start at once, on a machine that may be busy with a whole test run: the
  // time is for them to start, not for the ledger, which takes each of them a few milliseconds.
  it('keeps every record when several runs write it at once', async () => {
    const { readLedger } = await load<Ledger>('ledger.mjs');
    const file = join(mkdtempSync(join(tmpdir(), 'slidr-ledger-')), 'ledger.json');
    const names = Array.from({ length: 12 }, (_, i) => `picture-${i}`);
    const failed = await Promise.all(names.map((name) => recordElsewhere(file, name)));
    // A run that fails says why: this failed once in a whole test run, and said nothing.
    expect(failed.filter((said) => said !== undefined)).toEqual([]);
    const kept = (readLedger(file) as { name: string }[]).map((entry) => entry.name).sort();
    expect(kept).toEqual([...names].sort());
  }, 120_000);

  it('waits for a lock that Windows has not let go of yet, instead of failing', async () => {
    // What the twelve runs met, once in many: the lock file of the run before is just being
    // deleted, and for that moment Windows refuses to create it again with EPERM, not EEXIST.
    // The run took that for a failure and died without its record. With forty runs at once it
    // was 3 of 200; here the file system answers so on purpose.
    const { record, readLedger } = await load<Ledger>('ledger.mjs');
    const file = join(mkdtempSync(join(tmpdir(), 'slidr-ledger-')), 'ledger.json');
    const refusals = { lock: ['EPERM', 'EBUSY', 'EACCES'], replace: ['EPERM', 'EBUSY'] };
    const stubborn: FileSystem = {
      ...nodeFs,
      openSync: ((path: string, flags: string) => {
        const code = String(path).endsWith('.lock') ? refusals.lock.shift() : undefined;
        if (code) throw failure(code);
        return nodeFs.openSync(path, flags);
      }) as FileSystem['openSync'],
      renameSync: ((from: string, to: string) => {
        const code = refusals.replace.shift();
        if (code) throw failure(code);
        nodeFs.renameSync(from, to);
      }) as FileSystem['renameSync'],
    };
    expect(await record(file, { name: 'first' }, stubborn)).toBe(1);
    expect(await record(file, { name: 'second' }, stubborn)).toBe(2);
    expect(refusals).toEqual({ lock: [], replace: [] });
    expect(readLedger(file)).toEqual([{ name: 'first' }, { name: 'second' }]);
    // The lock is gone, so the next run does not wait for it.
    expect(nodeFs.existsSync(`${file}.lock`)).toBe(false);
    // Anything else is still a failure, and at once: a folder that is not there.
    const nowhere = join(tmpdir(), 'slidr-ledger-nowhere', 'deeper', 'ledger.json');
    await expect(record(nowhere, { name: 'x' })).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('the index of the reference decks', () => {
  type Slide = { html: string; lint: { message: string }[] };
  type Index = { stableIds: (rebuilt: Record<string, Slide[]>) => Record<string, Slide[]> };

  const run = (ids: [string, string]) => ({
    'zerem.he': [
      {
        html: `<div data-slide-id="${ids[0]}"><div data-element-id="${ids[1]}"></div></div>`,
        lint: [{ message: `${ids[1]} overflows its box` }],
      },
      {
        html: `<div data-element-id="${ids[1]}"></div><a id="d_zerem_hero_stream_1"></a>`,
        lint: [],
      },
    ],
  });

  it('names the random ids of a run by the order they appear, so two runs write the same page', async () => {
    const { stableIds } = await load<Index>('index.mjs');
    const first = stableIds(run(['s_k3x9a2bq', 'e_zewje0dg']));
    const second = stableIds(run(['s_0f7hh21m', 'e_ytcn4w9a']));
    expect(second).toEqual(first);
    expect(first['zerem.he']![0]!.html).toBe(
      '<div data-slide-id="s_00000001"><div data-element-id="e_00000002"></div></div>',
    );
    // The same element keeps one name on every slide, in a finding too; a deck's own id stays.
    expect(first['zerem.he']![1]!.html).toContain('data-element-id="e_00000002"');
    expect(first['zerem.he']![1]!.html).toContain('id="d_zerem_hero_stream_1"');
    expect(first['zerem.he']![0]!.lint[0]!.message).toBe('e_00000002 overflows its box');
  });
});
