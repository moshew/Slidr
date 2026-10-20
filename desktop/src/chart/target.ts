import {
  findElement,
  findSlide,
  updateElement,
  type ChartElement,
  type DispatchOptions,
} from '@slidr/model';
import type { Editor } from '../shell';
import type { ChartPatch } from './data';

/** What a chart tool acts on: the one selected chart. */
export interface ChartTarget {
  slideId: string;
  chart: ChartElement;
  /**
   * Writes a change of the chart as one `element.update`: one undo step, or a step of the gesture
   * `txId`. A change that changes nothing (an undefined patch) is not written. Returns whether
   * anything was.
   */
  write: (patch: ChartPatch | undefined, options: DispatchOptions) => boolean;
}

/** The part of the editor a chart action needs; a test builds it from a bus alone. */
export type ChartEditor = Pick<Editor, 'bus' | 'selection'>;

/**
 * The target of the chart tools as it is now: the chart that is the whole selection, wherever it
 * sits in the groups of the current slide. Undefined while something else is selected, or while
 * an element is being edited in place.
 */
export function chartTarget({ bus, selection }: ChartEditor): ChartTarget | undefined {
  const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
  const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
  const id = selectedElementIds.length === 1 ? selectedElementIds[0] : undefined;
  const chart = slide && id ? findElement(slide, id) : undefined;
  if (!slide || chart?.type !== 'chart' || editingElementId) return undefined;
  const slideId = slide.id;
  return {
    slideId,
    chart,
    write: (patch, options) => {
      if (!patch) return false;
      bus.dispatch(updateElement(slideId, chart.id, patch), options);
      return true;
    },
  };
}
