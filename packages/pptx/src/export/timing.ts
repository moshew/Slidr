import type { AnimationStep, Slide } from '@slidr/model';
import { el } from '../xml';
import type { ExportContext } from './context';

/*
 * The animations of a slide as PowerPoint's timing tree. Each step that waits for a click opens a
 * group; a step "after previous" starts a new row of the group, after the ones before it; a step
 * "with previous" plays beside the step before it. The effects are PowerPoint's own presets
 * (appear, fade, fly in, wipe, zoom, grow/shrink), so PowerPoint lists and edits them; an
 * animation it has nothing like is written as the nearest of them.
 */

/**
 * The ids the shapes of the slide were given, by element id: what the timing points at. A shape
 * with text is built as a whole (`p:bldP`).
 */
export type ShapeIds = Map<string, { id: number; text: boolean }>;

interface Effect {
  presetID: number;
  presetSubtype: number;
  behaviours: (spid: number, dur: number, ids: () => number) => string;
}

const target = (spid: number) => el('p:tgtEl', {}, el('p:spTgt', { spid }));

const setVisibility = (spid: number, visible: boolean, at: number, ids: () => number) =>
  el(
    'p:set',
    {},
    el(
      'p:cBhvr',
      {},
      el(
        'p:cTn',
        { id: ids(), dur: 1, fill: 'hold' },
        el('p:stCondLst', {}, el('p:cond', { delay: at })),
      ),
      target(spid),
      el('p:attrNameLst', {}, '<p:attrName>style.visibility</p:attrName>'),
    ),
    el('p:to', {}, el('p:strVal', { val: visible ? 'visible' : 'hidden' })),
  );

const filterEffect = (
  spid: number,
  dur: number,
  ids: () => number,
  filter: string,
  into: boolean,
) =>
  el(
    'p:animEffect',
    { transition: into ? 'in' : 'out', filter },
    el('p:cBhvr', {}, el('p:cTn', { id: ids(), dur }), target(spid)),
  );

/** A property animated between two values: `ppt_x` from off the slide to where it is. */
const move = (
  spid: number,
  dur: number,
  ids: () => number,
  attr: string,
  from: string,
  to: string,
) =>
  el(
    'p:anim',
    { calcmode: 'lin', valueType: 'num' },
    el(
      'p:cBhvr',
      { additive: 'base' },
      el('p:cTn', { id: ids(), dur, fill: 'hold' }),
      target(spid),
      el('p:attrNameLst', {}, `<p:attrName>${attr}</p:attrName>`),
    ),
    el(
      'p:tavLst',
      {},
      el('p:tav', { tm: 0 }, el('p:val', {}, el('p:strVal', { val: from }))),
      el('p:tav', { tm: 100000 }, el('p:val', {}, el('p:strVal', { val: to }))),
    ),
  );

type Dir = 'up' | 'down' | 'left' | 'right';

/** The side a step moves toward, on the slide: `start` and `end` turn with the deck. */
function sideOf(step: AnimationStep, rtl: boolean, fallback: Dir): Dir {
  switch (step.direction) {
    case 'up':
      return 'up';
    case 'down':
      return 'down';
    case 'start':
      return rtl ? 'right' : 'left';
    case 'end':
      return rtl ? 'left' : 'right';
    default:
      return fallback;
  }
}

/** PowerPoint's subtypes of "Fly In" and "Wipe": the side the shape comes from. */
const FROM_SUBTYPE: Record<Dir, number> = { up: 4, down: 1, left: 2, right: 8 };

