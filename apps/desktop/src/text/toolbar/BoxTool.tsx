import type { Insets, TextElement } from '@slidr/model';
import { NumberField, Select, type LucideIcon } from '@slidr/ui';
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  TextCursorInput,
} from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { updateBox, type BoxPatch } from '../actions';
import { PopoverTool, Row, TextToggle, useBurstTx, useText } from './shared';

/* Row B for text, the text box itself (WG4-T05, TXT-07): auto-fit, vertical alignment, padding. */

type AutoFit = TextElement['autoFit'];
type VAlign = TextElement['vAlign'];

const FITS: readonly { value: AutoFit; label: string }[] = [
  { value: 'none', label: 'box.fitNone' },
  { value: 'shrink', label: 'box.fitShrink' },
  { value: 'growHeight', label: 'box.fitGrow' },
];

const V_ALIGNS: readonly { value: VAlign; icon: LucideIcon }[] = [
  { value: 'top', icon: AlignVerticalJustifyStart },
  { value: 'middle', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', icon: AlignVerticalJustifyEnd },
];

/** The sides of the padding, in the order of the fields. The model's insets are physical. */
const SIDES: readonly { side: keyof Insets; label: string; name: string }[] = [
  { side: 'top', label: 'box.sideTop', name: 'box.paddingTop' },
  { side: 'bottom', label: 'box.sideBottom', name: 'box.paddingBottom' },
  { side: 'right', label: 'box.sideRight', name: 'box.paddingRight' },
  { side: 'left', label: 'box.sideLeft', name: 'box.paddingLeft' },
];

const NO_PADDING: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const MAX_PADDING = 400;

/** A text box only: the text inside a shape has no such settings, and the tool is not shown. */
export function BoxTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const burst = useBurstTx();
  if (!text || text.target.element.type !== 'text') return null;
  const { target } = text;
  const element = text.target.element;
  const padding = element.padding ?? NO_PADDING;
  const uniform =
    padding.top === padding.right && padding.top === padding.bottom && padding.top === padding.left;
  const update = (patch: BoxPatch, txId?: string) =>
    updateBox(target, patch, { txId, label: t('step.box') });
  const setPadding = (next: Insets) => {
    const none = Object.values(next).every((value) => value === 0);
    update({ padding: none ? null : next }, burst());
  };

  return (
    <PopoverTool label={t('box.label')} icon={TextCursorInput}>
      <Row label={t('box.autoFit')}>
        <Select<AutoFit>
          size="sm"
          aria-label={t('box.autoFit')}
          className="w-36"
          options={FITS.map(({ value, label }) => ({ value, label: t(label) }))}
          value={element.autoFit}
          onValueChange={(autoFit) => update({ autoFit })}
        />
      </Row>
      <Row label={t('box.vAlign')}>
        {V_ALIGNS.map(({ value, icon }) => (
          <TextToggle
            key={value}
            icon={icon}
            label={t(`box.${value}`)}
            pressed={element.vAlign === value}
            onPressedChange={() => update({ vAlign: value })}
          />
        ))}
      </Row>
      <Row label={t('box.padding')}>
        <NumberField
          size="sm"
          aria-label={t('box.paddingAll')}
          className="w-20"
          unit="px"
          value={uniform ? padding.top : null}
          placeholder="–"
          min={0}
          max={MAX_PADDING}
          step={4}
          onValueChange={(all) => setPadding({ top: all, right: all, bottom: all, left: all })}
        />
      </Row>
      <div className="grid grid-cols-4 gap-2">
        {SIDES.map(({ side, label, name }) => (
          <label key={side} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ui-fg-muted">{t(label)}</span>
            <NumberField
              size="sm"
              aria-label={t(name)}
              value={padding[side]}
              min={0}
              max={MAX_PADDING}
              step={4}
              onValueChange={(value) => setPadding({ ...padding, [side]: value })}
            />
          </label>
        ))}
      </div>
    </PopoverTool>
  );
}
