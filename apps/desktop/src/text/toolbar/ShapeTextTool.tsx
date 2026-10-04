import { findElement, findSlide, plainText } from '@slidr/model';
import { IconButton } from '@slidr/ui';
import { Type } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useDeck, useEditor, useSelection } from '../../shell';
import { openText } from '../opening';

/**
 * Row B of a selected shape: the way into its text (SHP-04). While a shape is selected the row is
 * the shape's own (fill, outline, effects); this button starts editing its text, as a double
 * click, Enter or a typed character do, and from then on the row is the text's.
 */
export function ShapeTextTool() {
  const { t } = useTranslation('text');
  const { selection } = useEditor();
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const element = slide && ids.length === 1 && ids[0] ? findElement(slide, ids[0]) : undefined;
  // Lines and SVGs are of the same kind of selection, and hold no text.
  if (element?.type !== 'shape' || element.locked) return null;
  const hasText = element.content ? plainText(element.content) !== '' : false;
  return (
    <IconButton
      size="sm"
      icon={Type}
      label={hasText ? t('shape.editText') : t('shape.addText')}
      shortcut="Enter"
      onClick={() => openText(selection, element.id)}
    />
  );
}
