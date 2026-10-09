/*
 * The strings of the keyboard's way round the window and of what a screen reader hears where
 * the app draws its own widgets (UI-06). Namespace `a11y`.
 */

export const he = {
  keys: {
    nextPane: 'אל האזור הבא של החלון',
    previousPane: 'אל האזור הקודם של החלון',
  },
  // The Filmstrip: the name of its list, the states of a slide beside its number, and the mark
  // of the transition between two slides (FLM-04).
  strip: {
    transition: 'יש מעבר',
    transitionInto: 'המעבר אל שקף {{n}}: {{name}}',
    addTransition: 'הוספת מעבר אל שקף {{n}}',
    animations_one: 'אנימציה אחת',
    animations_two: 'שתי אנימציות',
    animations_other: '{{count}} אנימציות',
  },
  // Where the selection walk stands in the Filmstrip, said to a screen reader.
  at: {
    slideSelected: '{{what}}: בתוך הבחירה',
    slideFree: '{{what}}: מחוץ לבחירה',
  },
  // A row of the Layers panel: what its two toggles show, said with the row.
  layers: {
    locked: 'נעול',
    hidden: 'מוסתר',
  },
};

export const en = {
  keys: {
    nextPane: 'To the next region of the window',
    previousPane: 'To the region of the window before',
  },
  strip: {
    transition: 'Has a transition',
    transitionInto: 'Transition into slide {{n}}: {{name}}',
    addTransition: 'Add a transition into slide {{n}}',
    animations_one: '1 animation',
    animations_two: '{{count}} animations',
    animations_other: '{{count}} animations',
  },
  at: {
    slideSelected: '{{what}}: in the selection',
    slideFree: '{{what}}: not in the selection',
  },
  layers: {
    locked: 'Locked',
    hidden: 'Hidden',
  },
};
