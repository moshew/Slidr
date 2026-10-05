/**
 * The strings of the export dialog. English has the same keys (`registerMessages` checks). A
 * count has a string for one and a string for more, chosen by the code (`counted`): Hebrew has a
 * form for two as well, and "2 שקפים" reads right without one.
 */
export const he = {
  title: 'ייצוא ל-HTML',
  description: 'קובץ אחד שמתנגן בכל דפדפן, גם בלי אינטרנט.',
  descriptionBeside: 'קובץ שמתנגן בכל דפדפן, גם בלי אינטרנט, ולידו תיקייה עם הווידאו והאודיו.',
  close: 'סגירה',
  cancel: 'ביטול',
  export: 'ייצוא',
  again: 'ייצוא נוסף',
  filter: 'דף HTML',
  slides: {
    label: 'שקפים',
    all: 'כל המצגת',
    range: 'טווח',
    from: 'משקף',
    to: 'עד שקף',
    countOne: 'ייוצא שקף אחד.',
    countMany: 'ייוצאו {{n}} שקפים.',
    hiddenOne: 'שקף מוסתר אחד לא ייכלל.',
    hiddenMany: '{{n}} שקפים מוסתרים לא ייכללו.',
    none: 'אין שקפים לייצא בטווח הזה.',
  },
  animations: {
    label: 'אנימציות ומעברים',
    with: 'כלולים',
    without: 'בלי',
    withoutHint: 'כל שקף יוצג שלם, והמעבר לשקף הבא יהיה מיידי.',
  },
  media: {
    label: 'וידאו ואודיו',
    inside: 'בתוך הקובץ',
    beside: 'בתיקייה ליד הקובץ',
    countOne: 'קובץ מדיה אחד',
    countMany: '{{n}} קובצי מדיה',
    insideHint: '{{count}}: הקובץ יגדל בכ-{{size}}.',
    large:
      '{{count}}: הקובץ יגדל בכ-{{size}}. קובץ כזה נפתח לאט וקשה לשלוח אותו; אפשר לשמור את המדיה בתיקייה ליד הקובץ.',
    besideHint:
      '{{count}}, {{size}}, יישמרו בתיקייה ליד הקובץ. כדי שיתנגנו, התיקייה צריכה לעבור יחד עם הקובץ.',
    tooLarge:
      '{{count}}, {{size}}: יותר ממה שקובץ אחד יכול להכיל. המדיה תישמר בתיקייה ליד הקובץ, והתיקייה צריכה לעבור יחד איתו.',
  },
  working: 'מייצא את המצגת…',
  done: {
    saved: 'הקובץ נשמר',
    downloaded: 'הקובץ ירד למחשב',
    slidesOne: 'שקף אחד',
    slidesMany: '{{n}} שקפים',
    seconds: '{{n}} שניות',
    assets: 'נכסים בקובץ',
    noAssets: 'אין בקובץ תמונות או מדיה.',
    fonts: 'גופנים בקובץ',
    noFonts: 'אין בקובץ גופנים: הטקסט יוצג בגופני המחשב שיפתח אותו.',
    fontsOne: 'גופן אחד, {{size}} במקום {{original}}',
    fontsMany: '{{n}} גופנים, {{size}} במקום {{original}}',
    charts: 'גרפים בקובץ',
    chartsOne: 'גרף חי אחד. הספרייה שמציירת אותו מוסיפה לקובץ {{size}}.',
    chartsMany: '{{n}} גרפים חיים. הספרייה שמציירת אותם מוסיפה לקובץ {{size}}.',
    asset: 'נכס',
    original: 'במצגת',
    embedded: 'בקובץ',
    warnings: 'לתשומת לבכם',
    media: 'מדיה ליד הקובץ',
    mediaFolder: 'בתיקייה {{folder}}, ליד הקובץ. היא צריכה לעבור יחד איתו.',
    mediaDownloaded:
      'קובצי המדיה ירדו בנפרד. כדי שיתנגנו, יש לשים אותם בתיקייה בשם {{folder}} ליד הקובץ.',
  },
  warning: {
    assetUnreadable: 'הנכס {{name}} לא נקרא, והוא חסר בקובץ.',
    fontWhole: 'הגופן {{name}} נכנס לקובץ במלואו.',
    fontsWhole: 'הגופנים נכנסו לקובץ במלואם: מה שמצמצם אותם לתווים שבשימוש לא נטען.',
    fontUnreadable: 'הגופן {{name}} לא נקרא, והוא חסר בקובץ.',
    noShadowRoots: 'הדפדפן הזה לא יודע לכתוב אובייקטי HTML: התוכן שלהם חסר בקובץ.',
    markupUnstable:
      'הקוד של האובייקט {{name}} לא נכתב לקובץ כמו שהוא מצויר, ולכן האובייקט ריק בקובץ.',
  },
  failed: {
    title: 'הייצוא נכשל',
    save: 'הקובץ לא נשמר',
    media: 'המדיה לא הועתקה',
  },
};

