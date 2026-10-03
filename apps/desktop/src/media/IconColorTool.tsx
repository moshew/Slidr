import { useTranslation } from 'react-i18next';
import { Palette } from '@slidr/ui/icons';
import { ColorField, useGestureTx } from '../controls';
import { isTarget, useTarget } from '../objects/target';

/**
 * The colour of an icon, in row B (SHP-07). An icon of the library draws in `currentColor`, and
 * the element says what that colour is; a colour picked from the theme is stored as its token,
 * so the icon follows the theme. An SVG with colours of its own (an imported illustration) has
 * no single colour to set, and gets no button.
 */
export function IconColorTool() {
  const { t } = useTranslation('media');
  const target = useTarget();
  const tx = useGestureTx();
  if (!isTarget(target, 'svg')) return null;
  const { element } = target;
  if (!element.markup?.includes('currentColor')) return null;
  return (
    <ColorField
      value={element.colorOverrides?.currentColor ?? null}
      label={t('icons.color')}
      icon={Palette}
      size="sm"
      onChange={(color) => {
        if (!color) return;
        target.update(
          { colorOverrides: { ...element.colorOverrides, currentColor: color } },
          { txId: tx.id(), label: t('history.iconColor') },
        );
      }}
      onGestureEnd={tx.end}
    />
  );
}
