import { describe, expect, it } from 'vitest';
import { Settings } from '@slidr/ui/icons';
import {
  groupContextTools,
  normalizeKeys,
  registerAction,
  registerActionPopover,
  registerContextTool,
  registerPanel,
  registerShortcut,
  registerStageLayer,
  registerStageMenu,
  registries,
  shortcutsFor,
  type ContextToolDefinition,
  type StageMenuDefinition,
  type ToolPanelDefinition,
} from './registry';

const Nothing = () => null;

function panel(id: string, extra: Partial<ToolPanelDefinition> = {}): ToolPanelDefinition {
  return {
    id,
    kind: 'tool',
    title: id,
    icon: Settings,
    slot: 'tools',
    order: 0,
    content: Nothing,
    ...extra,
  };
}

const panels = () => registries.panels.getState().items;

describe('panel registry', () => {
  it('lets the real panel replace a placeholder, whichever registers first', () => {
    const placeholder = panel('t.a', { placeholder: true });
    const real = panel('t.a');
    registerPanel(placeholder);
    const unregister = registerPanel(real);
    expect(panels().filter((p) => p.id === 't.a')).toEqual([real]);

    // A placeholder that loads after the real panel does not displace it.
    registerPanel(panel('t.a', { placeholder: true }));
    expect(panels().filter((p) => p.id === 't.a')).toEqual([real]);

    unregister();
    expect(panels().some((p) => p.id === 't.a')).toBe(false);
  });

  it('keeps one entry per id', () => {
    registerPanel(panel('t.b'));
    const second = panel('t.b', { order: 3 });
    registerPanel(second);
    expect(panels().filter((p) => p.id === 't.b')).toEqual([second]);
  });
});

describe('row B tools', () => {
  const tool = (id: string, group: string, order: number, kinds: ContextToolDefinition['kinds']) =>
    ({ id, group, order, kinds, render: Nothing }) satisfies ContextToolDefinition;

  it('picks the tools for the selection, in order, in groups', () => {
    const tools = [
      tool('size', 'font', 2, ['text']),
      tool('font', 'font', 1, ['text']),
      tool('bold', 'marks', 3, ['text']),
      tool('crop', 'image', 1, ['image']),
    ];
    expect(groupContextTools(tools, 'text').map((g) => g.map((t) => t.id))).toEqual([
      ['font', 'size'],
      ['bold'],
    ]);
    expect(groupContextTools(tools, 'image').map((g) => g.map((t) => t.id))).toEqual([['crop']]);
    expect(groupContextTools(tools, 'table')).toEqual([]);
  });

  it('registers and removes a tool', () => {
    const remove = registerContextTool(tool('t.tool', 'g', 0, ['chart']));
    expect(registries.contextTools.getState().items.some((t) => t.id === 't.tool')).toBe(true);
    remove();
    expect(registries.contextTools.getState().items.some((t) => t.id === 't.tool')).toBe(false);
  });
});

describe("the Stage's right-click menu", () => {
  it('is put together by kind, in order and in groups, as row B is', () => {
    const part = (
      id: string,
      group: string,
      order: number,
      kinds: ContextToolDefinition['kinds'],
    ) => ({ id, group, order, kinds, render: Nothing }) satisfies StageMenuDefinition;
    const removes = [
      part('t.ai', 'ai', 90, ['none', 'text']),
      part('t.cells', 'table', 25, ['table']),
      part('t.clipboard', 'clipboard', 10, ['none', 'text', 'table']),
    ].map(registerStageMenu);
    const ids = (kind: ContextToolDefinition['kinds'][number]) =>
      groupContextTools(registries.stageMenu.getState().items, kind)
        .flat()
        .map((p) => p.id)
        .filter((id) => id.startsWith('t.'));
    expect(ids('table')).toEqual(['t.clipboard', 't.cells']);
    expect(ids('none')).toEqual(['t.clipboard', 't.ai']);
    expect(ids('image')).toEqual([]);
    for (const remove of removes) remove();
    expect(ids('none')).toEqual([]);
  });
});

describe('row A actions', () => {
  it('holds one handler per button', () => {
    const calls: string[] = [];
    const remove = registerAction('insert.text', () => calls.push('text'));
    registries.actions
      .getState()
      .items.find((a) => a.id === 'insert.text')
      ?.run?.();
    expect(calls).toEqual(['text']);
    remove();
    expect(registries.actions.getState().items.some((a) => a.id === 'insert.text')).toBe(false);
  });

  it('takes a popover in place of a handler', () => {
    const remove = registerActionPopover('insert.shape', Nothing);
    const entry = registries.actions.getState().items.find((a) => a.id === 'insert.shape');
    expect(entry?.popover).toBe(Nothing);
    expect(entry?.run).toBeUndefined();
    remove();
  });
});

describe('shortcuts', () => {
  it('writes a key combination one way', () => {
    expect(normalizeKeys('Ctrl+Shift+G')).toBe('ctrl+shift+g');
    expect(normalizeKeys('shift + ctrl + g')).toBe('ctrl+shift+g');
    expect(normalizeKeys('Ctrl+]')).toBe('ctrl+]');
    expect(normalizeKeys('T')).toBe('t');
  });

  it('finds the shortcuts of a combination, the latest first', () => {
    const run = () => true;
    const first = { id: 't.dup', keys: 'Ctrl+D', run };
    const second = { id: 't.dup2', keys: 'ctrl+d', run };
    const removeFirst = registerShortcut(first);
    const removeSecond = registerShortcut(second);
    expect(shortcutsFor('Ctrl+D')).toEqual([second, first]);
    expect(shortcutsFor('Ctrl+Shift+D')).toEqual([]);
    removeFirst();
    removeSecond();
    expect(shortcutsFor('Ctrl+D')).toEqual([]);
  });
});

describe('layers over the Stage', () => {
  it('keeps a layer until its area removes it', () => {
    const remove = registerStageLayer({ id: 't.layer', render: Nothing });
    expect(registries.stageLayers.getState().items.map((l) => l.id)).toContain('t.layer');
    remove();
    expect(registries.stageLayers.getState().items.map((l) => l.id)).not.toContain('t.layer');
  });
});
