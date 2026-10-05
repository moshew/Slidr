/* eslint-disable @typescript-eslint/unbound-method -- the mocks of a service are read off the service */
import { createDeck, createElement, createSlide, newId, type AssetMeta } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it, vi } from 'vitest';
import type { HtmlImportService, ImportedSlide, LintService } from './services';
import { failed, ok, PIXEL, setup } from './testing';

/*
 * The import tools (SPEC 13.2): they exist in import sessions only, they add what the isolated
 * page captured as slides of the turn, and what they tell the agent is what the app measured.
 */

const fontAsset: AssetMeta = {
  id: 'f'.repeat(64),
  file: `${'f'.repeat(64)}.woff2`,
  mime: 'font/woff2',
  kind: 'font',
  bytes: 10,
  origin: 'import',
  font: { family: 'Deck Sans', weight: '400', style: 'normal', unicodeRange: 'U+0590-05FF' },
};

function captured(over: Partial<ImportedSlide> = {}): ImportedSlide {
  return {
    slide: createSlide({
      id: newId('s'),
      elements: [
        createElement.text({ frame: { x: 0, y: 0, w: 100, h: 50 }, content: { paragraphs: [] } }),
        createElement.html({ frame: { x: 0, y: 60, w: 100, h: 50 }, markup: '<b>x</b>' }),
      ],
    }),
    assets: [fontAsset],
    editability: 0.5,
    textEditability: 1,
    faithful: true,
    exact: true,
    wholeSlideHtml: false,
    source: { width: 1280, height: 720 },
    notes: ['Kept as HTML (element e_1): a pseudo-element.'],
    ...over,
  };
}

function importer(over: Partial<HtmlImportService> = {}): HtmlImportService {
  return {
    inspect: vi.fn(() => Promise.resolve('body [1920x1080 @0,0]')),
    evaluate: vi.fn((code: string) => Promise.resolve(JSON.stringify({ ran: code }))),
    screenshot: vi.fn(() =>
      Promise.resolve({ mimeType: 'image/png' as const, data: PIXEL, width: 1, height: 1 }),
    ),
    setViewport: vi.fn(() => Promise.resolve('viewport 1280x720; the page is 1280x720')),
    capture: vi.fn(() => Promise.resolve(captured())),
    captured: vi.fn(),
    ...over,
  };
}

const IMPORT = { kind: 'import', file: 'deck.html' } as const;
const NAMES = [
  'import_inspect',
  'import_eval',
  'import_screenshot',
  'import_set_viewport',
  'import_capture',
];

