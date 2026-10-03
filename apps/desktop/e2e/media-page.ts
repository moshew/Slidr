/**
 * Runs in the page, not in the test: the media suites load it from the dev server
 * (`import('/e2e/media-page.ts')`). It gives a test the Deck API the app gives the agent, with
 * the services of a plain browser page: the conversion engine in the page, the page's image
 * provider, and the media services (stock photos, the icon library).
 */
import { createDeckApi, startTurn, type ToolResult } from '@slidr/agent-tools';
import { pageConversion } from '../src/agent/conversion';
import { imagesOf } from '../src/images/appImages';
import { mediaServices } from '../src/media/services';
import type { Editor } from '../src/shell/editor';

/** Calls tools of a deck session one after another, as one turn of the agent. */
export async function agentCalls(
  editor: Editor,
  calls: readonly { name: string; input: unknown }[],
): Promise<ToolResult[]> {
  const api = createDeckApi(editor.bus, {
    conversion: pageConversion(editor.assets),
    images: imagesOf(editor).service,
    ...mediaServices(editor),
  });
  const turn = startTurn('e2e', { kind: 'deck' });
  const results: ToolResult[] = [];
  for (const { name, input } of calls) results.push(await api.call(turn, name, input));
  return results;
}
