import type { Messages } from '../i18n/he';

/**
 * The strings of PowerPoint export and import (ADR-108). English has the same keys
 * (`registerMessages` checks). What the HTML export dialog says too (the slides, the animations,
 * the buttons) is read from its namespace, `export`. A warning names the slides it is on with
 * `slides`; `{{detail}}` is the font, the file or the kind of object it is about.
 */
export const he = {
  filter: 'מצגת PowerPoint',
  export: {
    title: 'ייצוא ל-PowerPoint',
    description:
      'קובץ ‎.pptx שנפתח ב-PowerPoint, ב-Keynote וב-Google Slides, וכל טקסט, צורה, טבלה ותרשים בו ניתנים לעריכה.',
    working: 'מייצא את המצגת…',
    mediaOne: 'קובץ מדיה אחד בתוך הקובץ, {{size}}',
    mediaMany: '{{n}} קובצי מדיה בתוך הקובץ, {{size}}',
    noMedia: 'אין בקובץ תמונות או מדיה.',
    fonts: 'גופנים',
    fontsBody:
      'הגופנים אינם בתוך הקובץ: PowerPoint מציג אותם רק במחשב שהם מותקנים בו, ובמחשב אחר הטקסט יוצג בגופן אחר.',
    promptTitle: 'לחצו להוספת כותרת',
    promptText: 'לחצו להוספת טקסט',
  },
  import: {
    working: 'קורא את המצגת…',
    title: 'המצגת יובאה',
    summaryOne: 'שקף אחד יובא מ-{{name}}.',
    summaryMany: '{{n}} שקפים יובאו מ-{{name}}.',
    failed: 'המצגת לא יובאה',
    protected:
      'הקובץ מוגן בסיסמה, או שהוא בפורמט הישן ‎.ppt. יש לשמור אותו ב-PowerPoint כ-‎.pptx בלי סיסמה, ולייבא שוב.',
    notPptx: 'הקובץ אינו מצגת PowerPoint ‎(.pptx).',
    broken: 'הקובץ פגום, ולא ניתן לקרוא ממנו את המצגת.',
    unreadable: 'הקובץ לא נקרא מהדיסק.',
  },
  slideOne: 'שקף {{slides}}',
  slideMany: 'שקפים {{slides}}',
  exported: {
    'html-picture':
      'אובייקטי HTML נכנסו לקובץ כתמונה שלהם: הם נראים אותו דבר, אבל לא ניתנים לעריכה שם.',
    'html-missing': 'אובייקט HTML לא צויר, והוא חסר בקובץ.',
    'element-picture': 'ציורים ותמונות עם מראה ש-PowerPoint אין לו נכנסו לקובץ כתמונה שלהם.',
    'asset-missing': 'הקובץ {{detail}} לא נקרא, והוא חסר בקובץ.',
    'image-placeholder': 'מקום לתמונה שעוד אין בו תמונה לא נכלל בקובץ.',
    'fill-approximated':
      'מילוי ש-PowerPoint אין לו (מעבר צבע מעגלי, פסים) צויר כמילוי הקרוב לו ביותר.',
    'slide-css': 'גיליון הסגנונות של השקף לא נכנס לקובץ.',
    blur: 'טשטוש של רקע או של אובייקט לא נשמר: אין לו מקבילה ב-PowerPoint.',
    'media-format': 'ייתכן ש-PowerPoint לא ינגן את {{detail}}: הפורמט שלו אינו נתמך שם.',
    'animation-approximated': 'האנימציה {{detail}} נכתבה כאנימציה הקרובה לה ביותר ב-PowerPoint.',
    'transition-approximated': 'המעבר {{detail}} נכתב כמעבר הקרוב לו ביותר ב-PowerPoint.',
    fonts: 'הטקסט כתוב בגופנים {{detail}}.',
  },
  imported: {
    'unsupported-object': 'אובייקט ש-Slidr לא מציג ({{detail}}) לא יובא.',
    'picture-format': 'תמונה בפורמט {{detail}}, ש-Slidr לא מציג, לא יובאה.',
    'linked-media': 'תמונה, וידאו או צליל שהקובץ מקשר אליהם במקום להכיל אותם לא יובאו.',
    'broken-part': 'חלק מהקובץ לא נקרא.',
    smartart: 'גרפיקת SmartArt יובאה כצורות שהיא מצוירת בהן.',
    'object-picture': 'משוואה או אובייקט מוטבע יובאו כתמונה שלהם.',
    'chart-approximated': 'תרשים ({{detail}}) מצויר כתרשים הקרוב לו ביותר ב-Slidr.',
    'vertical-text': 'טקסט אנכי יובא כתיבת טקסט מסובבת.',
    'shape-approximated': 'צורה ש-Slidr אין לו ({{detail}}) מצוירת כצורה הקרובה לה ביותר.',
    'animation-approximated': 'אנימציה ({{detail}}) יובאה כאנימציה הקרובה לה ביותר ב-Slidr.',
    'transition-approximated': 'מעבר ({{detail}}) יובא כמעבר הקרוב לו ביותר ב-Slidr.',
    fonts: 'גופנים שאינם במחשב הזה: {{detail}}. הטקסט שלהם יוצג בגופן אחר.',
  },
};

