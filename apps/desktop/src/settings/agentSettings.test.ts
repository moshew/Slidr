// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentSettings, setAgentSettings, setConversationSettings } from './agentSettings';
import { pageSettings, replaceSection, useSettings } from './store';

/*
 * The agent's settings (AGT-04): the app's are a section of the settings file, a conversation
 * may have a model and an effort of its own over them, and a value an earlier version kept in
 * `localStorage` is carried into the file.
 */

const LEGACY = 'slidr.agent';
/** The section as the settings file holds it, once the writes so far are in it. */
const inFile = async () => {
  await replaceSection('probe', null);
  return (await pageSettings.read()).agent;
};

afterEach(async () => {
  localStorage.clear();
  for (const thread of ['deck', 'deck-c1', 'slide-s1']) {
    setConversationSettings(thread, { model: undefined, effort: undefined });
  }
  await replaceSection('agent', null);
});

describe("the app's settings", () => {
  it('are a section of the settings file, and a setting that is cleared is not in it', async () => {
    expect(agentSettings()).toEqual({});
    setAgentSettings({ harnessId: 'claude-code', model: 'opus', webAccess: false });
    // A session reads them without waiting for the file.
    expect(agentSettings()).toEqual({ harnessId: 'claude-code', model: 'opus', webAccess: false });
    expect(await inFile()).toEqual({ harnessId: 'claude-code', model: 'opus', webAccess: false });

    setAgentSettings({ webAccess: undefined, effort: 'high' });
    expect(await inFile()).toEqual({ harnessId: 'claude-code', model: 'opus', effort: 'high' });
    setAgentSettings({ harnessId: undefined, model: undefined, effort: undefined });
    expect(await inFile()).toBeUndefined();
    expect(localStorage.getItem(LEGACY)).toBeNull();
  });

  it('are read as the fields this version knows, each of its own type', () => {
    useSettings.setState({
      sections: {
        agent: {
          harnessId: 'mock',
          model: 5,
          effort: '',
          webAccess: 'no',
          qualityGate: false,
          outline: 'later',
          mockSpeed: 0,
          other: true,
        },
      },
    });
    expect(agentSettings()).toEqual({ harnessId: 'mock', qualityGate: false, mockSpeed: 0 });
    for (const broken of [null, 'opus', ['opus'], 3]) {
      useSettings.setState({ sections: { agent: broken } });
      expect(agentSettings()).toEqual({});
    }
  });

  it('are the same object until they change, for a component that shows them', () => {
    setAgentSettings({ model: 'opus' });
    expect(agentSettings()).toBe(agentSettings());
  });
});

describe('what an earlier version kept in localStorage', () => {
  it('is carried into the settings file and removed from there', async () => {
    localStorage.setItem(
      LEGACY,
      JSON.stringify({
        harnessId: 'claude-code',
        model: 'sonnet',
        effort: 'low',
        outline: 'build',
      }),
    );
    expect(agentSettings()).toEqual({
      harnessId: 'claude-code',
      model: 'sonnet',
      effort: 'low',
      outline: 'build',
    });
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect(await inFile()).toEqual({
      harnessId: 'claude-code',
      model: 'sonnet',
      effort: 'low',
      outline: 'build',
    });
    // Once: a change made afterwards is not written back there.
    setAgentSettings({ model: 'opus' });
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect(agentSettings().model).toBe('opus');
  });

  it('is the whole of the settings as they were, and so replaces the section', async () => {
    setAgentSettings({ model: 'opus', qualityGate: false });
    // A suite that drives the app sets the agent this way in the middle of a run.
    localStorage.setItem(LEGACY, JSON.stringify({ harnessId: 'mock', model: 'deck-build' }));
    expect(agentSettings('deck')).toEqual({ harnessId: 'mock', model: 'deck-build' });
    expect(await inFile()).toEqual({ harnessId: 'mock', model: 'deck-build' });
  });

  it('is dropped when it cannot be read', async () => {
    setAgentSettings({ model: 'opus' });
    localStorage.setItem(LEGACY, '{ not json');
    expect(agentSettings()).toEqual({ model: 'opus' });
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect(await inFile()).toEqual({ model: 'opus' });
  });

  it('is looked for as the app starts, before anything asks', async () => {
    localStorage.setItem(LEGACY, JSON.stringify({ model: 'haiku' }));
    vi.resetModules();
    const fresh = await import('./store');
    await import('./agentSettings');
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect(fresh.useSettings.getState().sections.agent).toEqual({ model: 'haiku' });
    await fresh.replaceSection('agent', null);
  });
});

describe('what a conversation chose for itself', () => {
  it("lies over the app's settings for that conversation, and leaves them as they are", async () => {
    setAgentSettings({ model: 'sonnet', effort: 'low', webAccess: false });
    setConversationSettings('deck', { model: 'opus' });
    expect(agentSettings('deck')).toEqual({ model: 'opus', effort: 'low', webAccess: false });
    // Another conversation, and the app itself, are where they were.
    expect(agentSettings('deck-c1')).toEqual({ model: 'sonnet', effort: 'low', webAccess: false });
    expect(agentSettings()).toEqual({ model: 'sonnet', effort: 'low', webAccess: false });
    expect(await inFile()).toEqual({ model: 'sonnet', effort: 'low', webAccess: false });

    setConversationSettings('deck', { effort: 'high' });
    expect(agentSettings('deck')).toMatchObject({ model: 'opus', effort: 'high' });
  });

  it("follows the app's again once the choice is given back", () => {
    setAgentSettings({ model: 'sonnet' });
    setConversationSettings('deck', { model: 'opus', effort: 'high' });
    setConversationSettings('deck', { model: undefined });
    expect(agentSettings('deck')).toEqual({ model: 'sonnet', effort: 'high' });
    setConversationSettings('deck', { effort: undefined });
    expect(agentSettings('deck')).toBe(agentSettings());
    // The default that changes reaches it.
    setAgentSettings({ model: 'haiku' });
    expect(agentSettings('deck').model).toBe('haiku');
  });

  it('is dropped when the app moves to another harness, which has other models', () => {
    setAgentSettings({ harnessId: 'claude-code' });
    setConversationSettings('deck', { model: 'opus' });
    setConversationSettings('slide-s1', { effort: 'high' });
    // A change that is not of the harness leaves them.
    setAgentSettings({ webAccess: false });
    expect(agentSettings('deck').model).toBe('opus');
    setAgentSettings({ harnessId: 'mock', model: undefined, effort: undefined });
    expect(agentSettings('deck')).toEqual({ harnessId: 'mock', webAccess: false });
    expect(agentSettings('slide-s1')).toEqual({ harnessId: 'mock', webAccess: false });
  });
});
