import {
  mergeAffected,
  toJsonSchema,
  walkElements,
  type Affected,
  type CommandBus,
  type Deck,
  type JsonSchema,
  type Slide,
} from '@slidr/model';
import { z } from 'zod';
import { formatZodError, toToolError } from './errors';
import { availableIn, checkWrite, describeScope, type ScopeKind } from './scope';
import type { Services } from './services';
import { deckTools } from './tools';
import {
  DeckApiError,
  type ToolContext,
  type ToolDef,
  type ToolErrorCode,
  type ToolResult,
  type Turn,
  type WriteSummary,
} from './tool';

/** What a transport adapter publishes for one tool (name, description, JSON Schema input). */
export interface ToolListing {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  scopes: readonly ScopeKind[];
  writes: boolean;
  /** Present when the tool may take longer than a transport's default limit for a call. */
  timeoutMs?: number;
}

export interface DeckApi {
  /** The registered tools: those whose service is provided. */
  readonly tools: readonly ToolDef[];
  /** The tools with JSON Schema inputs; with a scope, only those a session of it may call. */
  list(scope?: ScopeKind): ToolListing[];
  /**
   * Runs one tool call of a turn. It never throws: every failure comes back as an error
   * result with a message for the agent, and leaves the deck as the last successful write
   * of the call left it.
   */
  call(turn: Turn, name: string, input: unknown): Promise<ToolResult>;
}

function descriptionOf(schema: z.ZodType): string | undefined {
  let current: z.ZodType | undefined = schema;
  while (current) {
    if (current.description) return current.description;
    current =
      current instanceof z.ZodOptional || current instanceof z.ZodNullable
        ? (current.unwrap() as z.ZodType)
        : undefined;
  }
  return undefined;
}

/**
 * The model's JSON Schema of the input (shared model types become `$defs`), with the
 * descriptions of the top-level fields, which the model's export leaves out.
 */
export function inputJsonSchema(schema: z.ZodType): JsonSchema {
  const json = toJsonSchema(schema);
  const properties = json.properties as Record<string, JsonSchema> | undefined;
  if (schema instanceof z.ZodObject && properties) {
    const shape: unknown = schema.shape;
    for (const [key, field] of Object.entries(shape as Record<string, z.ZodType>)) {
      const description = descriptionOf(field);
      if (description && properties[key]) {
        properties[key] = { description, ...properties[key] };
      }
    }
  }
  return json;
}

const NOTHING: Affected = {
  meta: false,
  theme: false,
  slideOrder: false,
  layouts: [],
  slides: [],
  elements: [],
  assets: [],
};

function elementIdsOn(deck: Deck, slideIds: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    if (!slideIds.has(slide.id)) continue;
    for (const element of walkElements(slide.elements)) ids.add(element.id);
  }
  return ids;
}

/** A slide changed in itself, not only in its elements. The model keeps untouched parts identical. */
function slideFieldsChanged(was: Slide, is: Slide): boolean {
  const keys = new Set([...Object.keys(was), ...Object.keys(is)]) as Set<keyof Slide>;
  return [...keys].some((key) => key !== 'elements' && was[key] !== is[key]);
}

/** What a write did, by id, from what the bus reported and the deck before and after. */
export function summarizeWrite(before: Deck, after: Deck, affected: Affected): WriteSummary {
  const created: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const oldSlides = new Map(before.slides.map((s) => [s.id, s]));
  const newSlides = new Map(after.slides.map((s) => [s.id, s]));
  for (const id of affected.slides) {
    const was = oldSlides.get(id);
    const is = newSlides.get(id);
    if (!was && is) created.push(id);
    else if (was && !is) removed.push(id);
    else if (was && is && slideFieldsChanged(was, is)) changed.push(id);
  }
  const slideIds = new Set(affected.slides);
  const oldElements = elementIdsOn(before, slideIds);
  const newElements = elementIdsOn(after, slideIds);
  for (const id of affected.elements) {
    const was = oldElements.has(id);
    const is = newElements.has(id);
    if (!was && is) created.push(id);
    else if (was && !is) removed.push(id);
    else if (was && is) changed.push(id);
  }

  const deck: NonNullable<WriteSummary['deck']> = [];
  if (affected.meta) deck.push('meta');
  if (affected.theme) deck.push('theme');
  if (affected.layouts.length > 0) deck.push('layouts');
  const addedOrRemoved = [...created, ...removed].some(
    (id) => oldSlides.has(id) || newSlides.has(id),
  );
  if (affected.slideOrder && !addedOrRemoved) deck.push('slideOrder');
  if (affected.assets.length > 0) deck.push('assets');

  return {
    created,
    changed,
    removed,
    slides: affected.slides.filter((id) => newSlides.has(id)),
    ...(deck.length > 0 ? { deck } : {}),
  };
}

