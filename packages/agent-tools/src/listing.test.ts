import { CommandBus } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { createDeckApi } from './registry';
import type { Services } from './services';
import { deckTools } from './tools';

/** Every service, as stubs: listing never calls them. */
const everything = Object.fromEntries(
  [
    'ui',
    'capture',
    'layouts',
    'conversion',
    'lint',
    'templates',
    'images',
    'stock',
    'icons',
    'options',
    'importer',
  ].map((name) => [name, {}]),
) as Services;

const api = createDeckApi(new CommandBus(hebrewDeck()), everything);

describe('the catalogue', () => {
  it('has every tool of SPEC 11.4 and of SPEC 13.2, once, in snake_case', () => {
    expect(deckTools.map((t) => t.name)).toEqual([
      'deck_get_outline',
      'deck_get_theme',
      'slide_get',
      'element_get',
      'slide_render',
      'deck_render_contact_sheet',
      'selection_get',
      'slide_create',
      'slide_create_from_html',
      'slide_replace_from_html',
      'slide_update',
      'slide_delete',
      'slide_duplicate',
      'slides_reorder',
      'element_add',
      'element_update',
      'element_delete',
      'elements_arrange',
      'text_set',
      'text_replace',
      'table_set',
      'chart_set',
      'animation_set',
      'element_convert',
      'theme_update',
      'template_apply',
      'template_create',
      'template_save',
      'deck_apply_ops',
      'image_generate',
      'image_fill_placeholders',
      'image_edit',
      'image_process',
      'stock_search',
      'icon_search',
      'slide_lint',
      'deck_lint',
      'ui_present_options',
      'ui_navigate',
      'outline_propose',
      'import_inspect',
      'import_eval',
      'import_screenshot',
      'import_set_viewport',
      'import_capture',
    ]);
  });

  it('gives the scopes of the catalogue', () => {
    const names = (scope: 'deck' | 'slide' | 'object' | 'import') =>
      api.list(scope).map((t) => t.name);
    // An import session has every tool of a deck session, and the import tools after them.
    const importOnly = names('import').filter((name) => name.startsWith('import_'));
    expect(importOnly).toHaveLength(5);
    expect(names('import')).toEqual([...names('deck'), ...importOnly]);
    for (const scope of ['deck', 'slide', 'object'] as const) {
      expect(names(scope).filter((name) => name.startsWith('import_'))).toEqual([]);
    }
    // The one chat of the app is a deck session, and offers options for what the user points at.
    expect(names('deck')).toEqual(expect.arrayContaining(['ui_present_options', 'text_replace']));
    expect(names('slide')).toEqual(
      expect.arrayContaining([
        'slide_replace_from_html',
        'element_add',
        'deck_apply_ops',
        'ui_present_options',
      ]),
    );
    expect(names('slide')).not.toContain('slide_delete');
    expect(names('object')).not.toEqual(expect.arrayContaining(['element_add']));
    expect(names('object')).not.toContain('element_delete');
    expect(names('object')).toEqual(expect.arrayContaining(['text_set', 'text_replace']));
  });

  it('lists only the tools that need no service when there are none', () => {
    const bare = createDeckApi(new CommandBus(hebrewDeck()));
    expect(bare.list().map((t) => t.name)).toHaveLength(20);
  });
});

describe('tool definitions for a transport adapter', () => {
  const listing = api.list();

  it('describe each input as a plain JSON object schema', () => {
    for (const tool of listing) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      for (const key of ['anyOf', 'oneOf', 'allOf'])
        expect(tool.inputSchema, tool.name).not.toHaveProperty(key);
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
    }
  });

  it('carry the descriptions of the fields and refer to shared model types', () => {
    const textSet = listing.find((t) => t.name === 'text_set')!.inputSchema as {
      properties: Record<string, { description?: string; $ref?: string }>;
    };
    expect(textSet.properties.markdown!.description).toMatch(/Give this or richText/);
    expect(textSet.properties.richText!.description).toMatch(/RichText JSON/);
    expect(JSON.stringify(textSet)).toContain('#/$defs/RichText');
  });

  it('do not copy the element schema twice', () => {
    const add = listing.find((t) => t.name === 'element_add')!;
    expect(JSON.stringify(add.inputSchema).length).toBeLessThan(30_000);
  });

  it('stay within a size the agent can afford', () => {
    const total = JSON.stringify(listing).length;
    // About 94 KB (24k tokens) with every service. Raised from 90 KB for text_replace (ADR-072),
    // and from 93 KB for a picture's outline mask and the artwork of its frame.
    expect(total).toBeLessThan(95_000);
  });

  it('give the image tools, and the drafting of a template, more time than a call gets by default', () => {
    const slow = listing.filter((t) => t.timeoutMs !== undefined);
    expect(slow.map((t) => [t.name, t.timeoutMs])).toEqual([
      ['template_create', 210_000],
      ['image_generate', 300_000],
      ['image_fill_placeholders', 300_000],
      ['image_edit', 300_000],
    ]);
  });

  it('never mention the wire protocol (API-02)', () => {
    expect(JSON.stringify(listing).toLowerCase()).not.toContain(['m', 'c', 'p'].join(''));
  });
});
