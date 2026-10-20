import { describe, expect, it } from 'vitest';
import { harnessLook, harnessName, installsWithNpm } from './harnessLook';

describe('harness looks', () => {
  it('names every built-in harness and gives each its own mark', () => {
    const ids = ['claude-code', 'codex-cli', 'copilot-cli', 'gemini-cli', 'grok-cli'];
    const looks = ids.map((id) => harnessLook(id)!);
    expect(looks.map((look) => look.name)).toEqual([
      'Claude',
      'Codex',
      'GitHub Copilot',
      'Gemini',
      'Grok',
    ]);
    expect(new Set(looks.map((look) => look.glyph)).size).toBe(ids.length);
    expect(new Set(looks.map((look) => look.tone)).size).toBe(ids.length);
  });

  it('shows a harness it does not know by its own name', () => {
    expect(harnessLook('mock')).toBeUndefined();
    expect(harnessName({ id: 'other-cli', name: 'Other CLI' })).toBe('Other');
    expect(harnessName({ id: 'gemini-cli', name: 'Gemini CLI' })).toBe('Gemini');
  });

  it('installs Gemini CLI with npm and the others with Windows App Installer', () => {
    expect(installsWithNpm('gemini-cli')).toBe(true);
    expect(installsWithNpm('grok-cli')).toBe(false);
    expect(installsWithNpm('claude-code')).toBe(false);
    expect(installsWithNpm(undefined)).toBe(false);
  });
});
