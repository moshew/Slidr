import type { ScopeKind } from '@slidr/agent-tools';
import { DESIGN } from './design';
import { render } from './entry';
import { HTML_CONVENTIONS } from './html';
import { LANGUAGE } from './language';
import { ROLE } from './role';
import { SCOPE_MODULES } from './scope';
import { TOOL_GUIDE } from './tools';

export interface SystemPromptInput {
  /** The kind of session (SPEC 11.7; `import`: SPEC 13). */
  scope: ScopeKind;
  /**
   * The tools the session can call, by name: `api.list(scope).map((tool) => tool.name)`. The
   * prompt presents these and no others.
   */
  tools: readonly string[];
}

/** The tools that take a slide written as HTML. A session without one gets no conventions. */
const HTML_TOOLS = ['slide_create_from_html', 'slide_replace_from_html'];

/**
 * The system prompt of an agent session: the five modules of SPEC 11.6, in its order. It
 * replaces the harness's own prompt (ADR-001) and is the same for every harness.
 *
 * It depends on the kind of session and on its tools, and on nothing else: no ids, no names, no
 * date. The harness keeps the prompt of a conversation's first request and reuses it after a
 * resume (ADR-010), so whatever can change between turns belongs in `contextBlock`.
 */
export function systemPrompt({ scope, tools }: SystemPromptInput): string {
  const names = new Set(tools);
  const has = (tool: string) => names.has(tool);

  return [
    ROLE,
    DESIGN,
    render(TOOL_GUIDE, has),
    ...(HTML_TOOLS.some(has) ? [HTML_CONVENTIONS] : []),
    render(SCOPE_MODULES[scope], has),
    LANGUAGE,
  ].join('\n\n');
}