export const en: Messages<typeof he> = {
  filter: 'PowerPoint presentation',
  export: {
    title: 'Export to PowerPoint',
    description:
      'A .pptx file that opens in PowerPoint, Keynote and Google Slides, with every text, shape, table and chart in it editable.',
    working: 'Exporting the deck…',
    mediaOne: 'One media file inside the file, {{size}}',
    mediaMany: '{{n}} media files inside the file, {{size}}',
    noMedia: 'The file has no pictures or media.',
    fonts: 'Fonts',
    fontsBody:
      'The fonts are not inside the file: PowerPoint shows them only on a computer they are installed on, and elsewhere the text is shown in another font.',
    promptTitle: 'Click to add a title',
    promptText: 'Click to add text',
  },
  import: {
    working: 'Reading the presentation…',
    title: 'The presentation was imported',
    summaryOne: 'One slide was imported from {{name}}.',
    summaryMany: '{{n}} slides were imported from {{name}}.',
    failed: 'The presentation was not imported',
    protected:
      'The file is protected with a password, or is in the old .ppt format. Save it in PowerPoint as a .pptx without a password, and import it again.',
    notPptx: 'The file is not a PowerPoint presentation (.pptx).',
    broken: 'The file is damaged, and the presentation could not be read from it.',
    unreadable: 'The file could not be read from the disk.',
  },
  slideOne: 'slide {{slides}}',
  slideMany: 'slides {{slides}}',
  exported: {
    'html-picture':
      'HTML objects went into the file as pictures of themselves: they look the same, but are not editable there.',
    'html-missing': 'An HTML object could not be drawn, and is missing from the file.',
    'element-picture':
      'Drawings and pictures with a look PowerPoint has no setting for went into the file as pictures of themselves.',
    'asset-missing': 'The file {{detail}} could not be read, and is missing from the file.',
    'image-placeholder': 'An image placeholder that has no picture yet was left out.',
    'fill-approximated':
      'A fill PowerPoint has no kind for (a conic gradient, stripes) was drawn as the nearest one.',
    'slide-css': 'The slide’s own stylesheet does not go into the file.',
    blur: 'The blur of a background or of an object is not kept: PowerPoint has none.',
    'media-format': 'PowerPoint may not play {{detail}}: its format is not one it supports.',
    'animation-approximated':
      'The animation {{detail}} was written as the nearest animation PowerPoint has.',
    'transition-approximated':
      'The transition {{detail}} was written as the nearest transition PowerPoint has.',
    fonts: 'The text is set in {{detail}}.',
  },
  imported: {
    'unsupported-object': 'An object Slidr cannot show ({{detail}}) was not imported.',
    'picture-format':
      'A picture in the {{detail}} format, which Slidr cannot show, was not imported.',
    'linked-media':
      'A picture, video or sound that the file links to instead of holding was not imported.',
    'broken-part': 'Part of the file could not be read.',
    smartart: 'A SmartArt graphic came in as the shapes it is drawn with.',
    'object-picture': 'An equation or an embedded object came in as its picture.',
    'chart-approximated': 'A chart ({{detail}}) is drawn as the nearest chart Slidr has.',
    'vertical-text': 'Vertical text came in as a turned text box.',
    'shape-approximated': 'A shape Slidr does not have ({{detail}}) is drawn as the nearest one.',
    'animation-approximated': 'An animation ({{detail}}) came in as the nearest one Slidr has.',
    'transition-approximated': 'A transition ({{detail}}) came in as the nearest one Slidr has.',
    fonts: 'Fonts this computer does not have: {{detail}}. Their text is shown in another font.',
  },
};
