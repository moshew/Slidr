import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { answerDialog, invoke, launchApp, showPanel, type RunningApp } from './app';
import { crowdedDeck, longDeck, openDeckFile, writeDeckFile, writePictureDeck } from './decks';

/*
 * The performance pass (WG13-T01): NFR-01 to NFR-07 of SPEC 14.4, measured in the packaged app.
 * Asked for by name, since it is a measurement and not a gate of every run:
 *
 *   SLIDR_PERF=1 pnpm exec playwright test -c packaged/playwright.config.ts --project=perf
 *
 * Every number is written to test-results/hardening/perf.json as it is measured. A target that
 * is missed is written there too, and fails the run at its end, after everything was measured.
 * Times are read inside the page, from its own clock: the request that opened a file, the
 * change that reached the page, the frames that were drawn.
 *
 * Frame times need the window to be drawn: a window behind another gets no frames. The run
 * checks the idle frame rate first, and says so in the results when it could not measure.
 */

const OUT = fileURLToPath(new URL('../test-results/hardening/', import.meta.url));
const RESULTS = join(OUT, 'perf.json');
/** The deck files of a run: made once, by whichever measurement needs one first. */
const FILES = join(tmpdir(), 'slidr-perf');

type Results = Record<string, unknown> & { misses?: string[] };
const read = (): Results =>
  existsSync(RESULTS) ? (JSON.parse(readFileSync(RESULTS, 'utf8')) as Results) : {};

/** Adds a measurement to the results file. */
function record(name: string, value: unknown): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(RESULTS, `${JSON.stringify({ ...read(), [name]: value }, null, 2)}\n`);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : NaN;
};
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

/** Holds a measurement to its target: a miss is written down, and fails the run at its end. */
function target(name: string, measured: number, limit: number): void {
  if (measured < limit) return;
  const miss = `${name}: ${round(measured)} is not under ${round(limit)}`;
  record('misses', [...(read().misses ?? []), miss]);
}

/** The file of a deck of `count` slides, with a picture on each when asked; made when missing. */
async function deckFile(page: Page, count: number, pictures = false): Promise<string> {
  mkdirSync(FILES, { recursive: true });
  const file = join(FILES, `${count}${pictures ? '-pictures' : ''}.slidr`);
  if (!existsSync(file)) {
    if (pictures) await writePictureDeck(page, file, count);
    else await writeDeckFile(page, file, longDeck(count));
  }
  return file;
}

/** Opens a file whatever is open now: unsaved changes of the measurement before are let go. */
async function open(page: Page, file: string, slides: number): Promise<void> {
  const question = page.getByRole('dialog').filter({ hasText: 'לשמור את השינויים' });
  const name = page.getByTestId('document-name');
  // A new deck first, so that the file is opened over a document with nothing to ask about.
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+n');
  await expect(question.or(name.filter({ hasText: 'מצגת ללא שם' })).first()).toBeVisible();
  if (await question.isVisible()) {
    await question.getByRole('button', { name: 'בלי לשמור' }).click();
  }
  await expect(name).toHaveText('מצגת ללא שם');
  await expect(page.getByTestId('status-slide')).toHaveText('שקף 1 מתוך 1');
  await openDeckFile(page, file);
  await expect(name).toHaveText(basename(file, '.slidr'));
  await expect(page.getByTestId('status-slide')).toHaveText(`שקף 1 מתוך ${slides}`);
}

test.describe.configure({ mode: 'serial' });

