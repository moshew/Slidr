import { describe, expect, it } from 'vitest';
import { entrySummary, parseDiagnostics } from './diagnostics';

describe('the diagnostics log as the settings screen reads it (AGT-08)', () => {
  const lines = [
    '{"at":"2026-10-04T06:00:00.000Z","session":"s1","kind":"start","data":{"harness":"claude-code","thread":"d_1/deck","model":"sonnet","resume":"n-1"}}',
    '{"at":"2026-10-04T06:00:01.000Z","session":"s1","kind":"send","data":{"textChars":12,"contextChars":900,"images":1}}',
    '{"at":"2026-10-04T06:00:02.000Z","session":"s1","kind":"raw","data":{"type":"system","subtype":"api_retry","attempt":3}}',
    '{"at":"2026-10-04T06:00:03.000Z","session":"s1","kind":"raw","data":"Warning: not json"}',
    '{"at":"2026-10-04T06:00:04.000Z","session":"s1","kind":"event","data":{"type":"tool_call_finished","id":"t1","ok":false,"summary":"no such slide"}}',
    '{"at":"2026-10-04T06:00:05.000Z","session":"s1","kind":"event","data":{"type":"error","kind":"network","message":"API Error: ENOTFOUND"}}',
    '{"at":"2026-10-04T06:10:05.000Z","session":"s1","kind":"close","data":{"reason":"idle"}}',
  ];

  it('reads an entry a line, and skips what is not one', () => {
    const entries = parseDiagnostics(
      [...lines, '', '{"at":"2026', 'not json', '{"kind":"raw"}'].join('\n'),
    );
    expect(entries).toHaveLength(lines.length);
    expect(entries[0]).toMatchObject({ session: 's1', kind: 'start' });
    expect(parseDiagnostics('')).toEqual([]);
  });

  it('says in a line what each entry is about', () => {
    expect(parseDiagnostics(lines.join('\n')).map(entrySummary)).toEqual([
      'claude-code · d_1/deck · sonnet · resume',
      '12 + 900 chars',
      'system · api_retry',
      'Warning: not json',
      'tool_call_finished · no such slide',
      'error · network · API Error: ENOTFOUND',
      'idle',
    ]);
  });
});