function failure(code: ToolErrorCode, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

/** "deck sessions", "deck and slide sessions", "deck, slide and object sessions". */
function scopeNames(scopes: readonly ScopeKind[]): string {
  const names =
    scopes.length > 1 ? `${scopes.slice(0, -1).join(', ')} and ${scopes.at(-1)}` : scopes[0];
  return `${names} sessions`;
}

/**
 * The Deck API over a command bus (SPEC 11.4). `services` decides which of the tools that
 * need another part of the app are registered. Plain closures over the bus: the transport
 * adapter, the harness and the tests all call `call` the same way (API-01).
 */
export function createDeckApi(bus: CommandBus, services: Services = {}): DeckApi {
  const tools = deckTools.filter((tool) => !tool.requires || services[tool.requires]);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const schemas = new Map<string, JsonSchema>();

  function list(scope?: ScopeKind): ToolListing[] {
    return tools
      .filter((tool) => !scope || availableIn(tool.scopes, scope))
      .map((tool) => {
        let inputSchema = schemas.get(tool.name);
        if (!inputSchema) {
          inputSchema = inputJsonSchema(tool.input);
          schemas.set(tool.name, inputSchema);
        }
        return {
          name: tool.name,
          description: tool.description,
          inputSchema,
          scopes: tool.scopes,
          writes: tool.writes,
          ...(tool.timeoutMs ? { timeoutMs: tool.timeoutMs } : {}),
        };
      });
  }

  async function call(turn: Turn, name: string, input: unknown): Promise<ToolResult> {
    const tool = byName.get(name);
    if (!tool) {
      const known = deckTools.find((t) => t.name === name);
      return known
        ? failure('unavailable', `${name} is not available in this version of the app.`)
        : failure('unknown_tool', `There is no tool named "${name}".`);
    }
    if (!availableIn(tool.scopes, turn.scope.kind)) {
      return failure(
        'out_of_scope',
        `${name} is not available in ${describeScope(turn.scope)}; it works in ${scopeNames(tool.scopes)}.`,
      );
    }
    const parsed = tool.input.safeParse(input ?? {});
    if (!parsed.success) {
      return failure(
        'invalid_input',
        `Invalid input for ${name}:\n${formatZodError(parsed.error)}`,
      );
    }

    // All writes of the call, so the result reports them together.
    let before: Deck | undefined;
    let after: Deck | undefined;
    let affected: Affected | undefined;
    const ctx: ToolContext = {
      get deck() {
        return bus.deck;
      },
      turn,
      services,
      write(commands) {
        if (!tool.writes) throw new Error(`${name} is declared read-only but tried to write.`);
        const start = bus.deck;
        if (commands.length === 0) return summarizeWrite(start, start, NOTHING);
        const refusal = checkWrite(turn.scope, commands, start);
        if (refusal) throw new DeckApiError('out_of_scope', refusal);
        const done = bus.batch(commands, {
          actor: turn.actor,
          txId: turn.txId,
          ...(turn.label ? { label: turn.label } : {}),
        });
        before ??= start;
        after = bus.deck;
        affected = affected ? mergeAffected(affected, done) : done;
        return summarizeWrite(start, after, done);
      },
    };

    try {
      const output = await tool.run(parsed.data, ctx);
      const data: Record<string, unknown> = { ...output.data };
      if (tool.writes) {
        const summary =
          before && after && affected
            ? summarizeWrite(before, after, affected)
            : summarizeWrite(bus.deck, bus.deck, NOTHING);
        Object.assign(data, summary);
        if (services.lint && tool.lint !== false && summary.slides.length > 0) {
          const live = new Set(bus.deck.slides.map((s) => s.id));
          const slides = summary.slides.filter((id) => live.has(id));
          try {
            data.lint = await services.lint.lint(bus.deck, slides, 'agent');
          } catch (error) {
            data.lintError = toToolError(error).message;
          }
        }
      }
      return { ok: true, data, images: output.images ?? [] };
    } catch (error) {
      const result = toToolError(error);
      if (before && after && affected) {
        // A tool that failed after writing: what it wrote stays, as part of the turn.
        const summary = summarizeWrite(before, after, affected);
        result.message += `\nChanges made before the failure were kept: ${JSON.stringify(summary)}`;
      }
      return { ok: false, error: result };
    }
  }

  return { tools, list, call };
}
