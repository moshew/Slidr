import { findSlide, newId } from '@slidr/model';
import {
  Icon,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  Tooltip,
} from '@slidr/ui';
import { Link2, Ruler } from '@slidr/ui/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeck, useEditor, useSelection, type ContextToolProps } from '../shell';
import { indexElements } from '../stage/space';
import { syncGrowHeights } from '../text/actions';
import {
  keepsAspect,
  MIN_SIDE,
  placementCommands,
  shownRotation,
  sizable,
  type PlacementField,
} from './numeric';

/*
 * Position, size and rotation as numbers, in row B (ARR-07): for one selected element, of any
 * kind. A number typed here is one undo step, and does what the matching drag on the Stage does.
 */

/** A number under its name: the fields sit in pairs. */
function Field({
  label,
  field,
  value,
  unit,
  min,
  disabled,
  onSet,
}: {
  label: string;
  field: PlacementField;
  value: number;
  unit: string;
  min?: number;
  disabled?: boolean;
  onSet: (field: PlacementField, value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
      <NumberField
        aria-label={label}
        size="sm"
        value={value}
        min={min}
        unit={unit}
        disabled={disabled}
        onValueChange={(next) => onSet(field, next)}
      />
    </label>
  );
}

export function PlacementTool(_: ContextToolProps) {
  const { t } = useTranslation('arrange');
  const { bus } = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  const ids = useSelection((s) => s.selectedElementIds);
  const slide = useDeck((s) => (slideId ? findSlide(s.deck, slideId) : undefined));
  const id = ids.length === 1 ? ids[0] : undefined;
  const located = slide && id ? indexElements(slide.elements).get(id) : undefined;
  /** The user's choice of tying width to height; until they choose, it follows the element. */
  const [tied, setTied] = useState<{ id: string; on: boolean } | null>(null);
  if (!slide || !located) return null;
  const { element, locked } = located;
  const keep = tied?.id === element.id ? tied.on : keepsAspect(element);
  const { frame } = element;

  const set = (field: PlacementField, value: number) => {
    const commands = placementCommands(slide, element.id, field, value, keep);
    if (commands.length === 0) return;
    const txId = newId('tx');
    bus.batch(commands, { txId, label: t(`history.${field}`) });
    // A text box that grows with its text is as tall as the text is in its new width, and never
    // the height that was typed: the number in the field goes back to what is drawn.
    if (field === 'w' || field === 'h') syncGrowHeights(bus, [element.id], txId);
  };

  return (
    <Popover>
      <Tooltip content={t('placement.title')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('placement.title')}
            data-testid="placement-tool"
            className="inline-flex size-control-sm shrink-0 cursor-default items-center justify-center rounded-control text-ui-fg-muted transition-colors select-none hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed data-[state=open]:bg-ui-hover data-[state=open]:text-ui-fg"
          >
            <Icon icon={Ruler} />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent>
        <div data-testid="placement-editor" className="flex flex-col gap-3">
          {/* Numbers of the slide, which reads left to right whatever the UI's direction. */}
          <div dir="ltr" className="flex gap-3">
            <Field
              label={t('placement.x')}
              field="x"
              value={Math.round(frame.x)}
              unit="px"
              disabled={locked}
              onSet={set}
            />
            <Field
              label={t('placement.y')}
              field="y"
              value={Math.round(frame.y)}
              unit="px"
              disabled={locked}
              onSet={set}
            />
          </div>
          <div dir="ltr" className="flex items-end gap-1.5">
            <Field
              label={t('placement.w')}
              field="w"
              value={Math.round(frame.w)}
              unit="px"
              min={MIN_SIDE}
              disabled={locked || !sizable(element)}
              onSet={set}
            />
            <Toggle
              icon={Link2}
              size="sm"
              label={t('placement.keepAspect')}
              pressed={keep}
              disabled={locked || !sizable(element)}
              data-testid="placement-keep"
              onPressedChange={(on) => setTied({ id: element.id, on })}
            />
            <Field
              label={t('placement.h')}
              field="h"
              value={Math.round(frame.h)}
              unit="px"
              min={MIN_SIDE}
              disabled={locked || !sizable(element)}
              onSet={set}
            />
          </div>
          <div dir="ltr" className="flex gap-3">
            <Field
              label={t('placement.rotation')}
              field="rotation"
              value={shownRotation(element.rotation)}
              unit="°"
              disabled={locked}
              onSet={set}
            />
            <div className="flex-1" />
          </div>
          {located.path.length > 0 && (
            <p className="text-xs text-ui-fg-muted">{t('placement.inGroup')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
