import { spawn } from 'node:child_process';
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

type Ledger = {
  record: (file: string, entry: unknown) => Promise<number>;
  readLedger: (file: string) => unknown[];
};

/** A process of its own that adds one record, as one run of picture.mjs does. */
const recordElsewhere = (file: string, name: string) =>
  new Promise<number>((resolve) => {
    const code = `import(${JSON.stringify(pathToFileURL(join(scripts, 'ledger.mjs')).href)}).then((l) => l.record(${JSON.stringify(file)}, { name: ${JSON.stringify(name)} }))`;
    spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' }).on(
      'close',
      (status) => resolve(status ?? 1),
    );
  });

describe('the ledger of picture generations', () => {
  it('keeps every record when several runs write it at once', async () => {
    const { readLedger } = await load<Ledger>('ledger.mjs');
    const file = join(mkdtempSync(join(tmpdir(), 'slidr-ledger-')), 'ledger.json');
    const names = Array.from({ length: 12 }, (_, i) => `picture-${i}`);
    const statuses = await Promise.all(names.map((name) => recordElsewhere(file, name)));
    expect(statuses.every((status) => status === 0)).toBe(true);
    const kept = (readLedger(file) as { name: string }[]).map((entry) => entry.name).sort();
    expect(kept).toEqual([...names].sort());
  }, 30_000);
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
