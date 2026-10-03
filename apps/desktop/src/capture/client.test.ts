import { fixtureDecks } from '@slidr/model/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_WIDTH, CaptureError, captureSlide, pngBlob } from './client';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('captureSlide', () => {
  beforeEach(() => invoke.mockReset());

  it('sends only the slide, with the deck parts it renders from', async () => {
    const deck = fixtureDecks.hebrewDeck();
    const slide = deck.slides[1];
    if (!slide) throw new Error('the fixture needs two slides');
    invoke.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer);

    const png = await captureSlide(deck, slide.id, { workspaceId: 'w1' });

    expect(png).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(invoke).toHaveBeenCalledWith('capture_slide', {
      request: { deck: { ...deck, slides: [slide] }, workspaceId: 'w1' },
      width: CAPTURE_WIDTH.agent,
      fast: false,
    });
    expect(pngBlob(png).type).toBe('image/png');
  });

  it('passes the width and speed it is given', async () => {
    const deck = fixtureDecks.englishDeck();
    const slide = deck.slides[0];
    if (!slide) throw new Error('the fixture needs a slide');
    invoke.mockResolvedValue(new ArrayBuffer(0));
    await captureSlide(deck, slide.id, { width: CAPTURE_WIDTH.thumbnail, fast: true });
    expect(invoke).toHaveBeenCalledWith('capture_slide', {
      request: { deck: { ...deck, slides: [slide] }, workspaceId: null },
      width: 1920,
      fast: true,
    });
  });

  it('rejects with CaptureError', async () => {
    const deck = fixtureDecks.englishDeck();
    await expect(captureSlide(deck, 'nope')).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(invoke).not.toHaveBeenCalled();

    const id = deck.slides[0]?.id ?? '';
    invoke.mockRejectedValueOnce({ kind: 'timeout', message: 'the slide did not settle' });
    const timedOut = captureSlide(deck, id);
    await expect(timedOut).rejects.toBeInstanceOf(CaptureError);
    await expect(timedOut).rejects.toMatchObject({ kind: 'timeout' });
    invoke.mockRejectedValueOnce('IPC failed');
    await expect(captureSlide(deck, id)).rejects.toMatchObject({
      kind: 'internal',
      message: 'IPC failed',
    });
  });
});
