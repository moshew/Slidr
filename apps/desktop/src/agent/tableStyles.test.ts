import { createDeckApi } from '@slidr/agent-tools';
import { CommandBus, createDeck } from '@slidr/model';
import { tableStyles } from '@slidr/renderer';
import { expect, it } from 'vitest';

// `table_set` names the table styles and the renderer draws them. The Deck API compiles without
// the renderer, so it repeats the ids; the app has both, and holds them together here.
it('table_set offers the table styles the renderer has', () => {
  const api = createDeckApi(new CommandBus(createDeck()));
  const schema = api.list().find((tool) => tool.name === 'table_set')?.inputSchema as {
    properties: { styleId: { enum: string[] } };
  };
  expect(schema.properties.styleId.enum).toEqual(tableStyles.map((style) => style.id));
});
