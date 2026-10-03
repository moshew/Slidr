import { describe, expect, it } from 'vitest';
import { Settings } from '@slidr/ui/icons';
import {
  groupContextTools,
  registerAction,
  registerContextTool,
  registerPanel,
  registries,
  type ContextToolDefinition,
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

describe('row A actions', () => {
  it('holds one handler per button', () => {
    const calls: string[] = [];
    const remove = registerAction('insert.text', () => calls.push('text'));
    registries.actions
      .getState()
      .items.find((a) => a.id === 'insert.text')
      ?.run();
    expect(calls).toEqual(['text']);
    remove();
    expect(registries.actions.getState().items.some((a) => a.id === 'insert.text')).toBe(false);
  });
});
