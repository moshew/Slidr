import { findElement, findSlide } from '@slidr/model';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { layerSnippet } from '../arrange/layers';
import { elementDisplayKind, useDeck, useSelection } from '../shell';
import { stageKeys } from './keyboardSession';

/**
 * Where the keyboard is beyond the selection, in words (UI-06): the point of a line or the crop
 * handle the arrows move, and the element of the slide or the slide of the Filmstrip that the
 * selection walk stands on. The Stage and the Filmstrip draw a ring there; this says it to a
 * screen reader, as the host says what is selected. It is a live region with nothing to see.
 */
export function KeyboardStatus() {
  const { t } = useTranslation();
  const { handle, point, cursor, slide: walkedSlide } = useStore(stageKeys);
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const slideIds = useSelection((s) => s.selectedSlideIds);
  const editingId = useSelection((s) => s.editingElementId);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  // The number of the slide the walk stands on in the Filmstrip; 0 when it stands on none.
  const walkedNumber = useDeck((s) =>
    walkedSlide ? s.deck.slides.findIndex((each) => each.id === walkedSlide) + 1 : 0,
  );
  const one = slide && ids.length === 1 && ids[0] ? findElement(slide, ids[0]) : undefined;
  const walked = slide && cursor ? findElement(slide, cursor) : undefined;

  let said = '';
  if (walkedSlide && walkedNumber > 0) {
    // The walk is in the Filmstrip: the keyboard is there, and not on the slide.
    const what = t('stage.slide', { n: walkedNumber });
    said = t(slideIds.includes(walkedSlide) ? 'a11y:at.slideSelected' : 'a11y:at.slideFree', {
      what,
    });
  } else if (one?.type === 'line' && point !== null) {
    const total = one.points.length;
    said = t('stage:at.point', { n: Math.min(point, total - 1) + 1, total });
  } else if (one?.type === 'image' && editingId === one.id) {
    said = handle
      ? t('stage:at.handle', { where: t(`stage:at.handles.${handle}`) })
      : t('stage:at.picture');
  } else if (walked) {
    const what = [t(`selection.${elementDisplayKind(walked)}`), walked.name ?? layerSnippet(walked)]
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