function entrance(step: AnimationStep, rtl: boolean, ctx: ExportContext): Effect {
  const toward = sideOf(step, rtl, 'up');
  switch (step.preset) {
    case 'appear':
      return {
        presetID: 1,
        presetSubtype: 0,
        behaviours: (spid, _dur, ids) => setVisibility(spid, true, 0, ids),
      };
    case 'fade':
    case 'blur':
      return {
        presetID: 10,
        presetSubtype: 0,
        behaviours: (spid, dur, ids) =>
          setVisibility(spid, true, 0, ids) + filterEffect(spid, dur, ids, 'fade', true),
      };
    case 'flyIn':
    case 'rise':
    case 'slideIn':
    case 'dropIn': {
      // The shape travels toward `toward`: it comes from the opposite side.
      const from: Dir =
        step.preset === 'dropIn'
          ? 'up'
          : toward === 'up'
            ? 'down'
            : toward === 'down'
              ? 'up'
              : toward === 'left'
                ? 'right'
                : 'left';
      const axis = from === 'left' || from === 'right' ? 'ppt_x' : 'ppt_y';
      const start =
        from === 'left'
          ? '0-#ppt_w/2'
          : from === 'right'
            ? '1+#ppt_w/2'
            : from === 'up'
              ? '0-#ppt_h/2'
              : '1+#ppt_h/2';
      return {
        presetID: 2,
        presetSubtype: FROM_SUBTYPE[from === 'up' ? 'down' : from === 'down' ? 'up' : from],
        behaviours: (spid, dur, ids) =>
          setVisibility(spid, true, 0, ids) +
          move(spid, dur, ids, axis, start, `#${axis}`) +
          move(
            spid,
            dur,
            ids,
            axis === 'ppt_x' ? 'ppt_y' : 'ppt_x',
            axis === 'ppt_x' ? '#ppt_y' : '#ppt_x',
            axis === 'ppt_x' ? '#ppt_y' : '#ppt_x',
          ),
      };
    }
    case 'wipe': {
      const filter = {
        up: 'wipe(up)',
        down: 'wipe(down)',
        left: 'wipe(left)',
        right: 'wipe(right)',
      }[toward];
      return {
        presetID: 22,
        presetSubtype:
          FROM_SUBTYPE[
            toward === 'up'
              ? 'up'
              : toward === 'down'
                ? 'down'
                : toward === 'left'
                  ? 'right'
                  : 'left'
          ],
        behaviours: (spid, dur, ids) =>
          setVisibility(spid, true, 0, ids) + filterEffect(spid, dur, ids, filter, true),
      };
    }
    case 'zoom':
    case 'pop':
    case 'scaleUp':
    case 'expand':
    case 'elastic':
      return {
        presetID: 53,
        presetSubtype: 16,
        behaviours: (spid, dur, ids) =>
          setVisibility(spid, true, 0, ids) +
          move(spid, dur, ids, 'ppt_w', '0', '#ppt_w') +
          move(spid, dur, ids, 'ppt_h', '0', '#ppt_h') +
          filterEffect(spid, dur, ids, 'fade', true),
      };
    default:
      ctx.warn('animation-approximated', step.preset);
      return entrance({ ...step, preset: 'fade' }, rtl, ctx);
  }
}

function exit(step: AnimationStep, rtl: boolean, ctx: ExportContext): Effect {
  const toward = sideOf(step, rtl, 'down');
  const hide = (spid: number, dur: number, ids: () => number) =>
    setVisibility(spid, false, Math.max(0, dur - 1), ids);
  switch (step.preset) {
    case 'disappear':
      return {
        presetID: 1,
        presetSubtype: 0,
        behaviours: (spid, _dur, ids) => setVisibility(spid, false, 0, ids),
      };
    case 'fade':
    case 'blur':
      return {
        presetID: 10,
        presetSubtype: 0,
        behaviours: (spid, dur, ids) =>
          filterEffect(spid, dur, ids, 'fade', false) + hide(spid, dur, ids),
      };
    case 'flyOut':
    case 'sink':
    case 'slideOut':
    case 'dropOut': {
      const to: Dir = step.preset === 'sink' || step.preset === 'dropOut' ? 'down' : toward;
      const axis = to === 'left' || to === 'right' ? 'ppt_x' : 'ppt_y';
      const end =
        to === 'left'
          ? '0-#ppt_w/2'
          : to === 'right'
            ? '1+#ppt_w/2'
            : to === 'up'
              ? '0-#ppt_h/2'
              : '1+#ppt_h/2';
      return {
        presetID: 2,
        presetSubtype:
          FROM_SUBTYPE[
            to === 'up' ? 'up' : to === 'down' ? 'down' : to === 'left' ? 'right' : 'left'
          ],
        behaviours: (spid, dur, ids) =>
          move(spid, dur, ids, axis, `#${axis}`, end) + hide(spid, dur, ids),
      };
    }
    case 'wipe': {
      const filter = {
        up: 'wipe(up)',
        down: 'wipe(down)',
        left: 'wipe(left)',
        right: 'wipe(right)',
      }[toward];
      return {
        presetID: 22,
        presetSubtype: 1,
        behaviours: (spid, dur, ids) =>
          filterEffect(spid, dur, ids, filter, false) + hide(spid, dur, ids),
      };
    }
    case 'zoom':
    case 'pop':
    case 'scaleDown':
    case 'contract':
      return {
        presetID: 53,
        presetSubtype: 16,
        behaviours: (spid, dur, ids) =>
          move(spid, dur, ids, 'ppt_w', '#ppt_w', '0') +
          move(spid, dur, ids, 'ppt_h', '#ppt_h', '0') +
          filterEffect(spid, dur, ids, 'fade', false) +
          hide(spid, dur, ids),
      };
    default:
      ctx.warn('animation-approximated', step.preset);
      return exit({ ...step, preset: 'fade' }, rtl, ctx);
  }
}

function emphasis(step: AnimationStep, ctx: ExportContext): Effect {
  if (step.preset !== 'pulse' && step.preset !== 'growShrink') {
    ctx.warn('animation-approximated', step.preset);
  }
  const by = step.preset === 'pulse' ? 105000 : 115000;
  return {
    presetID: step.preset === 'pulse' ? 26 : 6,
    presetSubtype: 0,
    behaviours: (spid, dur, ids) =>
      el(
        'p:animScale',
        {},
        el(
          'p:cBhvr',
          {},
          el('p:cTn', {
            id: ids(),
            dur: Math.max(1, Math.round(dur / 2)),
            autoRev: 1,
            fill: 'hold',
          }),
          target(spid),
        ),
        el('p:by', { x: by, y: by }),
      ),
  };
}

