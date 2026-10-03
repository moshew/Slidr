import { findElement, type AnimationStep, type Slide } from '@slidr/model';
import { animationPresets, describePreset, type TimelineGroup } from '@slidr/runtime';
import {
  Button,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  IconButton,
  SegmentedControl,
  Select,
  Separator,
  Tooltip,
  type LucideIcon,
} from '@slidr/ui';
import {
  Film,
  GripVertical,
  LogIn,
  LogOut,
  Play,
  Plus,
  Route,
  Sparkle,
  Square,
  Trash2,
} from '@slidr/ui/icons';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDeck, useEditor, useSelection } from '../shell';
import {
  CATEGORIES,
  dropTarget,
  elementSnippet,
  hasText,
  isOpenRow,
  moveStep,
  newSteps,
  openRow,
  patchStep,
  playable,
  removeStep,
  scheduledGroups,
  timelineList,
  withCategory,
  withPreset,
  type Category,
  type OpenRow,
  type Row,
  type RowGroup,
} from './model';
import {
  DirectionField,
  Field,
  nameLabel,
  SecondsField,
  useCurrentSlide,
  useSeconds,
} from './parts';
import { playPreview, stageGroups, stageSlide, stopPreview, usePreview } from './preview';
import { TransitionEditor } from './TransitionEditor';

/*
 * The Animations panel (SPEC 4.2, WG8-T04): the timeline of the slide on the Stage, as the groups
 * a show plays it in; adding an animation to the selected objects; reordering by dragging; a
 * preview, played on the Stage by the runtime itself; and under it the transition into the slide.
 * Everything is written through `slide.setTimeline`.
 */

const CATEGORY_ICONS: Record<AnimationStep['category'], LucideIcon> = {
  entrance: LogIn,
  emphasis: Sparkle,
  exit: LogOut,
  motion: Route,
};

/** What a category is drawn in: its icon in the list and its bar on the time track. */
const CATEGORY_TONE: Record<AnimationStep['category'], { text: string; bar: string }> = {
  entrance: { text: 'text-ui-success-fg', bar: 'bg-ui-success-fg' },
  emphasis: { text: 'text-ui-warning-fg', bar: 'bg-ui-warning-fg' },
  exit: { text: 'text-ui-danger-fg', bar: 'bg-ui-danger-fg' },
  motion: { text: 'text-ui-fg-subtle', bar: 'bg-ui-fg-subtle' },
};

const EASINGS = ['ease-out', 'ease-in', 'ease-in-out', 'linear', 'ease'] as const;
const TRIGGERS = ['onClick', 'withPrevious', 'afterPrevious'] as const;
const TEXT_BY = ['all', 'paragraph', 'word', 'char'] as const;

const seconds = (ms: number) => `${Number((ms / 1000).toFixed(2))}`;

/** What a step is called: its preset, in the words of its category. */
function effectLabel(step: AnimationStep): string {
  return nameLabel(`preset.${step.category}.${step.preset}`, step.preset);
}

