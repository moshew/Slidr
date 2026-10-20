import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSystemFonts, setSystemFontSource, type SystemFont } from './systemFonts';

const david: SystemFont = { family: 'David', hebrew: true, symbol: false };
const wingdings: SystemFont = { family: 'Wingdings', hebrew: false, symbol: true };

afterEach(async () => {
  vi.restoreAllMocks();
  await setSystemFontSource(null);
});

describe('the installed fonts', () => {
  it('are none where there is no system to ask: a plain browser page', async () => {
    expect(await setSystemFontSource(null)).toEqual([]);
    expect(await loadSystemFonts()).toEqual([]);
  });

  it('are asked for once, however many times they are wanted', async () => {
    const source = vi.fn(() => Promise.resolve([david, wingdings]));
    expect(await setSystemFontSource(source)).toEqual([david, wingdings]);
    expect(await loadSystemFonts()).toEqual([david, wingdings]);
    expect(await loadSystemFonts()).toEqual([david, wingdings]);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('are none when the system cannot be read, and the failure is reported', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('DirectWrite said no');
    expect(await setSystemFontSource(() => Promise.reject(failure))).toEqual([]);
    expect(reported).toHaveBeenCalledWith('could not list the installed fonts', failure);
  });
});
