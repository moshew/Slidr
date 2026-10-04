/** The strings of the design check: the panel, the status bar, and a name for every rule. English has the same keys. */
export const he = {
  panel: {
    none: 'אין ממצאי עיצוב',
    noneBody: 'כל השקפים עברו את הבדיקה.',
    checking: 'בודק את השקפים',
    failed: 'הבדיקה לא הצליחה לרוץ',
    failedBody: 'כל שינוי במצגת מריץ אותה שוב.',
    error: 'שגיאה אחת',
    errors: '{{count}} שגיאות',
    warning: 'אזהרה אחת',
    warnings: '{{count}} אזהרות',
    info: 'הערה אחת',
    infos: '{{count}} הערות',
    summary: 'סיכום הממצאים',
    show: 'מה להציג',
    showAll: 'הכול',
    showProblems: 'שגיאות ואזהרות',
    hidden: 'ההערות מוסתרות. "הכול" מציג גם אותן.',
    fixAll: 'תיקון הכול',
    fixAllCount: 'תיקון הכול ({{count}})',
    fixAllHint: 'מתקן כל שגיאה ואזהרה שיש לה תיקון אוטומטי, כצעד אחד שאפשר לבטל',
    fixedOne: 'תוקן ממצא אחד.',
    fixed: 'תוקנו {{count}} ממצאים.',
    fixedNone: 'לא נמצא מה לתקן אוטומטית.',
    fixWithAi: 'תיקון עם AI',
    fixWithAiHint: 'ה-Agent עובר על ממצאי המצגת כולה ומתקן אותם',
    fixSlideWithAi: 'תיקון השקף הזה עם AI',
    aiBusy: 'ה-Agent באמצע תור',
    aiMissing: 'ה-Agent אינו זמין כאן',
    slide: 'שקף {{n}}',
    slideFindings: 'הממצאים של שקף {{n}}',
    fix: 'תיקון',
    cannotFix: 'המצגת השתנתה. התיקון יהיה זמין בסוף הבדיקה.',
    goTo: '{{title}}, {{where}}. מעבר אל הממצא',
    wholeSlide: 'השקף כולו',
    elements: '{{count}} אובייקטים',
    details: 'פרטי המדידה',
    detailsNote: 'באנגלית, כפי שהם נמסרים ל-Agent',
  },
  severity: { error: 'שגיאה', warning: 'אזהרה', info: 'הערה' },
  undo: { fix: 'תיקון ממצא עיצוב', fixAll: 'תיקון ממצאי העיצוב' },
  status: {
    none: 'אין ממצאי עיצוב',
    checking: 'בודק את העיצוב',
    error: 'שגיאת עיצוב אחת',
    errors: '{{count}} שגיאות עיצוב',
    finding: 'ממצא עיצוב אחד',
    findings: '{{count}} ממצאי עיצוב',
    open: 'פתיחת בדיקת העיצוב',
  },
  element: {
    text: 'תיבת טקסט',
    image: 'תמונה',
    shape: 'צורה',
    line: 'קו',
    svg: 'אייקון',
    group: 'קבוצה',
    table: 'טבלה',
    chart: 'גרף',
    video: 'וידאו',
    audio: 'אודיו',
    html: 'אובייקט HTML',
  },
  rule: {
    L01: {
      title: 'טקסט גולש מהתיבה שלו',
      advice: 'חלק מהטקסט יוצא מהתיבה. אפשר להגדיל את התיבה, לקצר את הטקסט או לכווץ אותו.',
      fix: 'מגדיל את התיבה כשיש לה מקום, ואחרת מכווץ את הטקסט',
    },
    L02: {
      title: 'אובייקט חורג מהשקף',
      advice: 'טקסט, טבלה או גרף שיוצאים מגבולות השקף נחתכים בהצגה.',
      fix: 'מזיז את האובייקט אל תוך השקף',
    },
    L03: {
      title: 'טקסט בשולי הבטיחות',
      advice: 'הטקסט קרוב מדי לקצה השקף. רק רקעים, תמונות וקישוטים אמורים להגיע לשוליים.',
      fix: 'מזיז את הטקסט אל תוך אזור התוכן',
    },
    L04: {
      title: 'טקסט קטן מ-24 פיקסלים',
      advice: 'טקסט בגודל כזה אינו נקרא מרחוק.',
      fix: 'מגדיל את הטקסט ל-24 פיקסלים',
    },
    L05: {
      title: 'ניגודיות נמוכה',
      advice: 'הטקסט אינו בולט מספיק מעל מה שמאחוריו.',
      fix: 'מחליף את צבע הטקסט בצבע שנקרא, ואם אין כזה מוסיף הכהיה מתחתיו',
    },
    L06: {
      title: 'טקסטים חופפים',
      advice: 'שני טקסטים מצוירים זה על זה. צריך להזיז או להקטין אחד מהם.',
    },
    L07: {
      title: 'השקף אינו מנוצל',
      advice:
        'התוכן תופס פחות מ-60% מאזור התוכן. אפשר להגדיל אותו, לפרוס אותו או להוסיף אלמנט חזותי.',
    },
    L08: {
      title: 'התוכן נוטה לצד אחד',
      advice: 'מרכז הכובד של התוכן רחוק ממרכז השקף. אם זה אינו מכוון, אפשר לאזן באלמנט בצד השני.',
    },
    L09: {
      title: 'כמעט מיושרים',
      advice: 'קצוות של אובייקטים רחוקים זה מזה פיקסלים בודדים, והעין רואה את זה.',
      fix: 'מצמיד את הקצוות לקו אחד',
    },
    L10: {
      title: 'מרווחים לא אחידים',
      advice: 'אובייקטים זהים בשורה או בטור, והמרווחים ביניהם שונים.',
      fix: 'מפזר את האובייקטים במרווחים שווים',
    },
    L11: {
      title: 'גופנים או צבעים שאינם מהתבנית',
      advice:
        'צבע שאינו מהתבנית לא ישתנה כשהתבנית תוחלף, ויותר משתי משפחות גופנים נראות כמו טלאים.',
      fix: 'מחזיר את הטקסט לגופני התבנית, ומחליף כל צבע בצבע התבנית הקרוב אליו',
    },
    L12: {
      title: 'תמונה מוגדלת או מעוותת',
      advice: 'התמונה מוצגת מעל 150% מהרזולוציה שלה, או שהפרופורציות שלה נמתחו.',
    },
    L13: {
      title: 'יותר מדי טקסט',
      advice:
        'יותר מ-60 מילים או מ-6 תבליטים בשקף. כדאי לפצל לשני שקפים, או להפוך חלק מהטקסט לוויזואליה.',
    },
    L14: {
      title: 'שלושה שקפים דומים ברצף',
      advice: 'זה השקף השלישי ברצף מאותו סוג. גיוון שומר על הקשב.',
    },
    L15: {
      title: 'כיוון הפסקה אינו תואם לטקסט',
      advice: 'הפסקה מסודרת בכיוון ההפוך לשפה שלה, ולכן סימני הפיסוק והמספרים נוחתים בצד הלא נכון.',
      fix: 'קובע לפסקה את הכיוון של הטקסט שלה',
    },
    L16: {
      title: 'אין אלמנט חזותי',
      advice: 'בשקף יש רק טקסט. תמונה, גרף, אייקון או צורה יעזרו למסר.',
    },
    L17: {
      title: 'פס ריק בתחתית השקף',
      advice:
        'רבע מהשקף ויותר נשאר ריק מתחת לתוכן. אפשר לפרוס את התוכן, להגדיל אותו או למרכז אותו.',
    },
    other: { title: 'ממצא עיצוב', advice: 'כלל שהגרסה הזו של האפליקציה אינה מכירה.' },
  },
};

