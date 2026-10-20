// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pageScriptNonce } from './scriptNonce';

function page(meta: string): Document {
  const doc = document.implementation.createHTMLDocument('');
  doc.head.innerHTML = meta;
  return doc;
}

describe('the script nonce of a page (ADR-066)', () => {
  it('is what the page was served with', () => {
    expect(
      pageScriptNonce(page('<meta name="slidr-script-nonce" content="1795638420012345">')),
    ).toBe('1795638420012345');
    expect(
      pageScriptNonce(
        page('<meta name="slidr-script-nonce" content=" IdB15K08kknxQLjvMOOakw== ">'),
      ),
    ).toBe('IdB15K08kknxQLjvMOOakw==');
  });

  it('is absent when nothing replaced the placeholder, or the page has none', () => {
    // Served by something that sends no policy either: a preview of the build, a test.
    expect(
      pageScriptNonce(page('<meta name="slidr-script-nonce" content="__TAURI_SCRIPT_NONCE__">')),
    ).toBeUndefined();
    expect(pageScriptNonce(page('<meta name="slidr-script-nonce" content="">'))).toBeUndefined();
    expect(pageScriptNonce(page('<meta name="viewport" content="x">'))).toBeUndefined();
  });
});
