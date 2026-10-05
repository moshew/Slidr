import { findElement, findSlide } from '@slidr/model';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { layerSnippet } from '../arrange/layers';
import { elementKind, useDeck, useSelection } from '../shell';
import { stageKeys } from './keyboardSession';

/**
 * Where the keyboard is on the slide beyond the selection, in words (UI-06): the point of a line
 * or the crop handle the arrows move, and the element the selection walk stands on. The Stage
 * draws a ring there; this says it to a screen reader, as the host says what is selected. It is
 * a live region with nothing to see.
 */
export function KeyboardStatus() {
  const { t } = useTranslation();
  const { handle, point, cursor } = useStore(stageKeys);
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  const one = slide && ids.length === 1 && ids[0] ? findElement(slide, ids[0]) : undefined;
  const walked = slide && cursor ? findElement(slide, cursor) : undefined;

  let said = '';
  if (one?.type === 'line' && point !== null) {
    const total = one.points.length;
    said = t('stage:at.point', { n: Math.min(point, total - 1) + 1, total });
  } else if (one?.type === 'image' && editingId === one.id) {
    said = handle
      ? t('stage:at.handle', { where: t(`stage:at.handles.${handle}`) })
      : t('stage:at.picture');
  } else if (walked) {
    const what = [t(`selection.${elementKind(walked)}`), walked.name ?? layerSnippet(walked)]
      .filter(Boolean)
      .join(' · ');
    said = t(ids.includes(walked.id) ? 'stage:at.walkSelected' : 'stage:at.walkFree', { what });
  }

  return (
    <p role="status" data-testid="stage-keyboard" className="sr-only">
      {said}
    </p>
  );
}