export const en: typeof he = {
  panel: {
    none: 'No design issues',
    noneBody: 'Every slide passed the check.',
    checking: 'Checking the slides',
    failed: 'The check could not run',
    failedBody: 'Any change to the deck runs it again.',
    error: '1 error',
    errors: '{{count}} errors',
    warning: '1 warning',
    warnings: '{{count}} warnings',
    info: '1 note',
    infos: '{{count}} notes',
    summary: 'Summary of the findings',
    show: 'What to show',
    showAll: 'All',
    showProblems: 'Errors and warnings',
    hidden: 'Notes are hidden. "All" shows them too.',
    fixAll: 'Fix all',
    fixAllCount: 'Fix all ({{count}})',
    fixAllHint: 'Fixes every error and warning that has an automatic fix, as one step to undo',
    fixedOne: '1 finding fixed.',
    fixed: '{{count}} findings fixed.',
    fixedNone: 'Nothing here has an automatic fix.',
    fixWithAi: 'Fix with AI',
    fixWithAiHint: 'The agent goes over the findings of the whole deck and fixes them',
    fixSlideWithAi: 'Fix this slide with AI',
    aiBusy: 'The agent is in the middle of a turn',
    aiMissing: 'The agent is not available here',
    slide: 'Slide {{n}}',
    slideFindings: 'The findings of slide {{n}}',
    fix: 'Fix',
    cannotFix: 'The deck has changed. The fix is back when the check is done.',
    goTo: '{{title}}, {{where}}. Go to the finding',
    wholeSlide: 'The whole slide',
    elements: '{{count}} objects',
    details: 'What was measured',
    detailsNote: 'In English, as it is handed to the agent',
  },
  severity: { error: 'Error', warning: 'Warning', info: 'Note' },
  undo: { fix: 'Fix a design finding', fixAll: 'Fix the design findings' },
  status: {
    none: 'No design issues',
    checking: 'Checking the design',
    error: '1 design error',
    errors: '{{count}} design errors',
    finding: '1 design finding',
    findings: '{{count}} design findings',
    open: 'Open the design check',
  },
  element: {
    text: 'Text box',
    image: 'Image',
    shape: 'Shape',
    line: 'Line',
    svg: 'Icon',
    group: 'Group',
    table: 'Table',
    chart: 'Chart',
    video: 'Video',
    audio: 'Audio',
    html: 'HTML object',
  },
  rule: {
    L01: {
      title: 'Text overflows its box',
      advice:
        'Part of the text runs out of the box. Enlarge the box, shorten the text or shrink it.',
      fix: 'Makes the box taller where there is room, and shrinks the text where there is not',
    },
    L02: {
      title: 'An object leaves the slide',
      advice: 'Text, a table or a chart that runs past the edge of the slide is cut off in a show.',
      fix: 'Moves the object onto the slide',
    },
    L03: {
      title: 'Text in the safe margins',
      advice:
        'The text is too close to the edge of the slide. Only backgrounds, pictures and decoration belong in the margins.',
      fix: 'Moves the text into the content area',
    },
    L04: {
      title: 'Text smaller than 24 pixels',
      advice: 'Text this small cannot be read from the back of a room.',
      fix: 'Sets the text at 24 pixels',
    },
    L05: {
      title: 'Low contrast',
      advice: 'The text does not stand out from what is behind it.',
      fix: 'Changes the text to a colour that reads, and where none does, puts a veil under it',
    },
    L06: {
      title: 'Texts overlap',
      advice: 'Two texts are drawn over each other. Move one of them, or make it smaller.',
    },
    L07: {
      title: 'The slide is not filled',
      advice:
        'The content takes less than 60% of the content area. Enlarge it, spread it out, or add a visual element.',
    },
    L08: {
      title: 'The content leans to one side',
      advice:
        'The centre of gravity of the content is far from the centre of the slide. If that is not meant, balance it with an element on the other side.',
    },
    L09: {
      title: 'Nearly aligned',
      advice: 'Edges of objects are a few pixels apart, and the eye sees it.',
      fix: 'Brings the edges to one line',
    },
    L10: {
      title: 'Uneven spacing',
      advice: 'Objects of one size in a row or a column, with gaps that differ.',
      fix: 'Spreads the objects evenly',
    },
    L11: {
      title: "Fonts or colours that are not the template's",
      advice:
        'A colour that is not of the template stays as it is when the template changes, and more than two font families look assembled.',
      fix: "Takes the text back to the template's fonts, and turns each colour into the nearest colour of the template",
    },
    L12: {
      title: 'A picture enlarged or stretched',
      advice: 'The picture is drawn past 150% of its resolution, or out of its proportions.',
    },
    L13: {
      title: 'Too much text',
      advice:
        'More than 60 words or 6 bullets on the slide. Split it into two slides, or turn part of the text into a visual.',
    },
    L14: {
      title: 'Three slides alike in a row',
      advice: 'This is the third slide in a row of the same kind. Variety holds attention.',
    },
    L15: {
      title: 'A paragraph set against its text',
      advice:
        'The paragraph is laid out in the direction opposite to its language, so its punctuation and numbers land on the wrong side.',
      fix: 'Gives the paragraph the direction of its text',
    },
    L16: {
      title: 'No visual element',
      advice:
        'The slide is text alone. A picture, a chart, an icon or a shape would carry the message.',
    },
    L17: {
      title: 'An empty band at the bottom',
      advice:
        'A quarter of the slide or more is empty under the content. Spread the content down, enlarge it, or centre it.',
    },
    other: { title: 'A design finding', advice: 'A rule this version of the app does not know.' },
  },
};
