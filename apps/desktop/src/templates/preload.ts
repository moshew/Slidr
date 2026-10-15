/**
 * The fonts of the library's templates, loaded while the app is idle. The panels that show the
 * templates' covers are drawn ahead and hidden (see the shell's `ToolPanel`), and a hidden panel
 * is not laid out: its fonts would load only once it is shown, and its text be laid out twice.
 */
import { fontStack } from '@slidr/renderer';
import type { Template } from '@slidr/templates';

/** Letters of both scripts and some digits, so the faces of each are loaded. */
const SAMPLE = 'אבגדה ABCabc 123';

/** Loads the faces every text style of the templates is written in. A font that fails is left. */
export async function preloadTemplateFonts(templates: readonly Template[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fonts = new Set<string>();
  for (const { theme } of templates) {
    for (const style of Object.values(theme.textStyles))
      fonts.add(`${style.weight} 16px ${fontStack(theme.fonts[style.font])}`);
  }
  await Promise.all([...fonts].map((font) => document.fonts.load(font, SAMPLE).catch(() => [])));
}
