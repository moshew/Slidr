import { describe, expect, it } from 'vitest';
import { commandDefs, type CommandType } from './commands';
import {
  commandJsonSchema,
  commandJsonSchemaOf,
  deckJsonSchema,
  elementJsonSchema,
  slideJsonSchema,
  themeJsonSchema,
} from './jsonSchema';

describe('JSON Schema export (T02)', () => {
  it('describes the deck, its parts and the commands', () => {
    for (const build of [
      deckJsonSchema,
      slideJsonSchema,
      elementJsonSchema,
      themeJsonSchema,
      commandJsonSchema,
    ]) {
      const schema = build();
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(() => JSON.stringify(schema)).not.toThrow();
    }
  });

  it('handles the recursion of groups with a reference', () => {
    expect(JSON.stringify(elementJsonSchema())).toContain('"$ref"');
  });

  it('gives each command its own schema, with the type fixed', () => {
    for (const type of Object.keys(commandDefs) as CommandType[]) {
      const schema = commandJsonSchemaOf(type) as {
        properties: { type: { const: string } };
        additionalProperties: boolean;
      };
      expect(schema.properties.type.const).toBe(type);
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it('stays small enough to send to the agent', () => {
    expect(JSON.stringify(elementJsonSchema()).length).toBeLessThan(40_000);
  });
});
