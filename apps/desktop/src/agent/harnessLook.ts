/**
 * How the app shows the harnesses it knows: a short name for the chat, the mark beside it, and
 * how the CLI is installed once the user approves (`setup.rs`, `install`). A harness it does not
 * know is shown by its own name, with a terminal for a mark.
 */
export interface HarnessLook {
  /** The product's name, without "CLI". */
  name: string;
  /** One or two characters on the mark. */
  glyph: string;
  /** The mark's background and text colours. */
  tone: string;
  /**
   * `winget`: Windows App Installer installs the CLI. `npm`: npm installs it, and Windows App
   * Installer first installs Node.js when npm is missing (Gemini CLI is published on npm only).
   */
  installer: 'winget' | 'npm';
}

const LOOKS: Record<string, HarnessLook> = {
  'claude-code': {
    name: 'Claude',
    glyph: '✳',
    tone: 'bg-ui-tool-orange text-ui-tool-orange-fg',
    installer: 'winget',
  },
  'codex-cli': {
    name: 'Codex',
    glyph: '>_',
    tone: 'bg-ui-tool-green text-ui-tool-green-fg',
    installer: 'winget',
  },
  'copilot-cli': {
    name: 'GitHub Copilot',
    glyph: 'GH',
    tone: 'bg-ui-tool-blue text-ui-tool-blue-fg',
    installer: 'winget',
  },
  'gemini-cli': {
    name: 'Gemini',
    glyph: '✦',
    tone: 'bg-ui-tool-violet text-ui-tool-violet-fg',
    installer: 'npm',
  },
  'grok-cli': {
    name: 'Grok',
    glyph: 'G',
    tone: 'bg-ui-tool-teal text-ui-tool-teal-fg',
    installer: 'winget',
  },
};

export function harnessLook(id: string): HarnessLook | undefined {
  return LOOKS[id];
}

/** The short name of a harness: its look's, or its own without "CLI". */
export function harnessName(harness: { id: string; name: string }): string {
  return harnessLook(harness.id)?.name ?? harness.name.replace(/\s+CLI\b/gi, '');
}

/** Whether the CLI of a harness is installed with npm rather than Windows App Installer alone. */
export function installsWithNpm(id: string | undefined): boolean {
  return !!id && harnessLook(id)?.installer === 'npm';
}
