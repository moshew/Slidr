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
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const id = ids.length === 1 ? ids[0] : undefined;
  // Read as what the button says, which a frame dragged leaves as it is: 'none' where there is no
  // text to open (lines and SVGs are of the same kind of selection, and hold none).
  const text = useDeck((s) => {
    const slide = slideId ? findSlide(s.deck, slideId) : undefined;
    const element = slide && id ? findElement(slide, id) : undefined;
    if (element?.type !== 'shape' || element.locked) return 'none';
    return element.content && plainText(element.content) !== '' ? 'edit' : 'add';
  });
  if (text === 'none' || !id) return null;
  return (
    <IconButton
      size="sm"
      icon={Type}
      label={text === 'edit' ? t('shape.editText') : t('shape.addText')}
      shortcut="Enter"
      onClick={() => openText(selection, id)}
    />
  );
}