export const en: typeof he = {
  title: 'Export to HTML',
  description: 'One file that plays in any browser, with or without the internet.',
  descriptionBeside:
    'A file that plays in any browser, with or without the internet, and a folder beside it with the video and audio.',
  close: 'Close',
  cancel: 'Cancel',
  export: 'Export',
  again: 'Export again',
  filter: 'HTML page',
  slides: {
    label: 'Slides',
    all: 'The whole deck',
    range: 'A range',
    from: 'From slide',
    to: 'to slide',
    countOne: 'One slide will be exported.',
    countMany: '{{n}} slides will be exported.',
    hiddenOne: 'One hidden slide is left out.',
    hiddenMany: '{{n}} hidden slides are left out.',
    none: 'There are no slides to export in this range.',
  },
  animations: {
    label: 'Animations and transitions',
    with: 'Included',
    without: 'Without',
    withoutHint: 'Every slide is shown whole, and the next one comes at once.',
  },
  media: {
    label: 'Video and audio',
    inside: 'Inside the file',
    beside: 'In a folder beside it',
    countOne: 'One media file',
    countMany: '{{n}} media files',
    insideHint: '{{count}}: the file grows by about {{size}}.',
    large:
      '{{count}}: the file grows by about {{size}}. A file that large is slow to open and hard to send; the media can go in a folder beside the file instead.',
    besideHint:
      '{{count}}, {{size}}, go into a folder beside the file. They play only when the folder travels with the file.',
    tooLarge:
      '{{count}}, {{size}}: more than one file can hold. The media goes into a folder beside the file, and the folder has to travel with it.',
  },
  working: 'Exporting the deck…',
  done: {
    saved: 'The file was saved',
    downloaded: 'The file was downloaded',
    slidesOne: 'One slide',
    slidesMany: '{{n}} slides',
    seconds: '{{n}} seconds',
    assets: 'Assets in the file',
    noAssets: 'The file has no pictures or media.',
    fonts: 'Fonts in the file',
    noFonts:
      'The file has no fonts: its text will be shown in the fonts of the computer that opens it.',
    fontsOne: 'One font, {{size}} instead of {{original}}',
    fontsMany: '{{n}} fonts, {{size}} instead of {{original}}',
    charts: 'Charts in the file',
    chartsOne: 'One live chart. The library that draws it adds {{size}} to the file.',
    chartsMany: '{{n}} live charts. The library that draws them adds {{size}} to the file.',
    asset: 'Asset',
    original: 'In the deck',
    embedded: 'In the file',
    warnings: 'Worth knowing',
    media: 'Media beside the file',
    mediaFolder: 'In the folder {{folder}}, beside the file. It has to travel with the file.',
    mediaDownloaded:
      'The media files were downloaded separately. To play, they belong in a folder named {{folder}} beside the file.',
  },
  warning: {
    assetUnreadable: 'The asset {{name}} could not be read, and is missing from the file.',
    fontWhole: 'The font {{name}} went into the file whole.',
    fontsWhole:
      'The fonts went into the file whole: what cuts them down to the characters in use could not be loaded.',
    fontUnreadable: 'The font {{name}} could not be read, and is missing from the file.',
    noShadowRoots:
      'This browser cannot write HTML objects: their content is missing from the file.',
    markupUnstable:
      'The code of the object {{name}} could not be written to the file as it is drawn, so the object is empty in the file.',
  },
  failed: {
    title: 'The export failed',
    save: 'The file was not saved',
    media: 'The media was not copied',
  },
};
