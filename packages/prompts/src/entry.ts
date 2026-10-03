/**
 * A paragraph of the prompt that names tools. A session's prompt keeps it only when the session
 * has every tool it names. This is how the prompt deals with a tool the session cannot call,
 * because its scope excludes it or because the service it needs does not run in this build
 * (ADR-011): it does not mention it.
 */
export interface Entry {
  readonly needs: readonly string[];
  readonly text: string;
}

/** A paragraph that names no tool is a plain string, and every session gets it. */
export type Part = string | Entry;

/**
 * entry`Look with ${'slide_render'}.` — the name is written once: it appears in the text in
 * backticks, and it is what the paragraph needs.
 */
export function entry(strings: TemplateStringsArray, ...tools: string[]): Entry {
  let text = strings[0] ?? '';
  tools.forEach((tool, i) => {
    text += `\`${tool}\`${strings[i + 1] ?? ''}`;
  });
  return { needs: tools, text };
}

/** The parts a session with these tools gets, one per line. */
export function render(parts: readonly Part[], has: (tool: string) => boolean): string {
  return parts
    .filter((part) => typeof part === 'string' || part.needs.every(has))
    .map((part) => (typeof part === 'string' ? part : part.text))
    .join('\n');
}
