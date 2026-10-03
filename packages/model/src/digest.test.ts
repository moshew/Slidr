import { describe, expect, it } from 'vitest';
import { CommandBus } from './bus';
import { agentActor, updateElement } from './commands';
import { ChangeDigest } from './digest';
import { allElementsDeck } from './fixtures';

const opacity = (id: string, value: number) => updateElement('s_all', id, { opacity: value });

describe('ChangeDigest (CMD-08)', () => {
  it('reports what others changed since the session last asked', () => {
    const bus = new CommandBus(allElementsDeck());
    const digest = new ChangeDigest(bus);
    digest.track('A');

    bus.dispatch(opacity('e_text', 0.5), { actor: agentActor('A', 't1'), txId: 't1' });
    bus.dispatch(opacity('e_image', 0.5));
    bus.dispatch({ type: 'element.remove', slideId: 's_all', elementIds: ['e_line'] });

    const summary = digest.take('A');
    expect(summary.slides).toEqual(['s_all']);
    expect(summary.elements).toEqual(['e_image']);
    expect(summary.removedElements).toEqual(['e_line']);
    expect(summary.theme).toBe(false);
    expect(digest.take('A').elements).toEqual([]);
  });

  it('counts the user undoing the agent as a change the agent must hear about', () => {
    const bus = new CommandBus(allElementsDeck());
    const digest = new ChangeDigest(bus);
    digest.track('A');
    bus.dispatch(opacity('e_text', 0.5), { actor: agentActor('A', 't1'), txId: 't1' });
    bus.undoTransaction('t1');
    expect(digest.take('A').elements).toEqual(['e_text']);
  });

  it('keeps a separate account for each session', () => {
    const bus = new CommandBus(allElementsDeck());
    const digest = new ChangeDigest(bus);
    digest.track('A');
    digest.track('B');
    bus.dispatch(opacity('e_text', 0.5), { actor: agentActor('A', 't1') });
    bus.dispatch({ type: 'theme.update', patch: { radius: 2 } }, { actor: agentActor('B', 't9') });
    expect(digest.take('A')).toMatchObject({ elements: [], theme: true });
    expect(digest.take('B')).toMatchObject({ elements: ['e_text'], theme: false });
  });

  it('reports slides that were added, moved or removed', () => {
    const bus = new CommandBus(allElementsDeck());
    const digest = new ChangeDigest(bus);
    digest.track('A');
    bus.dispatch({ type: 'slide.remove', slideIds: ['s_empty'] });
    const summary = digest.take('A');
    expect(summary.removedSlides).toEqual(['s_empty']);
    expect(summary.slideOrder).toBe(true);
  });

  it('starts empty for a session it did not know', () => {
    const bus = new CommandBus(allElementsDeck());
    const digest = new ChangeDigest(bus);
    bus.dispatch(opacity('e_text', 0.5));
    expect(digest.take('new').elements).toEqual([]);
    bus.dispatch(opacity('e_image', 0.5));
    expect(digest.take('new').elements).toEqual(['e_image']);
    digest.dispose();
    bus.dispatch(opacity('e_text', 0.4));
    expect(digest.take('new').elements).toEqual([]);
  });
});
