// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { agentActor, createElement, findElement } from '@slidr/model';
import { createEditor } from './editor';

/* What the editor itself does to the deck: keeping groups fitted after the agent's writes. */

function editorWithGroup() {
  const editor = createEditor({ lang: 'he', storage: null });
  const slideId = editor.bus.deck.slides[0]!.id;
  editor.bus.dispatch({
    type: 'element.add',
    slideId,
    element: createElement.group({
      id: 'g',
      frame: { x: 200, y: 200, w: 300, h: 100 },
      children: [
        createElement.shape({ id: 'a', frame: { x: 0, y: 0, w: 100, h: 100 } }),
        createElement.shape({ id: 'b', frame: { x: 200, y: 0, w: 100, h: 100 } }),
      ],
    }),
  });
  const frameOf = (id: string) => findElement(editor.bus.deck.slides[0]!, id)!.frame;
  return { editor, slideId, frameOf };
}

const move = (slideId: string, x: number) =>
  ({
    type: 'element.update',
    slideId,
    elementId: 'b',
    patch: { frame: { x, y: 0, w: 100, h: 100 } },
  }) as const;

describe('groups after a write of the agent', () => {
  it('are fitted to their children again, in the undo step of the turn', async () => {
    const { editor, slideId, frameOf } = editorWithGroup();
    const steps = editor.bus.undoStack.length;
    const actor = agentActor('s1', 't1');
    editor.bus.dispatch(move(slideId, 400), { actor, txId: 'tx_turn' });
    // Not yet: the change is still on its way to the subscribers.
    expect(frameOf('g').w).toBe(300);
    await Promise.resolve();
    expect(frameOf('g')).toEqual({ x: 200, y: 200, w: 500, h: 100 });
    expect(editor.bus.undoStack.length).toBe(steps + 1);
    editor.bus.undo();
    expect(frameOf('g')).toEqual({ x: 200, y: 200, w: 300, h: 100 });
    expect(frameOf('b').x).toBe(200);
  });

  it("leaves the user's own changes to whoever made them", async () => {
    const { editor, slideId, frameOf } = editorWithGroup();
    editor.bus.dispatch(move(slideId, 400), { txId: 'tx_drag' });
    await Promise.resolve();
    // A gesture of the Stage fits its groups itself, in its own commands.
    expect(frameOf('g').w).toBe(300);
  });
});