describe('the import tools', () => {
  it('exist in an import session, and in no other', () => {
    const { api } = setup(hebrewDeck(), { importer: importer() });
    const names = (scope: 'deck' | 'slide' | 'object' | 'import') =>
      api.list(scope).map((tool) => tool.name);
    expect(names('import')).toEqual(expect.arrayContaining(NAMES));
    // An import session keeps every tool of a deck session.
    expect(names('import')).toEqual(expect.arrayContaining(names('deck')));
    for (const scope of ['deck', 'slide', 'object'] as const) {
      expect(names(scope).filter((name) => name.startsWith('import_'))).toEqual([]);
    }
  });

  it('are not offered by an app without the isolated page', async () => {
    const { api, call } = setup(hebrewDeck(), {}, IMPORT);
    expect(api.list('import').filter((tool) => tool.name.startsWith('import_'))).toEqual([]);
    expect((await failed(call('import_inspect'))).code).toBe('unavailable');
  });

  it('are refused in a deck session', async () => {
    const { call } = setup(hebrewDeck(), { importer: importer() });
    expect((await failed(call('import_eval', { code: 'return 1' }))).code).toBe('out_of_scope');
  });

  it('pass exploration through to the page', async () => {
    const service = importer();
    const { call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    expect(await ok(call('import_inspect', { selector: 'main', depth: 2 }))).toEqual({
      page: 'body [1920x1080 @0,0]',
    });
    expect(service.inspect).toHaveBeenCalledWith({ selector: 'main', depth: 2 });
    expect(await ok(call('import_eval', { code: 'return 1' }))).toEqual({
      result: '{"ran":"return 1"}',
    });
    expect(await ok(call('import_set_viewport', { width: 1280, height: 720 }))).toEqual({
      viewport: 'viewport 1280x720; the page is 1280x720',
    });
    const shot = await call('import_screenshot', { maxWidth: 800 });
    expect(shot.ok && shot.images).toHaveLength(1);
    expect((await failed(call('import_set_viewport', { width: 10, height: 10 }))).code).toBe(
      'invalid_input',
    );
  });
});

describe('import_capture', () => {
  it('adds each captured slide with its assets, and reports what the app measured', async () => {
    const service = importer();
    const { bus, call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    const before = bus.deck.slides.length;
    const data = await ok(
      call('import_capture', {
        slides: [
          { selector: 'section:nth-of-type(1)', name: 'Cover', notes: 'Say **hello**.' },
          { js: 'document.querySelectorAll("section")[1]', before: 'go(1)', waitMs: 100 },
        ],
      }),
    );
    expect(bus.deck.slides).toHaveLength(before + 2);
    const [first, second] = bus.deck.slides.slice(-2);
    expect(first).toMatchObject({ name: 'Cover' });
    expect(first!.notes?.paragraphs[0]?.runs.map((run) => run.text).join('')).toBe('Say hello.');
    expect(second!.name).toBeUndefined();
    // The font the file carried is an asset of the deck, with the characters it is for.
    expect(bus.deck.assets[fontAsset.id]).toEqual(fontAsset);
    expect(service.capture).toHaveBeenNthCalledWith(2, expect.anything(), {
      js: 'document.querySelectorAll("section")[1]',
      before: 'go(1)',
      waitMs: 100,
    });
    // What the app keeps for its report is the slide as it entered the deck.
    expect(service.captured).toHaveBeenCalledTimes(2);
    expect(vi.mocked(service.captured!).mock.calls[0]![0].slide.name).toBe('Cover');

    expect(data.slidesInDeck).toBe(before + 2);
    // The registry's own summary names the slides the write touched.
    expect(data.slides).toEqual([first!.id, second!.id]);
    expect(data.captured).toEqual([
      {
        number: before + 1,
        slideId: first!.id,
        name: 'Cover',
        faithful: true,
        editablePercent: 50,
        textEditablePercent: 100,
        elements: '1 text, 1 html',
        remarks: [
          'The captured element is 1280x720 (1.78:1, not 16:9): check that it is the whole slide.',
          'Kept as HTML (element e_1): a pseudo-element.',
        ].slice(1),
      },
      expect.objectContaining({ number: before + 2, slideId: second!.id, faithful: true }),
    ]);
  });

  it('says what to look into: an odd shape, an approximate comparison, a slide that differs', async () => {
    const service = importer({
      capture: vi
        .fn()
        .mockResolvedValueOnce(captured({ source: { width: 900, height: 900 } }))
        .mockResolvedValueOnce(
          captured({ exact: false, source: { width: 921.6, height: 672, scale: 0.96 } }),
        )
        .mockResolvedValueOnce(captured({ exact: false }))
        .mockResolvedValueOnce(
          captured({
            faithful: false,
            exact: false,
            wholeSlideHtml: true,
            source: { width: 1536, height: 864, scale: 0.8 },
            notes: [
              'Kept as HTML (element e_1): a difference no element explains (1984 pixels).',
              'Kept as HTML (element e_2): a pseudo-element.',
            ],
          }),
        ),
    });
    const { call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    const data = await ok(
      call('import_capture', {
        slides: [{ selector: 'a' }, { selector: 'b' }, { selector: 'c' }, { selector: 'd' }],
      }),
    );
    const remarks = (data.captured as { remarks: string[] }[]).map((slide) =>
      slide.remarks.join(' '),
    );
    expect(remarks[0]).toMatch(/900x900 \(1\.00:1, not 16:9\): check that it is the whole slide/);
    // The scale the page shows the slide through is said, so that it can be undone.
    expect(remarks[1]).toMatch(
      /shows this slide at 96% of its own size, so it was compared approximately\. .* import_set_viewport with the viewport divided by 0\.96/,
    );
    expect(remarks[2]).toMatch(/through a scale or on a layer of its own/);
    // A slide that is html only says so, with the first reason and what to try.
    expect(remarks[3]).toMatch(
      /Nothing became an editable element: the slide is html only\. .* capture it again with `replaces`/,
    );
    expect(remarks[3]).toMatch(/look at it with slide_render/);
    expect(remarks[3]).toMatch(/a difference no element explains \(1984 pixels\)\. … and 1 more/);
  });

  it('captures a slide again in the place of the first capture', async () => {
    const fresh = createDeck({ lang: 'he', slides: [createSlide()] });
    const service = importer();
    const { bus, call } = setup(fresh, { importer: service }, IMPORT);
    await ok(
      call('import_capture', {
        slides: [
          { selector: 'a', name: 'One' },
          { selector: 'b', name: 'Two', notes: 'Say hello.' },
          { selector: 'c', name: 'Three' },
        ],
      }),
    );
    const second = bus.deck.slides[1]!;
    const data = await ok(
      call('import_capture', { slides: [{ selector: 'b', replaces: second.id }] }),
    );
    // It stands where the old one stood, under the same name and with the same notes.
    expect(bus.deck.slides.map((slide) => slide.name)).toEqual(['One', 'Two', 'Three']);
    expect(bus.deck.slides[1]!.id).not.toBe(second.id);
    expect(bus.deck.slides[1]!.notes).toEqual(second.notes);
    expect(data.captured).toEqual([expect.objectContaining({ number: 2, name: 'Two' })]);
    expect(data.slidesInDeck).toBe(3);

    // A slide that is not there is said, and nothing is captured for it.
    const missing = await ok(
      call('import_capture', { slides: [{ selector: 'b', replaces: 's_gone' }] }),
    );
    const [refused] = missing.captured as { error: string }[];
    expect(refused?.error).toMatch(/No slide s_gone in the deck/);
    expect(bus.deck.slides).toHaveLength(3);
    expect(service.capture).toHaveBeenCalledTimes(4);
  });

  it('replaces the slide it was asked to, also when the deck changed while the page worked', async () => {
    const fresh = createDeck({ lang: 'he', slides: [createSlide()] });
    // The capture runs in the isolated page and takes a while; the editor stays usable.
    let meanwhile: (() => void) | undefined;
    const service = importer({
      capture: vi.fn(async () => {
        await Promise.resolve();
        meanwhile?.();
        meanwhile = undefined;
        return captured();
      }),
    });
    const { bus, call } = setup(fresh, { importer: service }, IMPORT);
    await ok(
      call('import_capture', {
        slides: [
          { selector: 'a', name: 'One' },
          { selector: 'b', name: 'Two' },
          { selector: 'c', name: 'Three' },
        ],
      }),
    );
    const [one, two, three] = bus.deck.slides.map((slide) => slide.id) as [string, string, string];
    const names = () => bus.deck.slides.map((slide) => slide.name);

    // While "Two" is captured again, the user deletes "One" in the filmstrip.
    meanwhile = () => bus.dispatch({ type: 'slide.remove', slideIds: [one] });
    const first = await ok(call('import_capture', { slides: [{ selector: 'b', replaces: two }] }));
    expect(names()).toEqual(['Two', 'Three']);
    expect(bus.deck.slides.map((slide) => slide.id)).not.toContain(two);
    expect(bus.deck.slides[1]!.id).toBe(three);
    expect(first.captured).toEqual([expect.objectContaining({ number: 1, name: 'Two' })]);

    // While it is captured once more, a slide is added before it.
    const again = bus.deck.slides[0]!.id;
    meanwhile = () =>
      bus.dispatch({ type: 'slide.add', slide: createSlide({ name: 'Mine' }), index: 0 });
    await ok(call('import_capture', { slides: [{ selector: 'b', replaces: again }] }));
    expect(names()).toEqual(['Mine', 'Two', 'Three']);
    expect(bus.deck.slides.map((slide) => slide.id)).not.toContain(again);
    expect(bus.deck.slides[2]!.id).toBe(three);

    // The slide to replace is itself deleted meanwhile: said, and nothing else is touched.
    const last = bus.deck.slides[1]!.id;
    meanwhile = () => bus.dispatch({ type: 'slide.remove', slideIds: [last] });
    const gone = await ok(call('import_capture', { slides: [{ selector: 'b', replaces: last }] }));
    const [refused] = gone.captured as { error: string }[];
    expect(refused?.error).toMatch(/was removed from the deck while the page worked/);
    expect(names()).toEqual(['Mine', 'Three']);
  });

  it('replaces the untouched slide a new deck starts with, and only that', async () => {
    const fresh = createDeck({ lang: 'he', slides: [createSlide()] });
    const service = importer();
    const { bus, call } = setup(fresh, { importer: service }, IMPORT);
    const placeholder = bus.deck.slides[0]!.id;
    await ok(call('import_capture', { slides: [{ selector: 'a' }, { selector: 'b' }] }));
    expect(bus.deck.slides).toHaveLength(2);
    expect(bus.deck.slides.map((slide) => slide.id)).not.toContain(placeholder);

    // A deck whose only slide has content keeps it.
    const used = setup(
      createDeck({ lang: 'he', slides: [createSlide({ name: 'Mine' })] }),
      { importer: importer() },
      IMPORT,
    );
    await ok(used.call('import_capture', { slides: [{ selector: 'a' }] }));
    expect(used.bus.deck.slides.map((slide) => slide.name)).toEqual(['Mine', undefined]);
  });

  it('is one undo step with the rest of the turn, and comes back on redo', async () => {
    const fresh = createDeck({ lang: 'he', slides: [createSlide()] });
    const { bus, call, turn } = setup(fresh, { importer: importer() }, IMPORT);
    const start = bus.deck;
    await ok(call('import_capture', { slides: [{ selector: 'a' }] }));
    await ok(call('import_capture', { slides: [{ selector: 'b' }, { selector: 'c' }] }));
    const imported = bus.deck;
    expect(imported.slides).toHaveLength(3);
    expect(Object.keys(imported.assets)).toEqual([fontAsset.id]);

    expect(bus.undoTransaction(turn.txId)).toBe(true);
    expect(bus.deck.slides).toEqual(start.slides);
    expect(bus.deck.assets).toEqual({});
    expect(bus.redo()).toBe(true);
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual(
      imported.slides.map((slide) => slide.id),
    );
    expect(Object.keys(bus.deck.assets)).toEqual([fontAsset.id]);
  });

  it('goes on after a slide that could not be captured, and says why', async () => {
    const service = importer({
      capture: vi
        .fn()
        .mockResolvedValueOnce(captured())
        .mockRejectedValueOnce(new Error('No element matches the selector "#gone".'))
        .mockResolvedValueOnce(captured()),
    });
    const { bus, call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    const before = bus.deck.slides.length;
    const data = await ok(
      call('import_capture', {
        slides: [{ selector: '#a' }, { selector: '#gone' }, { selector: '#c' }],
      }),
    );
    expect(bus.deck.slides).toHaveLength(before + 2);
    expect((data.captured as unknown[])[1]).toEqual({
      failed: '#gone',
      error: 'No element matches the selector "#gone".',
    });
    expect(service.captured).toHaveBeenCalledTimes(2);
  });

  it('stops starting slides when the call runs long, and says how many are left', async () => {
    vi.useFakeTimers();
    try {
      const service = importer({
        capture: vi.fn(async () => {
          vi.advanceTimersByTime(25_000);
          return Promise.resolve(captured());
        }),
      });
      const { bus, call } = setup(hebrewDeck(), { importer: service }, IMPORT);
      const before = bus.deck.slides.length;
      const data = await ok(
        call('import_capture', {
          slides: [{ selector: 'a' }, { selector: 'b' }, { selector: 'c' }, { selector: 'd' }],
        }),
      );
      expect(bus.deck.slides).toHaveLength(before + 2);
      expect(data.notCaptured).toMatch(/The last 2 of this call were not started/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes an empty string for a field that was not given', async () => {
    const service = importer();
    const { call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    await ok(
      call('import_capture', {
        slides: [{ selector: 'a', js: '', before: '', name: '', notes: '' }],
      }),
    );
    expect(service.capture).toHaveBeenCalledWith(expect.anything(), {
      selector: 'a',
      js: '',
      before: '',
    });
  });

  it("is not judged by the design check as it goes: the design is the user's", async () => {
    const lint: LintService = { lint: vi.fn(() => Promise.resolve([])) };
    const { call } = setup(hebrewDeck(), { importer: importer(), lint }, IMPORT);
    const data = await ok(call('import_capture', { slides: [{ selector: 'a' }] }));
    expect(data).not.toHaveProperty('lint');
    // Nor is anything else an import session writes: naming a slide is not a reason to be
    // told its text is small. The lint tools are there to ask.
    const slideId = (data.captured as { slideId: string }[])[0]!.slideId;
    expect(await ok(call('slide_update', { slideId, name: 'Renamed' }))).not.toHaveProperty('lint');
    expect(lint.lint).not.toHaveBeenCalled();
    await ok(call('slide_lint', { slideId }));
    expect(lint.lint).toHaveBeenCalledTimes(1);

    // A deck session is told what the design check found after every write, as before.
    const deck = setup(hebrewDeck(), { lint });
    const first = deck.bus.deck.slides[0]!.id;
    expect(await ok(deck.call('slide_update', { slideId: first, name: 'Renamed' }))).toHaveProperty(
      'lint',
    );
  });

  it('tells the app the size of the plan, and what each slide was captured from', async () => {
    const service = importer({ planned: vi.fn() });
    const { call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    await ok(
      call('import_capture', {
        total: 12,
        slides: [
          { js: 'document.querySelectorAll("section")[0]', before: 'show(0)', waitMs: 100 },
          { selector: 'section:nth-of-type(2)', before: '', name: 'Two' },
        ],
      }),
    );
    expect(service.planned).toHaveBeenCalledExactlyOnceWith(12);
    // What the agent pointed at, and the script it ran first: no wait, no name, no empty field.
    const from = vi.mocked(service.captured!).mock.calls.map((args) => args[1]);
    expect(from).toEqual([
      { js: 'document.querySelectorAll("section")[0]', before: 'show(0)' },
      { selector: 'section:nth-of-type(2)' },
    ]);

    // A call that does not say leaves the plan as it was.
    await ok(call('import_capture', { slides: [{ selector: 'c' }] }));
    expect(service.planned).toHaveBeenCalledTimes(1);
    expect(
      (await failed(call('import_capture', { total: 0, slides: [{ selector: 'c' }] }))).code,
    ).toBe('invalid_input');
  });

  it('starts no slide once its turn is over, and adds none that was on its way (IMP-09)', async () => {
    // The turn is stopped while the page works on the second slide of four.
    const turn = { aborted: false };
    let release: (slide: ImportedSlide) => void = () => undefined;
    const service = importer({
      interruption: () => turn,
      capture: vi
        .fn()
        .mockResolvedValueOnce(captured())
        .mockImplementationOnce(() => new Promise<ImportedSlide>((resolve) => (release = resolve))),
    });
    const { bus, call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    const before = bus.deck.slides.length;
    const running = call('import_capture', {
      slides: [{ selector: 'a' }, { selector: 'b' }, { selector: 'c' }, { selector: 'd' }],
    });
    await vi.waitFor(() => expect(service.capture).toHaveBeenCalledTimes(2));
    expect(bus.deck.slides).toHaveLength(before + 1);
    turn.aborted = true;
    release(captured());

    const data = await ok(running);
    // The first slide is in; the one the page finished after the stop is not, and nothing more
    // was asked of the page.
    expect(bus.deck.slides).toHaveLength(before + 1);
    expect(service.capture).toHaveBeenCalledTimes(2);
    expect(service.captured).toHaveBeenCalledTimes(1);
    expect(data.captured).toHaveLength(1);
    expect(data.notCaptured).toBe(
      'The turn was stopped: the last 3 of this call were not captured.',
    );
  });

  it('captures nothing for a call that begins after its turn was stopped', async () => {
    const service = importer({ interruption: () => ({ aborted: true }) });
    const { bus, call } = setup(hebrewDeck(), { importer: service }, IMPORT);
    const before = bus.deck.slides.length;
    const data = await ok(call('import_capture', { slides: [{ selector: 'a' }] }));
    expect(service.capture).not.toHaveBeenCalled();
    expect(bus.deck.slides).toHaveLength(before);
    expect(data.notCaptured).toMatch(/The turn was stopped: the last 1 /);
  });
});
