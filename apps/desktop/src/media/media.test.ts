// @vitest-environment happy-dom
import { imagePlaceholders } from '@slidr/agent-tools';
import { createElement, findElementInDeck, type AssetMeta } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageClient, ImageJobResult, ImageOutcome } from '../images/images';
import { createEditor, type Editor } from '../shell/editor';
import { ICON_COLOR, insertAsset, insertIcon } from './insert';
import { cancelFill, fillPlaceholder, fillPlaceholders, type FillImages } from './placeholders';
import { useMedia } from './store';
import './register';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

const ROCKET =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 15v5"/></svg>';

function editor(): Editor {
  return createEditor({ lang: 'he', storage: null });
}

const currentSlide = (e: Editor) => {
  const id = e.selection.getState().currentSlideId;
  return e.bus.deck.slides.find((slide) => slide.id === id)!;
};

function photo(id: string, extra: Partial<AssetMeta> = {}): AssetMeta {
  return {
    id: id.repeat(64),
    file: `${id.repeat(64)}.jpg`,
    mime: 'image/jpeg',
    kind: 'image',
    bytes: 1000,
    width: 2400,
    height: 1600,
    origin: 'stock',
    attribution: { author: 'Dana Levi', url: 'https://example.com/p', license: 'Mock License' },
    ...extra,
  };
}

describe('inserting from the media panel', () => {
  it('an icon is one undo step, selected, in a colour of the theme', () => {
    const e = editor();
    const before = e.bus.undoStack.length;
    expect(insertIcon(e, { id: 'lucide:rocket', name: 'rocket', svg: ROCKET })).toBe(true);

    const [icon] = currentSlide(e).elements;
    expect(icon).toMatchObject({
      type: 'svg',
      name: 'lucide:rocket',
      markup: ROCKET,
      // The icon draws in currentColor, and the element sets it to a token: it follows the theme.
      colorOverrides: { currentColor: { token: 'primary' } },
    });
    expect(ICON_COLOR).toEqual({ token: 'primary' });
    expect(icon?.frame).toMatchObject({ w: 160, h: 160 });
    expect(e.selection.getState().selectedElementIds).toEqual([icon?.id]);
    expect(e.bus.undoStack.length).toBe(before + 1);

    e.bus.undo();
    expect(currentSlide(e).elements).toEqual([]);
    e.bus.redo();
    expect(currentSlide(e).elements).toHaveLength(1);

    // A second icon does not land exactly on the first.
    insertIcon(e, { id: 'lucide:rocket', name: 'rocket', svg: ROCKET });
    const [first, second] = currentSlide(e).elements;
    expect(second?.frame.x).not.toBe(first?.frame.x);
  });

  it('a stock photo brings its asset and its credit in the same undo step', () => {
    const e = editor();
    const asset = photo('a');
    const before = e.bus.undoStack.length;
    expect(insertAsset(e, asset)).toBe(true);

    expect(e.bus.deck.assets[asset.id]).toMatchObject({
      origin: 'stock',
      attribution: { author: 'Dana Levi', license: 'Mock License' },
    });
    const [image] = currentSlide(e).elements;
    expect(image).toMatchObject({ type: 'image', assetId: asset.id });
    expect(e.selection.getState().selectedElementIds).toEqual([image?.id]);
    expect(e.bus.undoStack.length).toBe(before + 1);

    // Undo takes the element and the asset back together; redo brings both.
    e.bus.undo();
    expect(currentSlide(e).elements).toEqual([]);
    expect(e.bus.deck.assets).not.toHaveProperty(asset.id);
    e.bus.redo();
    expect(e.bus.deck.assets).toHaveProperty(asset.id);

    // A picture the deck already has is only placed: the step holds the element alone.
    insertAsset(e, asset);
    expect(currentSlide(e).elements).toHaveLength(2);
    e.bus.undo();
    expect(e.bus.deck.assets).toHaveProperty(asset.id);
  });

  it('does nothing without a slide', () => {
    const e = editor();
    e.bus.dispatch({ type: 'slide.remove', slideIds: e.bus.deck.slides.map((s) => s.id) });
    expect(insertIcon(e, { id: 'lucide:rocket', name: 'rocket', svg: ROCKET })).toBe(false);
    expect(insertAsset(e, photo('a'))).toBe(false);
  });
});

/** An image client that answers each job with the outcomes given, when told to. */
function fakeImages(outcome: (index: number) => ImageOutcome) {
  const jobs: { jobId: string; prompt: string; aspect: string; finish: () => void }[] = [];
  const cancelled: string[] = [];
  const client = {
    generate: vi.fn(
      (jobId: string, _workspace: string, job: { prompt: string; aspect: string }) =>
        new Promise<ImageJobResult>((resolve) => {
          const index = jobs.length;
          jobs.push({
            jobId,
            prompt: job.prompt,
            aspect: job.aspect,
            finish: () => resolve({ provider: 'example', images: [outcome(index)] }),
          });
        }),
    ),
    cancel: vi.fn((jobId: string) => {
      cancelled.push(jobId);
      return Promise.resolve();
    }),
  };
  const images: FillImages = {
    client: client as unknown as ImageClient,
    workspaceId: () => 'w1',
  };
  return { images, jobs, cancelled };
}

