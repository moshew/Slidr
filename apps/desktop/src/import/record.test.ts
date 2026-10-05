import { describe, expect, it } from 'vitest';
import { pageRecord, parseRecord, serializeRecord, type ImportRecord } from './record';

/*
 * The record of an import travels inside the deck file (IMP-07), which anyone can write: what is
 * read back is data, taken field by field.
 */

const record = (over: Partial<ImportRecord> = {}): ImportRecord => ({
  version: 1,
  deckId: 'd_1',
  file: 'מצגת.html',
  kept: true,
  startedAt: 1_700_000_000_000,
  planned: 6,
  phase: 'working',
  records: {
    s_a: {
      faithful: true,
      exact: true,
      wholeSlideHtml: false,
      editability: 0.9,
      textEditability: 1,
      kept: ['a pseudo-element'],
      source: { width: 1280, height: 720 },
      elementIds: ['e_1', 'e_2'],
      from: { js: 'slides()[0]', before: 'show(0)' },
    },
  },
  blocked: ['https://fonts.example/a.woff2'],
  ...over,
});

describe('the record of an import, as the deck file keeps it', () => {
  it('comes back as it was written', () => {
    const written = record();
    expect(parseRecord(serializeRecord(written), 'd_1')).toEqual(written);
  });

  it("is no record of another deck, though it is in that deck's file", () => {
    expect(parseRecord(serializeRecord(record()), 'd_other')).toBeNull();
  });

  it('says the source was taken out of the deck only when it was', () => {
    expect(parseRecord(serializeRecord(record({ kept: false })), 'd_1')!.kept).toBe(false);
    // A record that does not say (or says something else) is of a deck that keeps its source.
    const { kept: _kept, ...silent } = record();
    expect(parseRecord(JSON.stringify(silent), 'd_1')!.kept).toBe(true);
    expect(parseRecord(JSON.stringify({ ...silent, kept: 'no' }), 'd_1')!.kept).toBe(true);
  });

  it('is nothing when the file has none, or holds something else', () => {
    for (const text of [null, '', 'not json', '[]', '{}', '{"version":2,"deckId":"d_1"}']) {
      expect(parseRecord(text, 'd_1'), String(text)).toBeNull();
    }
    expect(parseRecord(JSON.stringify({ ...record(), file: '' }), 'd_1')).toBeNull();
    expect(parseRecord(JSON.stringify({ ...record(), file: 7 }), 'd_1')).toBeNull();
  });

  it('drops what is not of the expected kind, field by field', () => {
    const hostile = {
      ...record(),
      startedAt: 'yesterday',
      planned: -3,
      phase: 'finished',
      extra: { run: 'alert(1)' },
      blocked: ['https://a.example/x', 7, null, 'x'.repeat(5000)],
      records: {
        s_a: { ...record().records.s_a, from: { js: 7, before: 'show(0)', run: 'x' }, more: 1 },
        // Not a measurement: a share above 1, a size of zero, a missing field.
        s_b: { ...record().records.s_a, editability: 7 },
        s_c: { ...record().records.s_a, source: { width: 0, height: 720 } },
        s_d: { faithful: true },
        // A key every object answers to is no slide's.
        constructor: record().records.s_a,
        '': record().records.s_a,
      },
    };
    // Written as text: an object literal would take `__proto__` for itself.
    const text = JSON.stringify(hostile).replace('"constructor":', '"__proto__":{},"constructor":');
    expect(text).toContain('"__proto__"');
    const parsed = parseRecord(text, 'd_1')!;
    expect(Object.getPrototypeOf(parsed.records)).toBe(Object.prototype);
    expect(parsed.startedAt).toBeNull();
    expect(parsed.planned).toBeNull();
    expect(parsed.phase).toBe('idle');
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.blocked).toEqual(['https://a.example/x', 'x'.repeat(600)]);
    expect(Object.keys(parsed.records)).toEqual(['s_a']);
    expect(parsed.records.s_a).toEqual({ ...record().records.s_a, from: { before: 'show(0)' } });
  });

  it('keeps a slide whose source the agent did not say (a record of before it was kept)', () => {
    const { from: _from, ...plain } = record().records.s_a!;
    const parsed = parseRecord(serializeRecord(record({ records: { s_a: plain } })), 'd_1')!;
    expect(parsed.records.s_a).toEqual(plain);
  });

  it('bounds how much it takes', () => {
    const one = record().records.s_a!;
    const many = Object.fromEntries(Array.from({ length: 6000 }, (_, i) => [`s_${i}`, one]));
    const parsed = parseRecord(JSON.stringify({ ...record(), records: many }), 'd_1')!;
    expect(Object.keys(parsed.records)).toHaveLength(5000);
    const long = { ...one, kept: Array.from({ length: 900 }, () => 'r'.repeat(2000)) };
    const kept = parseRecord(JSON.stringify({ ...record(), records: { s_a: long } }), 'd_1')!
      .records.s_a!.kept;
    expect(kept).toHaveLength(200);
    expect(kept[0]).toHaveLength(600);
  });
});

describe('the record of a plain browser page', () => {
  it('is kept by the id of its deck, for as long as the page lives', async () => {
    expect(await pageRecord('d_page_1').read()).toBeNull();
    await pageRecord('d_page_1').write('{"a":1}');
    expect(await pageRecord('d_page_1').read()).toBe('{"a":1}');
    expect(await pageRecord('d_page_2').read()).toBeNull();
  });
});