export function AnimationsPanel() {
  const { t } = useTranslation('animations');
  const editor = useEditor();
  const size = useDeck((s) => s.deck.size);
  const deckDir = useDeck((s) => s.deck.meta.dir);
  const slide = useCurrentSlide();
  const selected = useSelection((s) => s.selectedElementIds);
  const playing = usePreview((s) => (s.slideId === slide?.id ? s.group : null));
  /** The row whose settings are open. */
  const [open, setOpen] = useState<OpenRow | null>(null);
  /** The groups as the runtime has them, read from the slide the Stage drew, and of which slide. */
  const [drawn, setDrawn] = useState<{ slide: Slide; groups: readonly TimelineGroup[] } | null>(
    null,
  );
  /** A step to play once the list has caught up with a change to it. */
  const autoplay = useRef<string | null>(null);

  // The preview is this panel's: it ends with it.
  useEffect(() => stopPreview, []);

  // Before the browser paints: the Stage has drawn the slide in the same pass, and the list is
  // never shown with the groups of the slide as it was a moment ago.
  useLayoutEffect(() => {
    if (!slide) return;
    let frame = 0;
    const read = () => {
      const next = stageGroups(slide.id, slide.timeline, size);
      setDrawn({ slide, groups: next });
      const stepId = autoplay.current;
      autoplay.current = null;
      const group = stepId ? next.findIndex((g) => g.parts.some((p) => p.stepId === stepId)) : -1;
      if (group >= 0) void playPreview(editor, [group]);
    };
    // Right after a start the Stage may not have a size yet, and so no slide.
    if (stageSlide(slide.id)) read();
    else frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [editor, slide, size]);

  // Until the slide on the Stage has been read, the schedule alone: by trigger, a step by
  // paragraph counted as one.
  const groups = drawn && drawn.slide === slide ? drawn.groups : null;
  const list = useMemo(
    () =>
      slide ? timelineList(slide.timeline, groups ?? scheduledGroups(slide.timeline)) : undefined,
    [slide, groups],
  );

  if (!slide || !list) {
    return <EmptyState icon={Film} title={t('panel.noSlide')} className="min-h-80" />;
  }

  const timeline = slide.timeline;
  const write = (next: readonly AnimationStep[], label: string, play?: string) => {
    if (next === timeline) return;
    autoplay.current = play ?? null;
    editor.bus.dispatch(
      { type: 'slide.setTimeline', slideId: slide.id, timeline: [...next] },
      { label: t(label) },
    );
  };
  const add = (category: Category, preset: string) => {
    const steps = newSteps(slide, selected, category, preset);
    if (steps.length === 0) return;
    write([...timeline, ...steps], 'history.add', steps[0]?.id);
    setOpen(null);
  };
  const change = (step: AnimationStep, next: AnimationStep) =>
    write(
      timeline.map((s) => (s === step ? next : s)),
      'history.change',
      step.id,
    );
  const played = (groups ?? []).flatMap((group, index) => (group.parts.length ? [index] : []));
  const previewAll = () => {
    if (playing !== null) stopPreview();
    else void playPreview(editor, played);
  };

  return (
    <div data-testid="animations-panel" className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex items-center gap-2">
        <AddMenu canAdd={selected.length > 0} onAdd={add} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          icon={playing !== null ? Square : Play}
          disabled={played.length === 0}
          data-testid="animations-preview"
          onClick={previewAll}
        >
          {playing !== null ? t('panel.stop') : t('panel.preview')}
        </Button>
      </div>
      {timeline.length === 0 ? (
        <EmptyState icon={Film} title={t('panel.emptyTitle')} description={t('panel.emptyBody')} />
      ) : (
        <StepList
          slide={slide}
          list={list}
          deckDir={deckDir}
          selected={selected}
          playing={playing}
          open={open}
          onOpen={(row) => {
            setOpen(isOpenRow(row, open) ? null : openRow(row));
            editor.selection.getState().selectElements([row.step.elementId]);
          }}
          onChange={change}
          onRemove={(step) => write(removeStep(timeline, step.id), 'history.remove')}
          onMove={(step, before) => write(moveStep(timeline, step.id, before), 'history.reorder')}
          onPlay={(group) => void playPreview(editor, [group])}
        />
      )}
      <Separator />
      <section aria-label={t('transition.heading')} className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t('transition.heading')}</h3>
        <TransitionEditor />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- adding */

function AddMenu({
  canAdd,
  onAdd,
}: {
  canAdd: boolean;
  onAdd: (category: Category, preset: string) => void;
}) {
  const { t } = useTranslation('animations');
  const button = (
    <Button
      variant="secondary"
      size="sm"
      icon={Plus}
      disabled={!canAdd}
      data-testid="animation-add"
    >
      {t('panel.add')}
    </Button>
  );
  if (!canAdd) {
    return (
      <Tooltip content={t('panel.addHint')}>
        {/* A disabled button gets no pointer events, so the tooltip hangs on a wrapper. */}
        <span className="inline-flex">{button}</span>
      </Tooltip>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent>
        {CATEGORIES.map((category) => (
          <DropdownMenuSub key={category}>
            <DropdownMenuSubTrigger icon={CATEGORY_ICONS[category]}>
              {t(`category.${category}`)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {animationPresets[category].map((preset) => (
                <DropdownMenuItem key={preset} onSelect={() => onAdd(category, preset)}>
                  {nameLabel(`preset.${category}.${preset}`, preset)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- the list */

interface StepListProps {
  slide: Slide;
  list: ReturnType<typeof timelineList>;
  deckDir: 'ltr' | 'rtl';
  selected: readonly string[];
  /** The group a preview is playing, if one is. */
  playing: number | null;
  open: OpenRow | null;
  onOpen: (row: Row) => void;
  onChange: (step: AnimationStep, next: AnimationStep) => void;
  onRemove: (step: AnimationStep) => void;
  /** Moves a step before the step `before`, or to the end. */
  onMove: (step: AnimationStep, before: string | undefined) => void;
  onPlay: (group: number) => void;
}

/** A row being dragged: where it would land, and where the line that says so is drawn. */
interface Drag {
  step: AnimationStep;
  before: string | undefined;
  /** Pixels from the top of the list. */
  line: number;
}

function StepList(props: StepListProps) {
  const { t } = useTranslation('animations');
  const { slide, list, onMove } = props;
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useMemo(() => list.groups.flatMap((group) => group.rows), [list]);

  /** The gap the pointer is over: between the row whose middle is below it and the one above. */
  const gapAt = (step: AnimationStep, clientY: number): Drag | null => {
    const container = root.current;
    if (!container) return null;
    // The rows of the groups, in the order of `rows`; steps that do not play are not places.
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-group] [data-row]'));
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    const at = boxes.findIndex((box) => clientY < box.top + box.height / 2);
    const below = at < 0 ? undefined : rows[at];
    const above = at < 0 ? rows.at(-1) : rows[at - 1];
    const edge = at < 0 ? boxes.at(-1)?.bottom : boxes[at]?.top;
    if (edge === undefined) return null;
    return {
      step,
      before: dropTarget(slide.timeline, above, below),
      line: edge - container.getBoundingClientRect().top,
    };
  };

  const dragHandlers = (step: AnimationStep) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(gapAt(step, event.clientY));
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag) setDrag(gapAt(step, event.clientY));
    },
    onPointerUp: () => {
      if (drag) onMove(drag.step, drag.before);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  /** Alt with an arrow moves the step one place in the order of the timeline. */
  const nudge = (step: AnimationStep, by: 1 | -1) => {
    const steps = slide.timeline;
    const at = steps.findIndex((s) => s.id === step.id);
    const before = by < 0 ? steps[at - 1]?.id : steps[at + 2]?.id;
    if (by < 0 && before === undefined) return;
    onMove(step, before);
  };

  return (
    <div
      ref={root}
      role="list"
      aria-label={t('panel.timeline')}
      data-testid="animation-list"
      className="relative flex flex-col gap-3"
    >
      {list.groups.map((group) => (
        <GroupView
          key={group.index}
          {...props}
          group={group}
          dragging={drag?.step}
          dragHandlers={dragHandlers}
          onNudge={nudge}
        />
      ))}
      {list.unplayed.length > 0 && (
        <div role="group" aria-label={t('group.unplayed')} className="flex flex-col gap-0.5">
          <div className="flex h-6 items-center gap-2 text-xs font-medium text-ui-fg-muted">
            {t('group.unplayed')}
            <span className="font-normal">{t('group.unplayedHint')}</span>
          </div>
          {list.unplayed.map((step) => (
            <StepRow
              key={step.id}
              {...props}
              row={{ key: `x:${step.id}`, step, start: 0, end: 0 }}
              total={0}
            />
          ))}
        </div>
      )}
      {drag && (
        <span
          aria-hidden
          data-testid="animation-drop-line"
          className="pointer-events-none absolute inset-x-0 h-0.5 -translate-y-px rounded-full bg-ui-accent"
          style={{ top: drag.line }}
        />
      )}
    </div>
  );
}

type DragHandlers = (step: AnimationStep) => {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

function GroupView({
  group,
  dragging,
  dragHandlers,
  onNudge,
  ...props
}: StepListProps & {
  group: RowGroup;
  dragging: AnimationStep | undefined;
  dragHandlers: DragHandlers;
  onNudge: (step: AnimationStep, by: 1 | -1) => void;
}) {
  const { t } = useTranslation('animations');
  const label = group.index === 0 ? t('group.leadIn') : t('group.click', { n: group.index });
  const playing = props.playing === group.index;
  return (
    <div role="group" aria-label={label} data-group={group.index} className="flex flex-col gap-0.5">
      <div className="flex h-6 items-center gap-2 ps-1">
        <span
          className={cx('text-xs font-medium', playing ? 'text-ui-accent-fg' : 'text-ui-fg-muted')}
        >
          {label}
        </span>
        <span className="text-xs text-ui-fg-subtle tabular-nums">
          {seconds(group.duration)} {t('field.seconds')}
        </span>
        <div className="flex-1" />
        <IconButton
          icon={Play}
          size="sm"
          label={t('panel.previewGroup')}
          disabled={group.rows.length === 0}
          onClick={() => props.onPlay(group.index)}
        />
      </div>
      {group.rows.map((row) => (
        <StepRow
          key={row.key}
          {...props}
          row={row}
          total={group.duration}
          dimmed={dragging === row.step}
          handle={dragHandlers(row.step)}
          onNudge={onNudge}
        />
      ))}
    </div>
  );
}

function StepRow({
  slide,
  row,
  total,
  deckDir,
  selected,
  open,
  dimmed = false,
  handle,
  onOpen,
  onChange,
  onRemove,
  onNudge,
}: StepListProps & {
  row: Row;
  /** Length of the row's group in milliseconds, which its bar is drawn against. */
  total: number;
  dimmed?: boolean;
  handle?: ReturnType<DragHandlers>;
  onNudge?: (step: AnimationStep, by: 1 | -1) => void;
}) {
  const { t } = useTranslation('animations');
  const { step } = row;
  const element = findElement(slide, step.elementId);
  const name = element
    ? (element.name ?? elementSnippet(element) ?? t(`element.${element.type}`))
    : t('element.missing');
  const effect = effectLabel(step);
  const tone = CATEGORY_TONE[step.category];
  const isOpen = isOpenRow(row, open);
  const span = Math.max(total, 1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys typed into the row's own fields are theirs.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') onOpen(row);
    else if (event.key === 'Delete' || event.key === 'Backspace') onRemove(step);
    else if (event.altKey && event.key === 'ArrowUp') onNudge?.(step, -1);
    else if (event.altKey && event.key === 'ArrowDown') onNudge?.(step, 1);
    else return;
    event.preventDefault();
  };

  return (
    <div role="listitem" data-step={step.id} className={cx(dimmed && 'opacity-50')}>
      <div
        data-row={row.key}
        role="button"
        tabIndex={0}
        aria-expanded={playable(step.category) ? isOpen : undefined}
        aria-label={t('panel.row', { effect, name })}
        onClick={() => onOpen(row)}
        onKeyDown={onKeyDown}
        className={cx(
          'group flex h-control cursor-default items-center gap-2 rounded-control pe-1 -outline-offset-2 transition-colors',
          selected.includes(step.elementId) ? 'bg-ui-accent-soft' : 'hover:bg-ui-hover',
        )}
      >
        <span
          {...handle}
          aria-hidden
          data-testid="animation-drag"
          onClick={(event) => event.stopPropagation()}
          className={cx(
            'flex h-full w-5 shrink-0 touch-none items-center justify-center text-ui-fg-subtle',
            handle ? 'cursor-grab active:cursor-grabbing' : 'invisible',
          )}
        >
          <Icon icon={GripVertical} />
        </span>
        <Icon icon={CATEGORY_ICONS[step.category]} className={tone.text} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate">{name}</span>
          <span className="shrink-0 text-xs text-ui-fg-muted">
            {effect}
            {row.part && ` · ${t('panel.paragraph', row.part)}`}
          </span>
        </span>
        {total > 0 && (
          // Time runs left to right in every language, like a media scrubber.
          <span
            dir="ltr"
            aria-hidden
            className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ui-field"
          >
            <span
              className={cx('absolute inset-y-0 min-w-1 rounded-full', tone.bar)}
              style={{
                left: `${(row.start / span) * 100}%`,
                width: `${((row.end - row.start) / span) * 100}%`,
              }}
            />
          </span>
        )}
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('panel.remove')}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(step);
          }}
        />
      </div>
      {isOpen && playable(step.category) && (
        <StepEditor slide={slide} step={step} deckDir={deckDir} onChange={onChange} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- one step's settings */

function StepEditor({
  slide,
  step,
  deckDir,
  onChange,
}: {
  slide: Slide;
  step: AnimationStep;
  deckDir: 'ltr' | 'rtl';
  onChange: (step: AnimationStep, next: AnimationStep) => void;
}) {
  const { t } = useTranslation('animations');
  const inSeconds = useSeconds();
  const category = playable(step.category);
  if (!category) return null;
  const info = describePreset(category, step.preset);
  const set = (patch: Partial<AnimationStep>) =>
    onChange(step, patchStep([step], step.id, patch)[0] ?? step);
  const names = animationPresets[category];

  return (
    <div
      data-testid="animation-editor"
      className="mt-1 mb-2 ms-5 grid grid-cols-2 gap-3 rounded-control border border-ui-line p-3"
    >
      <Field label={t('field.kind')} className="col-span-2">
        <SegmentedControl
          aria-label={t('field.kind')}
          size="sm"
          fill
          value={category}
          onValueChange={(next) => onChange(step, withCategory(step, next))}
          options={CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))}
        />
      </Field>
      <Field label={t('field.effect')}>
        <Select
          aria-label={t('field.effect')}
          size="sm"
          value={names.includes(step.preset) ? step.preset : null}
          placeholder={step.preset}
          onValueChange={(preset) => onChange(step, withPreset(step, preset))}
          options={names.map((value) => ({
            value,
            label: nameLabel(`preset.${category}.${value}`, value),
          }))}
        />
      </Field>
      <Field label={t('field.start')}>
        <Select
          aria-label={t('field.start')}
          size="sm"
          value={step.trigger}
          onValueChange={(trigger) => set({ trigger })}
          options={TRIGGERS.map((value) => ({ value, label: t(`trigger.${value}`) }))}
        />
      </Field>
      <Field label={inSeconds(t('field.duration'))}>
        <SecondsField
          label={t('field.duration')}
          value={step.duration}
          onChange={(duration) => set({ duration })}
        />
      </Field>
      <Field label={inSeconds(t('field.delay'))}>
        <SecondsField
          label={t('field.delay')}
          value={step.delay}
          onChange={(delay) => set({ delay })}
        />
      </Field>
      {info.directional && (
        <Field label={t('field.direction')}>
          <DirectionField
            label={t('field.direction')}
            value={step.direction ?? info.direction}
            deckDir={deckDir}
            onChange={(direction) => set({ direction })}
          />
        </Field>
      )}
      {hasText(slide, step.elementId) && (
        <Field label={t('field.text')}>
          <Select
            aria-label={t('field.text')}
            size="sm"
            value={step.textBy ?? 'all'}
            // "All at once" is what a step without the field means: it is stored as absent.
            onValueChange={(textBy) => set({ textBy: textBy === 'all' ? undefined : textBy })}
            options={TEXT_BY.map((value) => ({ value, label: t(`textBy.${value}`) }))}
          />
        </Field>
      )}
      <Field label={t('field.easing')}>
        <Select
          aria-label={t('field.easing')}
          size="sm"
          value={EASINGS.find((value) => value === step.easing) ?? null}
          placeholder={t('easing.custom')}
          onValueChange={(easing) => set({ easing })}
          options={EASINGS.map((value) => ({ value, label: t(`easing.${value}`) }))}
        />
      </Field>
    </div>
  );
}
