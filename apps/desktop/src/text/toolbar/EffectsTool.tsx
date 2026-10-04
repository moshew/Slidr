import { updateElement, type Color } from '@slidr/model';
import { SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from '@slidr/ui';
import { TypeOutline } from '@slidr/ui/icons';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../../controls';
import { ShadowEditor } from '../../objects/editors';
import { ColorRow, SliderField } from '../../objects/parts';
import { useDeck } from '../../shell';
import {
  readTextEffects,
  writeTextEffects,
  type Effect,
  type TextEffectsPatch,
  type TextGradient,
  type TextOutline,
  type TextShadow,
} from '../effects';
import { sameValue } from '../richTextDoc';
import { PopoverTool, useText } from './shared';

/*
 * Row B for text: the text effects (WG4-T10, TXT-11). A gradient fill, an outline and a shadow
 * for all the text of the box, kept as CSS of the element (`effects.ts`). The controls are the
 * ones the shapes' fill, outline and shadow have.
 */

type State = 'off' | 'on' | 'custom';

const stateOf = (effect: Effect<unknown>): State =>
  effect === null ? 'off' : effect === 'custom' ? 'custom' : 'on';

/** What "on" starts from: the two strongest colours of the theme, from one side to the other. */
const NEW_GRADIENT: TextGradient = {
  angle: 90,
  from: { token: 'primary' },
  to: { token: 'accent' },
};
const NEW_OUTLINE: TextOutline = { width: 2, color: { token: 'text' } };
const MAX_OUTLINE = 24;

/**
 * Off, on, and for CSS that came with an imported deck "custom": it is drawn and kept, and has no
 * controls here. Choosing "on" or "off" replaces it.
 */
function Switch({
  label,
  off,
  on,
  state,
  onChange,
  children,
}: {
  label: string;
  off: string;
  on: string;
  state: State;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('text');
  return (
    <>
      <SegmentedControl<State>
        aria-label={label}
        fill
        options={[
          { value: 'off', label: off },
          { value: 'on', label: on },
          ...(state === 'custom' ? [{ value: 'custom' as const, label: t('effects.custom') }] : []),
        ]}
        value={state}
        onValueChange={(next) => next !== 'custom' && onChange(next === 'on')}
      />
      {state === 'custom' && <p className="text-xs text-ui-fg-muted">{t('effects.customNote')}</p>}
      {state === 'on' && children}
    </>
  );
}

export function TextEffectsTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const tx = useGestureTx();
  const themeShadow = useDeck((s) => s.deck.theme.shadow);
  /** The effects that were switched off, so switching one back on restores it. */
  const last = useRef<TextEffectsPatch>({});
  // The cells of a table have no box of their own to carry the CSS.
  if (!text || text.target.element.type === 'table') return null;
  const { bus, slideId, element } = text.target;
  const { fill, outline, shadow } = readTextEffects(element.css);

  /** A step of a drag or of an edit; `tx.end` closes the undo step. */
  const change = (patch: TextEffectsPatch) => {
    const css = writeTextEffects(element.css, patch);
    if (sameValue(css, element.css)) return;
    bus.dispatch(updateElement(slideId, element.id, { css: css ?? null }), {
      txId: tx.id(),
      label: t('step.effects'),
    });
  };
  const commit = (patch: TextEffectsPatch) => {
    change(patch);
    tx.end();
  };
  const gradient = typeof fill === 'object' ? fill : null;
  const stroke = typeof outline === 'object' ? outline : null;
  // Switching an effect on gives what it was before it was switched off, or else its start.
  const switchFill = (on: boolean) => {
    if (on) return commit({ fill: last.current.fill ?? NEW_GRADIENT });
    if (gradient) last.current.fill = gradient;
    commit({ fill: null });
  };
  const switchOutline = (on: boolean) => {
    if (on) return commit({ outline: last.current.outline ?? NEW_OUTLINE });
    if (stroke) last.current.outline = stroke;
    commit({ outline: null });
  };
  const { spread: _spread, ...startShadow } = themeShadow;

  return (
    <PopoverTool label={t('effects.label')} icon={TypeOutline} onClose={tx.end}>
      <Tabs defaultValue="fill">
        <TabsList>
          <TabsTrigger value="fill">{t('effects.fill')}</TabsTrigger>
          <TabsTrigger value="outline">{t('effects.outline')}</TabsTrigger>
          <TabsTrigger value="shadow">{t('effects.shadow')}</TabsTrigger>
        </TabsList>
        <TabsContent value="fill" className="flex flex-col gap-3 pt-3">
          <Switch
            label={t('effects.fill')}
            off={t('effects.fillColor')}
            on={t('effects.fillGradient')}
            state={stateOf(fill)}
            onChange={switchFill}
          >
            {gradient && (
              <>
                <ColorRow
                  label={t('effects.from')}
                  value={gradient.from}
                  onChange={(from: Color) => change({ fill: { ...gradient, from } })}
                  onGestureEnd={tx.end}
                />
                <ColorRow
                  label={t('effects.to')}
                  value={gradient.to}
                  onChange={(to: Color) => change({ fill: { ...gradient, to } })}
                  onGestureEnd={tx.end}
                />
                <SliderField
                  label={t('effects.angle')}
                  value={gradient.angle}
                  max={360}
                  unit="°"
                  onChange={(angle) => change({ fill: { ...gradient, angle } })}
                  onCommit={tx.end}
                />
              </>
            )}
          </Switch>
        </TabsContent>
        <TabsContent value="outline" className="flex flex-col gap-3 pt-3">
          <Switch
            label={t('effects.outline')}
            off={t('effects.none')}
            on={t('effects.outline')}
            state={stateOf(outline)}
            onChange={switchOutline}
          >
            {stroke && (
              <>
                <ColorRow
                  label={t('effects.outlineColor')}
                  value={stroke.color}
                  onChange={(color: Color) => change({ outline: { ...stroke, color } })}
                  onGestureEnd={tx.end}
                />
                <SliderField
                  label={t('effects.outlineWidth')}
                  value={stroke.width}
                  min={0.5}
                  max={MAX_OUTLINE}
                  step={0.5}
                  unit="px"
                  onChange={(width) => change({ outline: { ...stroke, width } })}
                  onCommit={tx.end}
                />
              </>
            )}
          </Switch>
        </TabsContent>
        <TabsContent value="shadow" className="flex flex-col gap-3 pt-3">
          {shadow === 'custom' && (
            <p className="text-xs text-ui-fg-muted">{t('effects.customNote')}</p>
          )}
          <ShadowEditor
            value={typeof shadow === 'object' && shadow ? shadow : undefined}
            themeShadow={startShadow}
            spread={false}
            onChange={(next: TextShadow | null) => change({ shadow: next })}
            onGestureEnd={tx.end}
          />
        </TabsContent>
      </Tabs>
    </PopoverTool>
  );
}