test('NFR-06: the app is up in under two seconds', async () => {
  // A run begins here: what an earlier one wrote and made is cleared.
  rmSync(RESULTS, { force: true });
  rmSync(FILES, { recursive: true, force: true });
  interface Run {
    /** From the process starting to the page beginning to load: the webview coming up. */
    toNavigation: number;
    /** From there: the page's own scripts done, the first paint, the document ready. */
    scripts: number;
    firstPaint: number | null;
    ready: number;
  }
  const runs: Run[] = [];
  for (let i = 0; i < 7; i++) {
    const app = await launchApp();
    const timing = await app.page.evaluate(() => {
      const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      const [navigation] = performance.getEntriesByType(
        'navigation',
      ) as PerformanceNavigationTiming[];
      // The app is ready for work when its document has a workspace: the last thing it does
      // on its way up.
      const created = performance
        .getEntriesByType('resource')
        .find((entry) => entry.name.endsWith('/storage_new')) as
        PerformanceResourceTiming | undefined;
      return {
        origin: performance.timeOrigin,
        scripts: navigation?.domContentLoadedEventEnd ?? NaN,
        paint,
        ready: created?.responseEnd ?? NaN,
      };
    });
    runs.push({
      toNavigation: timing.origin - app.startedAt,
      scripts: timing.scripts,
      firstPaint: timing.paint ?? null,
      ready: timing.ready,
    });
    await app.kill();
  }
  const total = runs.map((run) => run.toNavigation + run.ready);
  record('NFR-06 start', {
    target: 'under 2000 ms from the process starting to a document ready for work',
    runs: runs.map((run) => ({
      webviewUpMs: round(run.toNavigation, 0),
      thenScriptsDoneMs: round(run.scripts, 0),
      thenFirstPaintMs: run.firstPaint === null ? null : round(run.firstPaint, 0),
      thenReadyMs: round(run.ready, 0),
      totalMs: round(run.toNavigation + run.ready, 0),
    })),
    medianTotalMs: round(median(total), 0),
    fastestTotalMs: round(Math.min(...total), 0),
    slowestTotalMs: round(Math.max(...total), 0),
    // What is the app's own: from the page beginning to load to a document ready.
    medianPageMs: round(median(runs.map((run) => run.ready)), 0),
    medianWebviewUpMs: round(median(runs.map((run) => run.toNavigation)), 0),
  });
  target('NFR-06 start, median ms', median(total), 2000);
});

