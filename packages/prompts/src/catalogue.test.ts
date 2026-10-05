import { availableIn, createDeckApi, deckTools, type ScopeKind } from '@slidr/agent-tools';
import { CommandBus, commandDefs } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { DESIGN } from './design';
import type { Part } from './entry';
import { HTML_CONVENTIONS } from './html';
import { LANGUAGE } from './language';
import { ROLE } from './role';
import { SCOPE_MODULES } from './scope';
import { systemPrompt } from './systemPrompt';
import { TEMPLATE_GUIDE } from './template';
import { TOOL_GUIDE } from './tools';

/*
 * The prompt against the real catalogue of the Deck API (SPEC 11.4, ADR-011): it names no tool
 * that does not exist, and presents to a session exactly the tools the session can call.
 */

const SCOPES: ScopeKind[] = ['deck', 'slide', 'object', 'import'];
const catalogue = deckTools.map((tool) => tool.name);

/**
 * The import tools of SPEC 13.2 (WG9C). The import module is their guide: they exist in an
 * import session only, so the tool guide, which every session gets, does not name them.
 */
const PLANNED = [
  'import_inspect',
  'import_eval',
  'import_screenshot',
  'import_capture',
  'import_set_viewport',
];

/** Words written like tool names that are not tools: keys of the context block, error codes. */
const NOT_TOOLS = [
  'session_slide',
  'session_elements',
  'import_file',
  'current_slide',
  'selected_slides',
  'changed_since_last_turn',
  'slide_order',
  'removed_elements',
  'removed_slides',
  'image_style',
  'not_found',
  'out_of_scope',
  'invalid_input',
];

/** What a session can call when every service runs. */
const fullList = (scope: ScopeKind) =>
  deckTools.filter((tool) => availableIn(tool.scopes, scope)).map((tool) => tool.name);

/** What a session can call in a build with the model alone: no capture, no conversion, no lint. */
const bare = createDeckApi(new CommandBus(hebrewDeck()));
const bareList = (scope: ScopeKind) => bare.list(scope).map((tool) => tool.name);

/** The tools a text names, in catalogue order. */
function named(text: string): string[] {
  return [...catalogue, ...PLANNED].filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

const parts: readonly Part[] = [
  ...TOOL_GUIDE,
  ...Object.values(SCOPE_MODULES).flat(),
  ...TEMPLATE_GUIDE,
];
const entries = parts.filter((part) => typeof part !== 'string');
const sorted = (names: readonly string[]) => [...new Set(names)].sort();

describe('the prompt against the catalogue', () => {
  it('names no tool that does not exist', () => {
    const known = new Set([...catalogue, ...PLANNED]);
    const unknown = entries.flatMap((entry) => entry.needs).filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });

  it('names every import tool of the catalogue in the import module', () => {
    expect(sorted(catalogue.filter((name) => name.startsWith('import_')))).toEqual(sorted(PLANNED));
    const needed = SCOPE_MODULES.import.flatMap((part) =>
      typeof part === 'string' ? [] : part.needs,
    );
    expect(PLANNED.filter((name) => !needed.includes(name))).toEqual([]);
  });

  it('has a place in the guide for every tool of the catalogue', () => {
    const guide = TOOL_GUIDE.flatMap((part) => (typeof part === 'string' ? [] : part.needs));
    expect(catalogue.filter((name) => !guide.includes(name) && !PLANNED.includes(name))).toEqual(
      [],
    );
    // The guide is for every session; a tool of one kind of session is in that session's module.
    expect(PLANNED.filter((name) => guide.includes(name))).toEqual([]);
  });

  it('names tools only in entries, and an entry needs exactly the tools it names', () => {
    for (const part of parts) {
      if (typeof part === 'string') expect(named(part), part).toEqual([]);
      else expect(sorted(named(part.text)), part.text).toEqual(sorted(part.needs));
    }
    for (const module of [ROLE, DESIGN, HTML_CONVENTIONS, LANGUAGE]) {
      expect(named(module)).toEqual([]);
    }
  });

  it('writes nothing that looks like a tool and is not one', () => {
    const known = new Set([...catalogue, ...PLANNED, ...NOT_TOOLS]);
    for (const scope of SCOPES) {
      const prompt = systemPrompt({ scope, tools: [...fullList(scope), ...PLANNED] });
      const words = [...prompt.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((match) => match[1]!);
      expect(
        words.filter((word) => !known.has(word)),
        scope,
      ).toEqual([]);
    }
  });

  it.each(SCOPES)('presents to a %s session exactly the tools it can call', (scope) => {
    const tools = fullList(scope);
    expect(sorted(named(systemPrompt({ scope, tools })))).toEqual(sorted(tools));
  });

  it.each(SCOPES)(
    'presents to a %s session only what runs in a build without services',
    (scope) => {
      const tools = bareList(scope);
      expect(sorted(named(systemPrompt({ scope, tools })))).toEqual(sorted(tools));
    },
  );

  it('describes to the agent every command of the model but the removal of an asset', () => {
    // What `deck_apply_ops` lists, against the model's own list (ADR-007). `asset.remove` is
    // left out on purpose: the comment on the tool's help says why.
    const { inputSchema } = bare.list('deck').find((tool) => tool.name === 'deck_apply_ops')!;
    const { ops } = inputSchema.properties as Record<string, { description: string }>;
    const described = (type: string) => new RegExp(`(^|/ )${type.replace('.', '\\.')} \\{`, 'm');
    expect(
      Object.keys(commandDefs).filter((type) => !described(type).test(ops!.description)),
    ).toEqual(['asset.remove']);
  });

  it('presents the import tools to an import session that has them, and to no other', () => {
    const withImport = (scope: ScopeKind) =>
      named(systemPrompt({ scope, tools: [...fullList(scope), ...PLANNED] }));
    expect(withImport('import')).toEqual(expect.arrayContaining(PLANNED));
    for (const scope of ['deck', 'slide', 'object'] as const) {
      expect(withImport(scope).filter((name) => PLANNED.includes(name))).toEqual([]);
    }
  });
});