const CLASS = { entrance: 'entr', exit: 'exit', emphasis: 'emph', motion: 'path' } as const;

/** The timing tree of a slide's animations; nothing for a slide without any. */
export function timingXml(slide: Slide, ctx: ExportContext, shapeIds?: ShapeIds): string {
  if (!shapeIds || slide.timeline.length === 0) return '';
  const rtl = ctx.deck.meta.dir === 'rtl';
  const steps = slide.timeline.filter(
    (step) => shapeIds.has(step.elementId) && step.category !== 'motion',
  );
  if (steps.some((step) => step.category === 'motion'))
    ctx.warn('animation-approximated', 'motion');
  if (steps.length === 0) return '';
  let next = 2;
  const ids = () => ++next;
  // Click groups, each of rows that follow one another, each of effects that play together.
  type Row = { delay: number; effects: AnimationStep[] };
  const groups: { click: boolean; rows: Row[] }[] = [];
  for (const step of steps) {
    let group = groups.at(-1);
    if (!group || step.trigger === 'onClick') {
      group = { click: step.trigger === 'onClick', rows: [] };
      groups.push(group);
    }
    let row = group.rows.at(-1);
    if (!row || step.trigger === 'afterPrevious') {
      const before = row
        ? row.delay + Math.max(...row.effects.map((s) => s.delay + s.duration))
        : 0;
      row = { delay: before, effects: [] };
      group.rows.push(row);
    }
    row.effects.push(step);
  }
  const builds = new Set<number>();
  const groupXml = groups.map((group, g) => {
    const groupId = ids();
    const rows = group.rows.map((row) => {
      const rowId = ids();
      const effects = row.effects.map((step) => {
        const shape = shapeIds.get(step.elementId)!;
        const spid = shape.id;
        const effect =
          step.category === 'entrance'
            ? entrance(step, rtl, ctx)
            : step.category === 'exit'
              ? exit(step, rtl, ctx)
              : emphasis(step, ctx);
        if (step.category !== 'emphasis' && shape.text) builds.add(spid);
        const nodeType =
          step.trigger === 'onClick'
            ? 'clickEffect'
            : step.trigger === 'afterPrevious'
              ? 'afterEffect'
              : 'withEffect';
        const effectId = ids();
        return el(
          'p:par',
          {},
          el(
            'p:cTn',
            {
              id: effectId,
              presetID: effect.presetID,
              presetClass: CLASS[step.category],
              presetSubtype: effect.presetSubtype,
              fill: 'hold',
              grpId: 0,
              nodeType,
            },
            el('p:stCondLst', {}, el('p:cond', { delay: Math.round(step.delay) })),
            el(
              'p:childTnLst',
              {},
              effect.behaviours(spid, Math.max(1, Math.round(step.duration)), ids),
            ),
          ),
        );
      });
      return el(
        'p:par',
        {},
        el(
          'p:cTn',
          { id: rowId, fill: 'hold' },
          el('p:stCondLst', {}, el('p:cond', { delay: Math.round(row.delay) })),
          el('p:childTnLst', {}, ...effects),
        ),
      );
    });
    // A group that does not wait for a click starts with the slide, or after the group before.
    const start = group.click
      ? el('p:cond', { delay: 'indefinite' })
      : g === 0
        ? el('p:cond', { delay: 'indefinite' }) +
          el('p:cond', { evt: 'onBegin', delay: 0 }, el('p:tn', { val: 2 }))
        : el('p:cond', { delay: 0 });
    return el(
      'p:par',
      {},
      el(
        'p:cTn',
        { id: groupId, fill: 'hold' },
        el('p:stCondLst', {}, start),
        el('p:childTnLst', {}, ...rows),
      ),
    );
  });
  const slideTarget = el('p:tgtEl', {}, el('p:sldTgt'));
  return el(
    'p:timing',
    {},
    el(
      'p:tnLst',
      {},
      el(
        'p:par',
        {},
        el(
          'p:cTn',
          { id: 1, dur: 'indefinite', restart: 'never', nodeType: 'tmRoot' },
          el(
            'p:childTnLst',
            {},
            el(
              'p:seq',
              { concurrent: 1, nextAc: 'seek' },
              el(
                'p:cTn',
                { id: 2, dur: 'indefinite', nodeType: 'mainSeq' },
                el('p:childTnLst', {}, ...groupXml),
              ),
              el('p:prevCondLst', {}, el('p:cond', { evt: 'onPrev', delay: 0 }, slideTarget)),
              el('p:nextCondLst', {}, el('p:cond', { evt: 'onNext', delay: 0 }, slideTarget)),
            ),
          ),
        ),
      ),
    ),
    builds.size
      ? el(
          'p:bldLst',
          {},
          ...[...builds].map((spid) => el('p:bldP', { spid, grpId: 0, animBg: 1 })),
        )
      : undefined,
  );
}
