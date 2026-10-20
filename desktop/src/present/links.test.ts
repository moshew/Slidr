import { beforeEach, describe, expect, it, vi } from 'vitest';
import { opensInShow } from './links';

const { inApp } = vi.hoisted(() => ({ inApp: { value: false } }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => inApp.value, invoke: vi.fn() }));

describe('the links a show follows', () => {
  beforeEach(() => {
    inApp.value = false;
  });

  it('in the app: the addresses the app hands to the system, and no other', () => {
    inApp.value = true;
    expect(opensInShow('https://example.com/a')).toBe(true);
    expect(opensInShow('http://example.com')).toBe(true);
    // The opener's permission names `http` and `https` only: these would do nothing.
    expect(opensInShow('mailto:dana@example.com')).toBe(false);
    expect(opensInShow('tel:+97231234567')).toBe(false);
    expect(opensInShow('https://')).toBe(false);
  });

  it('in a browser page: whatever a slide may open, since the browser follows it itself', () => {
    expect(opensInShow('mailto:dana@example.com')).toBe(true);
    expect(opensInShow('tel:+97231234567')).toBe(true);
    expect(opensInShow('https://example.com/a')).toBe(true);
  });
});