const stored = (id: string): ImageOutcome => ({
  status: 'stored',
  asset: {
    id: id.repeat(64),
    file: `${id.repeat(64)}.png`,
    mime: 'image/png',
    kind: 'image',
    bytes: 10,
    width: 1792,
    height: 1008,
  },
  durationMs: 1,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('filling the image placeholders', () => {
  beforeEach(() => useMedia.setState({ jobs: {} }));

  function withPlaceholders() {
    const e = editor();
    const slideId = currentSlide(e).id;
    e.bus.batch([
      {
        type: 'element.add',
        slideId,
        element: createElement.image({
          id: 'p_wide',
          frame: { x: 0, y: 0, w: 960, h: 540 },
          prompt: 'A fishing harbour at sunrise',
        }),
      },
      {
        type: 'element.add',
        slideId,
        element: createElement.image({
          id: 'p_tall',
          frame: { x: 1000, y: 0, w: 400, h: 900 },
          prompt: 'A lighthouse at dusk',
        }),
      },
    ]);
    e.bus.dispatch({ type: 'deck.setMeta', patch: { imageStyle: 'Flat vector illustration.' } });
    return e;
  }

  it('makes each image from its own prompt, with the deck style, at the shape of its frame', async () => {
    const e = withPlaceholders();
    const { images, jobs } = fakeImages((i) => stored(['a', 'b'][i]!));
    const before = e.bus.undoStack.length;
    const filling = fillPlaceholders(e, imagePlaceholders(e.bus.deck), images);

    expect(jobs.map((job) => [job.prompt.split('\n')[0], job.aspect])).toEqual([
      ['A fishing harbour at sunrise', '16:9'],
      ['A lighthouse at dusk', '9:16'],
    ]);
    expect(jobs[0]?.prompt).toContain('Style, shared by every image of this presentation: Flat');
    expect(useMedia.getState().jobs).toMatchObject({
      p_wide: { state: 'working' },
      p_tall: { state: 'working' },
    });

    // Each image lands as it arrives: one undo step of its own, asset and element together.
    jobs[1]?.finish();
    await settle();
    expect(findElementInDeck(e.bus.deck, 'p_tall')?.element).toMatchObject({
      assetId: 'b'.repeat(64),
    });
    expect(findElementInDeck(e.bus.deck, 'p_wide')?.element).not.toHaveProperty('assetId');
    expect(e.bus.undoStack.length).toBe(before + 1);
    jobs[0]?.finish();
    await filling;
    expect(e.bus.undoStack.length).toBe(before + 2);
    expect(e.bus.deck.assets['a'.repeat(64)]).toMatchObject({
      origin: 'ai',
      // What the user asked for, without the style that was added to it.
      lineage: { provider: 'example', prompt: 'A fishing harbour at sunrise' },
    });
    expect(useMedia.getState().jobs).toEqual({});
    expect(imagePlaceholders(e.bus.deck)).toEqual([]);

    // Undo gives the placeholder its prompt back, and takes the asset away.
    e.bus.undo();
    expect(findElementInDeck(e.bus.deck, 'p_wide')?.element).toMatchObject({
      prompt: 'A fishing harbour at sunrise',
    });
    expect(e.bus.deck.assets).not.toHaveProperty('a'.repeat(64));
  });

  it('says why an image was not made, and leaves the placeholder as it was', async () => {
    const e = withPlaceholders();
    const { images, jobs } = fakeImages(() => ({
      status: 'failed',
      error: { kind: 'not_logged_in', message: 'Sign in to the image tool.' },
    }));
    const [wide] = imagePlaceholders(e.bus.deck);
    const before = e.bus.deck;
    const filling = fillPlaceholder(e, wide!, images);
    jobs[0]?.finish();
    await filling;
    expect(useMedia.getState().jobs.p_wide).toEqual({
      state: 'failed',
      error: 'Sign in to the image tool.',
    });
    expect(e.bus.deck).toBe(before);
  });

  it('a stopped image leaves no trace, and one job is not started twice', async () => {
    const e = withPlaceholders();
    const { images, jobs, cancelled } = fakeImages(() => ({
      status: 'failed',
      error: { kind: 'cancelled', message: 'the job was cancelled' },
    }));
    const [wide] = imagePlaceholders(e.bus.deck);
    const filling = fillPlaceholder(e, wide!, images);
    // A second click while the first image is on its way does nothing.
    await fillPlaceholder(e, wide!, images);
    expect(jobs).toHaveLength(1);

    await cancelFill(e, 'p_wide', images);
    expect(cancelled).toEqual([jobs[0]?.jobId]);
    jobs[0]?.finish();
    await filling;
    expect(useMedia.getState().jobs).toEqual({});
  });

  it('keeps the image as an asset when its placeholder is gone by the time it arrives', async () => {
    const e = withPlaceholders();
    const { images, jobs } = fakeImages(() => stored('c'));
    const [wide] = imagePlaceholders(e.bus.deck);
    const filling = fillPlaceholder(e, wide!, images);
    e.bus.dispatch({
      type: 'element.remove',
      slideId: wide!.slideId,
      elementIds: ['p_wide'],
    });
    jobs[0]?.finish();
    await filling;
    expect(e.bus.deck.assets).toHaveProperty('c'.repeat(64));
    expect(findElementInDeck(e.bus.deck, 'p_wide')).toBeUndefined();
  });

  it('needs an open document', async () => {
    const e = withPlaceholders();
    const { images, jobs } = fakeImages(() => stored('d'));
    const [wide] = imagePlaceholders(e.bus.deck);
    await fillPlaceholder(e, wide!, { ...images, workspaceId: () => null });
    expect(jobs).toEqual([]);
    expect(useMedia.getState().jobs.p_wide).toMatchObject({ state: 'failed' });
  });
});
