import type { AnimationStep } from '@slidr/model';
import { createTimeline, type SlideTimeline, type TimelineGroup } from '@slidr/runtime';
import { create } from 'zustand';
import { stageSlide as drawnSlide, type Editor } from '../shell';
import { scheduledGroups } from './model';

/*
 * The preview of a slide's animations on the Stage (WG8-T04): the runtime's own timeline, on the
 * slide the Stage draws, so what plays here is what plays in a show and in an exported file
 * (SPEC 5.6). The runtime animates the rendered slide without writing to it, and `clear()` leaves
 * it as the renderer drew it (ADR-020). The one exception is text animated by word or character,
 * which is wrapped while it plays: so a preview ends before anything changes the slide, and
 * before its text is edited.
 */

/**
 * This slide as the Stage draws it, as `SlideRenderer` drew it; null when the Stage shows another
 * or none. The shell is the one place that knows how to find the Stage (`stageDom.ts`).
 */
export function stageSlide(slideId: string): HTMLElement | null {
  const root = drawnSlide();
  return root?.dataset.slideId === slideId ? root : null;
}

/**
 * How the steps of the slide on the Stage fall into groups. The runtime is asked, because it
 * depends on the paragraphs of the rendered text; with no slide drawn, the schedule alone answers.
 */
export function stageGroups(
  slideId: string,
  steps: readonly AnimationStep[],
  size: { w: number; h: number },
): readonly TimelineGroup[] {
  const root = stageSlide(slideId);
  return root ? createTimeline(root, steps, { size }).groups : scheduledGroups(steps);
}

/** A pause between the groups of a whole-slide preview, where a presenter would click. */
const BETWEEN_GROUPS_MS = 450;
/** The last state stays for a moment before the slide is whole again. */
const HOLD_MS = 500;

interface Run {
  timeline: SlideTimeline;
  stop: () => void;
}

let run: Run | undefined;

/** What the panel shows of a preview: the group that is playing, and of which slide. */
export const usePreview = create<{ slideId: string | null; group: number | null }>(() => ({
  slideId: null,
  group: null,
}));

/** Ends the preview: the slide is as the renderer drew it. */
export function stopPreview(): void {
  const current = run;
  if (!current) return;
  run = undefined;
  current.stop();
  current.timeline.clear();
  usePreview.setState({ slideId: null, group: null });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Plays groups of the current slide's timeline on the Stage, one after the other: one group for
 * the step being edited, all of them for the whole slide. Resolves when the preview has ended, by
 * itself or because something stopped it.
 */
export async function playPreview(editor: Editor, groups: readonly number[]): Promise<void> {
  stopPreview();
  const deck = editor.bus.deck;
  const slideId = editor.selection.getState().currentSlideId;
  const slide = deck.slides.find((s) => s.id === slideId);
  const root = slide ? stageSlide(slide.id) : null;
  if (!slide || !root || groups.length === 0) return;

  const timeline = createTimeline(root, slide.timeline, { size: deck.size });
  // Listeners of the stores run before React draws the change: the slide is whole again before
  // its text is edited, before a command changes it, and before another slide takes the Stage.
  const unsubscribe = [
    editor.bus.subscribe(() => stopPreview()),
    editor.selection.subscribe((state, previous) => {
      const editing = state.editingElementId !== null && previous.editingElementId === null;
      if (editing || state.currentSlideId !== previous.currentSlideId) stopPreview();
    }),
  ];
  const current: Run = { timeline, stop: () => unsubscribe.forEach((stop) => stop()) };
  run = current;
  const alive = () => run === current;

  for (const group of groups) {
    usePreview.setState({ slideId: slide.id, group });
    await timeline.play(group);
    if (!alive()) return;
    // Between two groups a show waits for a click; after the last one it holds what it reached.
    await wait(group === groups.at(-1) ? HOLD_MS : BETWEEN_GROUPS_MS);
    if (!alive()) return;
  }
  stopPreview();
}

/** Whether a preview is playing. */
export function isPreviewing(): boolean {
  return run !== undefined;
}
