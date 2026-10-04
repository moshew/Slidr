import { describe, expect, it } from 'vitest';
import { startsOnWelcome, type StartEnvironment } from './startup';

const env = (extra: Partial<StartEnvironment> = {}): StartEnvironment => ({
  app: true,
  search: '',
  workspace: null,
  preference: null,
  ...extra,
});

describe('where the window starts (DOC-05)', () => {
  it('opens the app on the welcome screen', () => {
    expect(startsOnWelcome(env())).toBe(true);
  });

  it('comes back to the editor when the webview is reloaded over a document', () => {
    expect(startsOnWelcome(env({ workspace: 'w_1' }))).toBe(false);
  });

  it('starts a plain browser page in the editor, where the tests of the editor start', () => {
    expect(startsOnWelcome(env({ app: false }))).toBe(false);
  });

  it('shows the screen in a browser when the address asks for it', () => {
    expect(startsOnWelcome(env({ app: false, search: '?welcome' }))).toBe(true);
  });

  it('keeps the app in the editor for a run that drives the real window', () => {
    expect(startsOnWelcome(env({ search: '?editor' }))).toBe(false);
    expect(startsOnWelcome(env({ preference: 'off' }))).toBe(false);
    // The address has the last word.
    expect(startsOnWelcome(env({ preference: 'off', search: '?welcome=1' }))).toBe(true);
  });
});
