import type { Accent, AssetMeta, ElementPatch, ShapeElement } from '@slidr/model';
import { SegmentedControl, Switch, type LucideIcon } from '@slidr/ui';
import { Ban, PanelBottom, PanelLeft, PanelRight, PanelTop } from '@slidr/ui/icons';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeck } from '../shell';
import {
  accentChoices,
  canFollowCorners,
  choiceOf,
  cornersPatch,
  fillPatch,
  followsCorners,
  hasRoundCorners,
  MAX_ACCENT_SIZE,
  sideOf,
  sidePatch,
  sizePatch,
  type AccentChoice,
} from './accent';
import { FillEditor } from './FillEditor';
import { InlineField, SliderField } from './parts';

/** A side of the box as a picture of it: the choices show where the accent will be. */
const SIDE_ICONS: Record<Accent['side'], LucideIcon> = {
  top: PanelTop,
  bottom: PanelBottom,
  right: PanelRight,
  left: PanelLeft,
};

export interface AccentEditorProps {
  /** The box: a rectangle, a rounded one or an ellipse. Its `accent` is what is edited. */
  shape: ShapeElement;
  /**
   * Every change, also each step of a drag, as the patch of the shape. `asset` is as in the fill
   * editor, which draws the colour of the accent.
   */
  onChange: (patch: ElementPatch, asset?: AssetMeta) => void;
  /** A drag or an edit ended: the host closes its undo step (see `useGestureTx`). */
  onGestureEnd: () => void;
}

/**
 * The accent of a box (ADR-073), the content of a popover: the side it is on or none, its colour
 * (the fill editor, so a theme colour or a gradient), its thickness, and on a box with rounded
 * corners whether it goes around them or is cut by them. The sides across the text are offered
 * as the deck reads, start and end, and drawn as the side of the box each one is.
 */
export function AccentEditor({ shape, onChange, onGestureEnd }: AccentEditorProps) {
  const { t, i18n } = useTranslation('objects');
  const dir = useDeck((s) => s.deck.meta.dir);
  /** The accent that was taken away, so that choosing a side again brings it back. */
  const last = useRef<Accent | undefined>(undefined);
  const { accent } = shape;

  /** A change that is a whole undo step by itself. */
  const commit = (patch: ElementPatch) => {
    onChange(patch);
    onGestureEnd();
  };
  const choose = (choice: AccentChoice) => {
    if (choice === 'none') last.current = accent;
    commit(sidePatch(shape, choice, dir, last.current));
  };

  return (
    <>
      <InlineField label={t('accent.side')}>
        <SegmentedControl<AccentChoice>
          aria-label={t('accent.side')}
          size="sm"
          options={accentChoices(dir, i18n.dir()).map((choice) => ({
            value: choice,
            label: t(`accent.${choice}`),
            icon: choice === 'none' ? Ban : SIDE_ICONS[sideOf(choice, dir)],
            iconOnly: true,
          }))}
          value={choiceOf(accent, dir)}
          onValueChange={choose}
        />
      </InlineField>
      {accent && (
        <>
          <FillEditor
            value={accent.fill}
            defaultColor={{ token: 'primary' }}
            allowNone={false}
            allowImage={false}
            onChange={(fill, asset) => onChange(fillPatch(accent, fill), asset)}
            onGestureEnd={onGestureEnd}
          />
          <SliderField
            label={t('accent.size')}
            value={accent.size}
            min={1}
            max={MAX_ACCENT_SIZE}
            unit="px"
            onChange={(size) => onChange(sizePatch(accent, size))}
            onCommit={onGestureEnd}
          />
          {hasRoundCorners(shape) && (
            <Switch
              label={t('accent.follow')}
              hint={canFollowCorners(accent) ? undefined : t('accent.followSolid')}
              disabled={!canFollowCorners(accent)}
              checked={followsCorners(accent)}
              onCheckedChange={(follow) => commit(cornersPatch(accent, follow))}
            />
          )}
        </>
      )}
    </>
  );
}
