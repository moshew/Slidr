import { PaintRoller } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { painter, pickUp, putDown } from '../painter';
import { PICK_FORMAT_KEYS, TextToggle, useText } from './shared';

/* Row B for text: the format painter and the text styles (WG4-T08, T10; TXT-08, TXT-10). */

/**
 * The brush. A click picks up the format at the caret, or of the selected box, and the next text
 * selected or box clicked takes it; a double click keeps the brush in hand until Esc.
 */
export function PainterTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const armed = useStore(painter, (s) => s.armed);
  if (!text) return null;
  return (
    <TextToggle
      icon={PaintRoller}
      label={t('painter')}
      shortcut={PICK_FORMAT_KEYS}
      pressed={armed}
      onPressedChange={(on) => (on ? pickUp(text.target) : putDown())}
      // Its second click put the brush down again; a double click means "keep it".
      onDoubleClick={() => pickUp(text.target, true)}
    />
  );
}