test.describe('with a deck open', () => {
  let app: RunningApp;

  test.beforeAll(async () => {
    app = await launchApp({ env: { SLIDR_AGENT_MOCK: '1' } });
    await app.page.evaluate(() => performance.setResourceTimingBufferSize(20_000));
  });

  test.afterAll(async () => {
    await app?.kill();
  });

  /** Starts counting frames in the page; `stop` returns the time between each two. */
  const frames = {
    start: (page: Page) =>
      page.evaluate(() => {
        const w = window as unknown as { __frames?: number[]; __raf?: number };
        const seen: number[] = [];
        w.__frames = seen;
        let last = performance.now();
        const tick = (now: number) => {
          seen.push(now - last);
          last = now;
          w.__raf = requestAnimationFrame(tick);
        };
        w.__raf = requestAnimationFrame(tick);
      }),
    stop: (page: Page) =>
      page.evaluate(() => {
        const w = window as unknown as { __frames?: number[]; __raf?: number };
        cancelAnimationFrame(w.__raf ?? 0);
        // The first interval is the wait for the first frame, not a frame.
        return (w.__frames ?? []).slice(1);
      }),
  };

  /** What the frames are like while nothing happens: what the machine gives at this moment. */
  let atRest: { frames: number; dropped: number } | null = null;

  /** The frame interval of this screen while nothing happens, or null when no frames come. */
  async function idleFrame(page: Page): Promise<number | null> {
    await frames.start(page);
    await page.waitForTimeout(2500);
    const idle = await frames.stop(page);
    if (idle.length < 20) return null;
    const middle = median(idle);
    atRest = { frames: idle.length, dropped: idle.filter((ms) => ms > middle * 1.6).length };
    return middle;
  }

  function frameStats(intervals: number[], idle: number) {
    return {
      frames: intervals.length,
      medianMs: round(median(intervals)),
      p95Ms: round(percentile(intervals, 0.95)),
      worstMs: round(Math.max(...intervals)),
      // A frame that took the time of two or more: one the eye can see.
      dropped: intervals.filter((ms) => ms > idle * 1.6).length,
      fps: round(1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length), 0),
    };
  }

  /** The page's own work in a frame, of the time a frame has. */
  const busyStats = (busy: number[]) => ({
    median: round(median(busy)),
    p95: round(percentile(busy, 0.95)),
    worst: round(Math.max(...busy)),
  });

  /** Opens a file and reports, from the request that opened it: unpacked, shown, painted. */
  async function timedOpen(page: Page, file: string, slides: number) {
    await page.evaluate((count) => {
      performance.clearResourceTimings();
      const w = window as unknown as { __opened?: Promise<{ shown: number; painted: number }> };
      w.__opened = new Promise((resolve) => {
        const status = document.querySelector('[data-testid="status-slide"]')!;
        const done = () => new RegExp(`\\D${count}$`).test(status.textContent.trim());
        const finish = () => {
          const shown = performance.now();
          // Two frames on: the first to draw what React committed, the second to have drawn it.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve({ shown, painted: performance.now() })),
          );
        };
        if (done()) return finish();
        const observer = new MutationObserver(() => {
          if (!done()) return;
          observer.disconnect();
          finish();
        });
        observer.observe(status, { childList: true, characterData: true, subtree: true });
      });
    }, slides);
    await openDeckFile(page, file);
    return page.evaluate(async () => {
      const w = window as unknown as { __opened: Promise<{ shown: number; painted: number }> };
      const { shown, painted } = await w.__opened;
      const request = performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('/storage_open'))
        .at(-1) as PerformanceResourceTiming;
      return {
        unpackMs: request.responseEnd - request.startTime,
        shownMs: shown - request.startTime,
        paintedMs: painted - request.startTime,
      };
    });
  }

  test('NFR-01: a deck of 100 slides opens in under two seconds; and 200', async () => {
    test.setTimeout(900_000);
    const { page } = app;
    const measured: Record<string, { medianPaintedMs: number }> = {};
    for (const [name, count, pictures] of [
      ['100 slides', 100, false],
      ['200 slides', 200, false],
      ['100 slides, a picture on each', 100, true],
      ['200 slides, a picture on each', 200, true],
    ] as const) {
      const file = await deckFile(page, count, pictures);
      const runs = [];
      for (let i = 0; i < 3; i++) {
        runs.push(await timedOpen(page, file, count));
        await expect(page.getByTestId('status-slide')).toHaveText(`שקף 1 מתוך ${count}`);
        // Back to a deck of one slide, so every open starts from the same place.
        await page.getByTestId('stage-surface').focus();
        await page.keyboard.press('Control+n');
        await expect(page.getByTestId('status-slide')).toHaveText('שקף 1 מתוך 1');
      }
      const details = {
        fileMB: round(statSync(file).size / 1e6),
        // The core unpacking the file into its workspace; the deck in the window; a frame drawn.
        unpackMs: runs.map((run) => round(run.unpackMs, 0)),
        shownMs: runs.map((run) => round(run.shownMs, 0)),
        paintedMs: runs.map((run) => round(run.paintedMs, 0)),
      };
      measured[name] = {
        ...details,
        medianPaintedMs: round(median(runs.map((run) => run.paintedMs)), 0),
      };
    }
    record('NFR-01 open', {
      target: 'under 2000 ms from the open request to the deck painted, for 100 slides',
      ...measured,
    });
    target('NFR-01 open 100 slides, median ms', measured['100 slides']!.medianPaintedMs, 2000);
    target(
      'NFR-01 open 100 slides with pictures, median ms',
      measured['100 slides, a picture on each']!.medianPaintedMs,
      2000,
    );
  });

  test('NFR-05: the filmstrip of 200 slides draws what is in view, and scrolls smoothly', async () => {
    const { page } = app;
    await open(page, await deckFile(page, 200), 200);
    const strip = page.getByTestId('filmstrip');
    const drawn = () => strip.locator('[role="option"]').count();
    const atStart = await drawn();
    const nodes = await strip.evaluate((el) => el.querySelectorAll('*').length);

    const idle = await idleFrame(page);
    const firstInView = () =>
      strip.locator('[role="option"]').first().getAttribute('data-slide-id');
    const before = await firstInView();
    // A long, quick scroll towards the far end and some way back, moved from inside the page:
    // a step with every frame, which is as often as the strip can be asked to draw. (Steps sent
    // by the driver arrive several frames apart, more so on a busy machine.)
    const scrolled = await page.evaluate(
      () =>
        new Promise<{ intervals: number[]; busy: number[]; travelled: number; most: number }>(
          (resolve) => {
            const scroller = document.querySelector<HTMLElement>('[data-filmstrip]')!;
            // The strip runs sideways; in a right-to-left window its positions are negative.
            const sign = getComputedStyle(scroller).direction === 'rtl' ? -1 : 1;
            const intervals: number[] = [];
            // How long the page itself was at work in each frame: from the frame's start until
            // what the step set going (the strip's drawing, React's) was done.
            const busy: number[] = [];
            const done = new MessageChannel();
            let began = 0;
            done.port1.onmessage = () => busy.push(performance.now() - began);
            let last = performance.now();
            let frame = 0;
            let travelled = 0;
            let most = 0;
            const tick = (now: number) => {
              intervals.push(now - last);
              last = now;
              began = now;
              done.port2.postMessage(0);
              if (frame === 240) {
                // The first interval is the wait for the first frame, not a frame.
                setTimeout(
                  () => resolve({ intervals: intervals.slice(1), busy, travelled, most }),
                  50,
                );
                return;
              }
              const from = scroller.scrollLeft;
              scroller.scrollLeft = from + sign * (frame < 160 ? 160 : -160);
              travelled += Math.abs(scroller.scrollLeft - from);
              most = Math.max(most, Math.abs(scroller.scrollLeft));
              frame++;
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          },
        ),
    );
    const scrolling = scrolled.intervals;
    const inView = await drawn();
    // It was the strip that moved: far along, with other slides in view than at the start.
    expect(scrolled.travelled).toBeGreaterThan(20_000);
    expect(await firstInView()).not.toBe(before);
    record('NFR-05 filmstrip', {
      target: 'smooth with 200 slides: only the thumbnails in view are drawn',
      slides: 200,
      thumbnailsDrawnAtStart: atStart,
      thumbnailsDrawnAfterScroll: inView,
      elementsInStrip: nodes,
      scrolledPx: Math.round(scrolled.travelled),
      farthestPx: Math.round(scrolled.most),
      pxPerFrame: 160,
      idleFrameMs: idle === null ? null : round(idle),
      // Frames that took the time of two with nothing happening: the machine's share.
      atRest,
      scroll:
        idle === null ? 'not measured: the window got no frames' : frameStats(scrolling, idle),
      pageBusyMs: busyStats(scrolled.busy),
    });
    target('NFR-05 thumbnails drawn of 200', Math.max(atStart, inView), 40);
    if (idle !== null) {
      target(
        'NFR-05 filmstrip scroll, the page at work, p95 ms',
        percentile(scrolled.busy, 0.95),
        idle,
      );
      target('NFR-05 filmstrip scroll, median frame ms', median(scrolling), idle * 1.3);
      target('NFR-05 filmstrip scroll, p95 frame ms', percentile(scrolling, 0.95), idle * 2.1);
    }
  });

  test('NFR-03: undo and redo take under 16 ms, in a deck of 200 slides', async () => {
    const { page } = app;
    await open(page, await deckFile(page, 200), 200);
    // A change to undo: a slide is added. Then it is undone and redone, by the keys.
    await page.getByTestId('new-slide').click();
    await expect(page.getByTestId('status-slide')).toHaveText(/מתוך 201$/);
    await page.getByTestId('stage-surface').focus();
    const times = await page.evaluate(async () => {
      const status = document.querySelector('[data-testid="status-slide"]')!;
      const key = (shift: boolean) =>
        new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          ctrlKey: true,
          shiftKey: shift,
          bubbles: true,
          cancelable: true,
        });
      const samples = { undo: [] as number[], redo: [] as number[], handler: [] as number[] };
      const counts = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const shift = i % 2 === 1;
        // Between frames, with nothing pending: the time measured is the change's own.
        await new Promise((resolve) => setTimeout(resolve, 60));
        const committed = new Promise<number>((resolve) => {
          const observer = new MutationObserver(() => {
            observer.disconnect();
            resolve(performance.now());
          });
          observer.observe(status, { childList: true, characterData: true, subtree: true });
        });
        const started = performance.now();
        document.activeElement!.dispatchEvent(key(shift));
        // The model has changed when the handler returns; the page shows it when React has
        // committed, which the observer sees.
        samples.handler.push(performance.now() - started);
        samples[shift ? 'redo' : 'undo'].push((await committed) - started);
        counts.add(status.textContent.trim().split(' ').at(-1)!);
      }
      return { ...samples, counts: [...counts].sort() };
    });
    // It was the deck that changed each time, not a key that did nothing.
    expect(times.counts).toEqual(['200', '201']);
    const stats = (values: number[]) => ({
      median: round(median(values)),
      p95: round(percentile(values, 0.95)),
      worst: round(Math.max(...values)),
    });
    record('NFR-03 undo', {
      target: 'under 16 ms from the key to the change committed to the page',
      slides: 200,
      change: 'a slide added to the deck: the Stage and the filmstrip both change',
      modelMs: stats(times.handler),
      undoMs: stats(times.undo),
      redoMs: stats(times.redo),
    });
    target('NFR-03 undo, median ms', median(times.undo), 16);
    target('NFR-03 redo, median ms', median(times.redo), 16);
  });

  test('NFR-04: a tool call of the agent takes under 50 ms, in a deck of 200 slides', async () => {
    test.setTimeout(900_000);
    const { page } = app;
    await open(page, await deckFile(page, 200), 200);
    await invoke(page, 'agent_diagnostics_clear');
    await page.evaluate(() =>
      localStorage.setItem(
        'slidr.agent',
        // The scripted turns make real tool calls through the bridge; the design check would
        // add turns of its own between them.
        JSON.stringify({ harnessId: 'mock', model: 'deck-build', qualityGate: false }),
      ),
    );
    await showPanel(page, 'ai');
    const input = page.getByTestId('chat-input');
    await expect(input).toBeVisible();
    const before = await page.getByTestId('chat-assistant').count();
    // The second turn of the script's three writes a slide's notes: a tool that draws nothing.
    for (let turn = 0; turn < 24; turn++) {
      await input.fill(`תור ${turn + 1}`);
      await input.press('Enter');
      await expect(page.getByTestId('chat-assistant').nth(before + turn)).toHaveAttribute(
        'data-outcome',
        /.+/,
        { timeout: 120_000 },
      );
    }
    const view = await invoke<{ text: string }>(page, 'agent_diagnostics_read', {
      maxBytes: 2_000_000,
    });
    interface Entry {
      at: string;
      kind: string;
      data: { type?: string; id?: string; name?: string; ok?: boolean };
    }
    const entries = view.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Entry)
      .filter((entry) => entry.kind === 'event');
    const calls: Record<string, number[]> = {};
    /** Each call that was answered: when the harness asked, and when it had its answer. */
    const spans: { name: string; asked: number; answered: number }[] = [];
    const started = new Map<string, { name: string; at: number }>();
    for (const entry of entries) {
      const at = Date.parse(entry.at);
      if (entry.data.type === 'tool_call_started' && entry.data.id && entry.data.name) {
        started.set(entry.data.id, { name: entry.data.name, at });
      } else if (entry.data.type === 'tool_call_finished' && entry.data.id && entry.data.ok) {
        const call = started.get(entry.data.id);
        if (!call) continue;
        (calls[call.name] ??= []).push(at - call.at);
        spans.push({ name: call.name, asked: call.at, answered: at });
      }
    }
    const stats = (values: number[] = []) => ({
      calls: values.length,
      medianMs: median(values),
      fastestMs: values.length ? Math.min(...values) : NaN,
      worstMs: values.length ? Math.max(...values) : NaN,
    });
    // Where a call's time goes. The page sends its answer to the core as a request, and the
    // page's clock says when: until then the call was on its way in and at work in the page
    // (the Deck API, and the slide's design check when it runs); from then it is on its way
    // back, which is transport alone.
    const replies = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('/tool_bridge_reply'))
        .map((entry) => performance.timeOrigin + entry.startTime),
    );
    const split = spans
      .filter((span) => span.name === 'slide_update')
      .map((span) => {
        // The log's clock is in whole milliseconds; the page's is finer.
        const reply = replies.find((at) => at >= span.asked - 1 && at <= span.answered + 1);
        return reply === undefined
          ? null
          : { inAndWork: reply - span.asked, back: span.answered - reply };
      })
      .filter((part) => part !== null);
    record('NFR-04 tool call', {
      target: 'under 50 ms for a call that draws nothing, from the agent asking to its answer',
      slides: 200,
      // From the harness's side of the bridge: the request to 127.0.0.1, the core, the
      // webview, the Deck API, and back. The log's clock is in whole milliseconds.
      slide_update: stats(calls.slide_update),
      slide_update_split: {
        calls: split.length,
        wayInAndTheToolsWorkMs: round(median(split.map((part) => part.inAndWork))),
        wayBackMs: round(median(split.map((part) => part.back))),
      },
      // For scale, not held to the target: this one converts HTML and takes a picture.
      slide_create_from_html: stats(calls.slide_create_from_html),
    });
    expect(calls.slide_update?.length ?? 0).toBeGreaterThanOrEqual(8);
    target('NFR-04 tool call, median ms', median(calls.slide_update ?? []), 50);
  });

  test('NFR-02: dragging, resizing and turning an object among 100 keeps the frame rate', async () => {
    const { page } = app;
    mkdirSync(FILES, { recursive: true });
    const file = join(FILES, 'crowded.slidr');
    if (!existsSync(file)) await writeDeckFile(page, file, crowdedDeck(100));
    await open(page, file, 1);
    const stage = page.getByTestId('stage-frame');
    await expect(stage.locator('[data-element-id]')).toHaveCount(100);

    const idle = await idleFrame(page);
    // An object in the middle of the slide, moved towards the wider side of the Stage: the
    // whole gesture stays on the slide, where the handles can be reached.
    const object = stage.locator('[data-element-id="e_49"]');
    const box = (await object.boundingBox())!;
    const slide = (await stage.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const towards = centre.x > slide.x + slide.width / 2 ? -1 : 1;
    await page.mouse.click(centre.x, centre.y);

    /**
     * Holds the button at `from`, and moves through `points` one point a frame; returns the
     * time between each two frames. The button is the real pointer's. The moves are made inside
     * the page, one with every frame: the Stage does a gesture's work once a frame, so this is
     * the most it can be asked for. (Moves sent by the driver arrive several frames apart, more
     * so on a busy machine, and would measure the driver.)
     */
    const gesture = async (from: { x: number; y: number }, points: { x: number; y: number }[]) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const seen = await page.evaluate(
        (path) =>
          new Promise<{ intervals: number[]; busy: number[] }>((resolve) => {
            const surface = document.querySelector('[data-testid="stage-surface"]')!;
            const intervals: number[] = [];
            // How long the page itself was at work in each frame: from the frame's start until
            // the move's work (the Stage's, then React's) was done.
            const busy: number[] = [];
            const done = new MessageChannel();
            let began = 0;
            done.port1.onmessage = () => busy.push(performance.now() - began);
            let last = performance.now();
            let next = 0;
            const tick = (now: number) => {
              intervals.push(now - last);
              last = now;
              began = now;
              done.port2.postMessage(0);
              const point = path[next++];
              if (!point) {
                // The first interval is the wait for the first frame, not a frame.
                setTimeout(() => resolve({ intervals: intervals.slice(1), busy }), 50);
                return;
              }
              surface.dispatchEvent(
                new PointerEvent('pointermove', {
                  bubbles: true,
                  cancelable: true,
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  buttons: 1,
                  clientX: point.x,
                  clientY: point.y,
                }),
              );
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        points,
      );
      // The real pointer ends the gesture where the path ended.
      const end = points.at(-1)!;
      await page.mouse.move(end.x, end.y);
      await page.mouse.up();
      return seen;
    };
    const steps = Array.from({ length: 150 }, (_, i) => i + 1);

    const drag = await gesture(
      centre,
      steps.map((i) => ({ x: centre.x + towards * i * 2, y: centre.y + Math.sin(i / 10) * 60 })),
    );
    const moved = (await object.boundingBox())!;
    expect(Math.abs(moved.x - box.x)).toBeGreaterThan(100);

    const corner = (await page.locator('[data-handle="se"]').boundingBox())!;
    const grip = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
    const resize = await gesture(
      grip,
      steps.map((i) => ({ x: grip.x + i, y: grip.y + i * 0.6 })),
    );
    const resized = (await object.boundingBox())!;
    expect(resized.width).toBeGreaterThan(moved.width + 50);

    const knob = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const hold = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
    const pivot = { x: resized.x + resized.width / 2, y: resized.y + resized.height / 2 };
    const radius = Math.hypot(hold.x - pivot.x, hold.y - pivot.y);
    const rotate = await gesture(
      hold,
      steps.map((i) => {
        const angle = -Math.PI / 2 + (i / 150) * Math.PI;
        return { x: pivot.x + Math.cos(angle) * radius, y: pivot.y + Math.sin(angle) * radius };
      }),
    );

    record('NFR-02 transform', {
      target: '60 frames a second with 100 objects on the slide',
      objects: 100,
      idleFrameMs: idle === null ? null : round(idle),
      atRest,
      ...(idle === null
        ? { note: 'not measured: the window got no frames (it was behind another window)' }
        : {
            drag: { ...frameStats(drag.intervals, idle), pageBusyMs: busyStats(drag.busy) },
            resize: { ...frameStats(resize.intervals, idle), pageBusyMs: busyStats(resize.busy) },
            rotate: { ...frameStats(rotate.intervals, idle), pageBusyMs: busyStats(rotate.busy) },
          }),
    });
    if (idle !== null) {
      for (const [name, { intervals, busy }] of Object.entries({ drag, resize, rotate })) {
        // The page's own work fits a frame: the part of the frame rate that is the app's.
        target(`NFR-02 ${name}, the page at work, p95 ms`, percentile(busy, 0.95), idle);
        // The middle frame is a whole frame of this screen, and few are longer than two.
        target(`NFR-02 ${name}, median frame ms`, median(intervals), idle * 1.3);
        target(`NFR-02 ${name}, p95 frame ms`, percentile(intervals, 0.95), idle * 2.1);
      }
    }
  });

  test('NFR-07: 30 slides are exported in under ten seconds', async () => {
    test.setTimeout(600_000);
    const { page } = app;
    const measured: Record<string, { runsMs: number[] }> = {};
    for (const [name, pictures] of [
      ['30 slides', false],
      ['30 slides, a picture on each', true],
    ] as const) {
      await open(page, await deckFile(page, 30, pictures), 30);
      const runs: number[] = [];
      let size = 0;
      for (let i = 0; i < 3; i++) {
        const written = join(FILES, `export-${i}.html`);
        await page
          .getByTestId('top-tools-a')
          .getByRole('button', { name: 'ייצוא', exact: true })
          .click();
        await expect(page.getByTestId('export-dialog')).toBeVisible();
        await answerDialog(page, 'save', written);
        const started = Date.now();
        await page.getByTestId('export-run').click();
        await expect(page.getByTestId('export-report')).toBeVisible({ timeout: 120_000 });
        runs.push(Date.now() - started);
        size = statSync(written).size;
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('export-dialog')).toHaveCount(0);
      }
      // The first run fetches the font tools; the later ones have them.
      const details = { fileMB: round(size / 1e6) };
      measured[name] = { ...details, runsMs: runs };
    }
    record('NFR-07 export', {
      target: 'under 10 000 ms from the export button to the file written',
      ...measured,
    });
    for (const [name, run] of Object.entries(measured)) {
      target(`NFR-07 export of ${name}, slowest ms`, Math.max(...run.runsMs), 10_000);
    }
  });
});

test('every target of SPEC 14.4 was met', () => {
  const results = read();
  console.log(JSON.stringify(results, null, 2));
  expect(results.misses ?? []).toEqual([]);
});
