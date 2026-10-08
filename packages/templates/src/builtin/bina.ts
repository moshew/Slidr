import type { Color, Element, Frame, Layout, PlaceholderRole, Theme } from '@slidr/model';
import { copyJson } from '../json';
import type { Template } from '../template';
import { ganSamples, ganTemplate } from './gan';
import { assetTable, drawing, sampleSlides, text, token, type SampleSlide } from './kit';
import { pictures } from './pictures.generated';

/**
 * Bina: a light, illustrated introduction to AI. The reference uses violet display type,
 * lilac and cyan characters, thin neural doodles and generous cream space. Gan supplies the
 * sixteen editable role layouts; the palette, artwork and example story are Bina's own.
 */
export const binaTheme: Theme = {
  id: 'bina',
  name: 'Bina',
  colors: {
    bg: '#faf9f6',
    surface: '#ffffff',
    text: '#30283e',
    muted: '#5d526a',
    primary: '#6941aa',
    secondary: '#65bfe8',
    accent: '#eadffc',
    chart: ['#6941aa', '#65bfe8', '#a77de0', '#3e87ae', '#9f8cb7', '#30283e'],
  },
  fonts: {
    heading: { he: 'Rubik', latin: 'Rubik' },
    body: { he: 'Varela Round', latin: 'Varela Round' },
  },
  textStyles: {
    display: { font: 'heading', size: 116, weight: 800, lineHeight: 1.05, color: token('primary') },
    title: { font: 'heading', size: 66, weight: 800, lineHeight: 1.14, color: token('primary') },
    heading: { font: 'heading', size: 42, weight: 700, lineHeight: 1.2, color: token('primary') },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: token('text') },
    caption: { font: 'body', size: 24, weight: 400, lineHeight: 1.4, color: token('muted') },
  },
  radius: 36,
  shadow: { x: 0, y: 12, blur: 28, color: { value: '#6941aa', alpha: 0.1 } },
  background: { fill: { kind: 'solid', color: token('bg') } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: token('surface') } },
    { fill: { kind: 'solid', color: token('accent') } },
  ],
};

const VIOLET = '#6941aa';
const LILAC = '#eadffc';
const CYAN = '#65bfe8';
const INK = '#30283e';
const WHITE = '#ffffff';
const PAINT: Record<string, Color> = {
  [VIOLET]: token('primary'),
  [LILAC]: token('accent'),
  [CYAN]: token('secondary'),
  [INK]: token('text'),
  [WHITE]: token('surface'),
};

const svg = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none">${body}</svg>`;

/** A small robot mark, replaceable by the deck's logo. */
const MARK = svg(
  48,
  48,
  `<rect x="5" y="14" width="38" height="30" rx="12" fill="${VIOLET}"/>` +
    `<path d="M24 14V7m-5 0h10" stroke="${VIOLET}" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="17" cy="27" r="3" fill="${CYAN}"/><circle cx="31" cy="27" r="3" fill="${CYAN}"/>` +
    `<path d="M18 35q6 5 12 0" stroke="${WHITE}" stroke-width="2.5" stroke-linecap="round"/>`,
);

const robotMark = (id: string, frame: Frame): Element =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** The cover's flat head silhouette and circuit brain occupy the reference's picture side. */
const HEAD = svg(
  760,
  1080,
  `<circle cx="345" cy="416" r="294" fill="${LILAC}"/>` +
    `<path d="M350 205c-160 0-278 112-278 267 0 95 49 154 96 199l-14 177h354l-22-190c57-50 90-118 90-192 0-148-88-261-226-261Z" fill="${VIOLET}"/>` +
    `<path d="M430 653h174l-59 66H423Z" fill="${VIOLET}"/>` +
    `<circle cx="322" cy="420" r="177" fill="${CYAN}"/>` +
    `<path d="M320 270c-45-29-99-1-105 44-51-5-73 46-51 79-32 29-17 83 24 92-1 49 56 74 94 45 29 33 84 27 103-11 46 8 81-35 65-75 36-30 23-81-17-92-2-47-53-72-90-47-6-13-14-25-23-35Z" fill="${LILAC}" stroke="${WHITE}" stroke-width="8"/>` +
    `<path d="M283 297v48m-72 22 40 24m-58 48 61-2m77-132-12 70m71-33-42 33m77 54-65-5m-90 69 42-43m41 41 7-58" stroke="${VIOLET}" stroke-width="7" stroke-linecap="round"/>` +
    `<g fill="${WHITE}"><circle cx="283" cy="345" r="12"/><circle cx="250" cy="392" r="12"/><circle cx="255" cy="437" r="12"/><circle cx="319" cy="376" r="12"/><circle cx="349" cy="376" r="12"/><circle cx="360" cy="423" r="12"/><circle cx="311" cy="449" r="12"/></g>` +
    `<ellipse cx="345" cy="868" rx="230" ry="26" fill="${LILAC}"/>` +
    `<path d="M84 183q35-59 70 0m-16-41v84M624 264q31-53 60 0m-30-31v67" stroke="${CYAN}" stroke-width="8" stroke-linecap="round"/>` +
    `<circle cx="620" cy="538" r="22" fill="${CYAN}"/><circle cx="92" cy="592" r="16" fill="${LILAC}"/>`,
);

const BRAIN = svg(
  760,
  1080,
  `<circle cx="346" cy="500" r="282" fill="${LILAC}"/>` +
    `<path d="M190 590c-79-51-77-173 7-204 1-96 110-141 176-86 67-67 183-17 180 78 97 40 93 177 2 214-13 103-155 136-207 44-61 77-179 37-158-46Z" fill="${VIOLET}"/>` +
    `<path d="M345 315v326m-60-275c-45-36-89 16-66 54m-4 59c-31 13-24 63 11 76m55 15c-1 44 49 57 67 28m49-242c37-37 84 1 77 39m36 68c35 11 36 61 7 77m-115 39c-1 39-49 61-71 20" stroke="${WHITE}" stroke-width="10" stroke-linecap="round"/>` +
    `<g fill="${CYAN}"><circle cx="230" cy="389" r="16"/><circle cx="194" cy="484" r="15"/><circle cx="280" cy="577" r="17"/><circle cx="470" cy="384" r="17"/><circle cx="515" cy="494" r="16"/><circle cx="416" cy="571" r="17"/></g>` +
    `<path d="M93 782c55-44 111 45 163 0s100-44 150 0 100 45 154 0 86-42 119 0" stroke="${CYAN}" stroke-width="8" stroke-linecap="round"/>`,
);

const ROBOT = svg(
  520,
  1080,
  `<circle cx="240" cy="404" r="225" fill="${LILAC}"/>` +
    `<path d="M268 212v-68m-34 0h68" stroke="${VIOLET}" stroke-width="11" stroke-linecap="round"/>` +
    `<rect x="77" y="264" width="374" height="315" rx="85" fill="${VIOLET}"/>` +
    `<rect x="113" y="307" width="302" height="183" rx="49" fill="${WHITE}"/>` +
    `<circle cx="188" cy="389" r="31" fill="${CYAN}"/><circle cx="337" cy="389" r="31" fill="${CYAN}"/>` +
    `<path d="M216 448q48 32 96 0" stroke="${VIOLET}" stroke-width="9" stroke-linecap="round"/>` +
    `<rect x="132" y="579" width="265" height="257" rx="67" fill="${CYAN}"/>` +
    `<rect x="192" y="642" width="145" height="90" rx="20" fill="${WHITE}"/>` +
    `<path d="M134 626H64v143m332-143h68v143" stroke="${VIOLET}" stroke-width="28" stroke-linecap="round"/>` +
    `<path d="M188 835v91m151-91v91" stroke="${VIOLET}" stroke-width="28" stroke-linecap="round"/>` +
    `<circle cx="446" cy="168" r="16" fill="${CYAN}"/><circle cx="55" cy="207" r="11" fill="${VIOLET}"/>`,
);

/** Light loops and connected dots at the far top corner of content slides. */
const DOODLE = svg(
  400,
  280,
  `<path d="M-28 131c69-118 141 60 208-39S322 61 430 22M9 248c102-87 127 55 225-29s126-19 194-77" stroke="${CYAN}" stroke-width="4" stroke-linecap="round" opacity=".65"/>` +
    `<g fill="${LILAC}" stroke="${VIOLET}" stroke-width="3"><circle cx="96" cy="78" r="17"/><circle cx="205" cy="112" r="12"/><circle cx="294" cy="48" r="19"/><circle cx="338" cy="217" r="13"/></g>` +
    `<path d="M55 26v42m-21-21h42m270 76v34m-17-17h34" stroke="${CYAN}" stroke-width="4" stroke-linecap="round"/>`,
);

const CHIP = svg(
  80,
  80,
  `<rect x="15" y="15" width="50" height="50" rx="13" fill="${VIOLET}"/>` +
    `<rect x="27" y="27" width="26" height="26" rx="6" fill="${CYAN}"/>` +
    `<path d="M25 5v10m15-10v10m15-10v10M25 65v10m15-10v10m15-10v10M5 25h10M5 40h10M5 55h10m50-30h10m-10 15h10m-10 15h10" stroke="${VIOLET}" stroke-width="3" stroke-linecap="round"/>`,
);

function illustrated(layout: Layout): Layout {
  const next = copyJson(layout);
  next.id = next.id.replace('l_gan_', 'l_bina_');
  next.decorations = next.decorations.map((part) => {
    const id = part.id.replace('d_gan_', 'd_bina_');
    if (part.role === 'logo') return robotMark(id, part.frame);
    if (part.id === 'd_gan_hero_garden') return drawing(id, part.frame, HEAD, PAINT);
    if (part.id === 'd_gan_section_shapes') return drawing(id, part.frame, BRAIN, PAINT);
    if (part.id === 'd_gan_closing_shapes') return drawing(id, part.frame, ROBOT, PAINT);
    if (part.id.includes('_corner')) return drawing(id, part.frame, DOODLE, PAINT);
    if (part.id.includes('_badge')) return drawing(id, part.frame, CHIP, PAINT);
    return { ...part, id };
  });
  return next;
}

type Copy = {
  name: string;
  roles: Partial<Record<PlaceholderRole, string[]>>;
};

const he: Record<string, Copy> = {
  hero: {
    name: 'בינה מלאכותית סביבנו',
    roles: {
      caption: ['מבוא לבינה מלאכותית', 'מדריך חזותי · 2026'],
      title: ['בינה מלאכותית\nבחיי היום־יום'],
      subtitle: ['מכירים את הטכנולוגיה שכבר פוגשים בכל מקום'],
    },
  },
  section: {
    name: 'מהי בינה מלאכותית',
    roles: {
      number: ['01'],
      caption: ['הבסיס בקצרה'],
      title: ['מהי בינה?'],
      subtitle: ['מערכות שלומדות מדוגמאות ומסייעות לזהות, ליצור ולהחליט.'],
    },
  },
  big_number: {
    name: 'בינה בארבע פעולות',
    roles: {
      caption: ['איך זה עובד', 'קלט', 'למידה', 'תוצאה'],
      title: ['מרעיון לתוצאה'],
      number: ['01', '02', '03', '04'],
      subtitle: ['שואלים שאלה או מציגים מידע'],
      body: ['המערכת מזהה דפוסים בדוגמאות ומחזירה הצעה שאפשר לבדוק.'],
    },
  },
  quote: {
    name: 'מחשבה מרכזית',
    roles: {
      quote: [
        'בינה מלאכותית יכולה לעזור לנו לחשוב, ליצור ולגלות — כשאנחנו נשארים סקרנים ובודקים את התוצאה.',
      ],
      attribution: ['רעיון מרכזי'],
      caption: ['הטכנולוגיה היא כלי בתוך תהליך אנושי'],
    },
  },
  text_image: {
    name: 'בינה בכיס',
    roles: {
      caption: ['בינה בכיס'],
      title: ['הטלפון כבר משתמש בבינה'],
      subtitle: ['צילום חכם', 'תרגום קולי', 'מסלול מומלץ'],
      body: [
        'המצלמה מזהה סצנות ומשפרת תמונה.',
        'דיבור הופך לטקסט ולתרגום שימושי.',
        'אפליקציות מסדרות אפשרויות לפי ההקשר.',
      ],
    },
  },
  full_image: {
    name: 'בינה בעולם האמיתי',
    roles: {
      caption: ['בינה בפעולה'],
      title: ['רעיונות פוגשים\nאת העולם'],
      body: ['מאנשים ורובוטים ועד שירותים יומיומיים: היישומים משתנים, העיקרון דומה.'],
    },
  },
  cards: {
    name: 'בינה לאורך היום',
    roles: {
      caption: ['בינה לאורך היום', 'בוקר', 'צהריים', 'ערב'],
      title: ['פוגשים בינה בכל יום'],
      subtitle: ['למצוא מידע', 'לעבוד חכם', 'ליצור משהו חדש'],
      body: [
        'חיפוש חכם עוזר להגיע לתשובה רלוונטית.',
        'כלים מסייעים לסכם ולארגן משימות.',
        'תמונה, טקסט או מוזיקה מתחילים מרעיון.',
        'הבחירה והבדיקה נשארות בידיים שלנו.',
      ],
    },
  },
  timeline: {
    name: 'איך מערכת לומדת',
    roles: {
      caption: ['מסלול הלמידה', 'דוגמה להמחשה'],
      title: ['איך בינה לומדת?'],
      number: ['1', '2', '3', '4'],
      subtitle: ['אוספים', 'מתאמנים', 'בודקים', 'משפרים'],
      body: [
        'מכינים דוגמאות מתאימות.',
        'המודל מחפש קשרים ודפוסים.',
        'בודקים אותו על מקרים חדשים.',
        'מתקנים ומשפרים לפי התוצאות.',
      ],
    },
  },
  process: {
    name: 'מחמש מילים לרעיון',
    roles: {
      caption: ['מהרעיון לתוצאה', 'מגדירים מטרה', 'נותנים הקשר', 'מבקשים תוצר', 'בודקים', 'משפרים'],
      title: ['כך עובדים עם כלי בינה'],
      subtitle: ['מטרה', 'הקשר', 'בקשה', 'בדיקה', 'שיפור'],
      number: ['01', '02', '03', '04', '05'],
      body: ['שאלה טובה ובדיקה ביקורתית עוזרות להפיק תוצאה שימושית.'],
    },
  },
  comparison: {
    name: 'הזדמנויות ואתגרים',
    roles: {
      caption: ['מבט מאוזן', 'הזדמנויות', 'שאלות חשובות'],
      title: ['הזדמנויות ואתגרים'],
      subtitle: ['מה הבינה יכולה לעזור לעשות?', 'מה כדאי לבדוק בכל פעם?'],
      body: [
        'ללמוד מהר יותר, לחקור רעיונות ולפנות זמן למשימות משמעותיות.',
        'דיוק, פרטיות, הטיה ואחריות על ההחלטה הסופית.',
      ],
    },
  },
  chart: {
    name: 'דוגמה חזותית',
    roles: {
      caption: ['שימושים לדוגמה', 'נתונים להמחשה בלבד'],
      title: ['איפה הבינה פוגשת אותנו'],
      number: ['214', '+38%'],
      body: [
        'דוגמאות המחולקות ללימוד, יצירה, עבודה וניווט.',
        'שינוי לדוגמה לעומת תקופה קודמת; הנתונים להמחשה בלבד.',
      ],
    },
  },
  table: {
    name: 'מפת שימושים',
    roles: { caption: ['מפת שימושים', 'דוגמאות להמחשה בלבד'], title: ['בינה בתחומי החיים'] },
  },
  team: {
    name: 'האנשים שמאחורי הבינה',
    roles: {
      caption: ['עבודת צוות', 'מחקר', 'עיצוב', 'הנדסה', 'בדיקה'],
      title: ['מאחורי כל מערכת יש אנשים'],
      subtitle: ['חוקרת', 'מעצבת', 'מהנדס', 'בודקת'],
      body: [
        'מגדירה את השאלות ואת המדדים.',
        'דואגת שהכלי יהיה ברור ונגיש.',
        'בונה ומפתח את המערכת.',
        'מאתרת טעויות ומשפרת את האיכות.',
      ],
    },
  },
  closing: {
    name: 'תודה',
    roles: {
      caption: ['ממשיכים ללמוד', 'בינה · מבוא לבינה מלאכותית'],
      title: ['תודה!'],
      body: ['שאלו שאלות חדשות.', 'בדקו את התשובות.', 'צרו משהו משלכם.'],
    },
  },
};

const en: Record<string, Copy> = {
  hero: {
    name: 'AI in everyday life',
    roles: {
      caption: ['An introduction to AI', 'A visual guide · 2026'],
      title: ['AI Is Here\nEvery Day'],
      subtitle: ['Meet the technology already woven into daily life'],
    },
  },
  section: {
    name: 'Understanding AI',
    roles: {
      number: ['01'],
      caption: ['The basics'],
      title: ['What is AI?'],
      subtitle: ['Systems learn from examples to recognize, create and suggest.'],
    },
  },
  big_number: {
    name: 'Four simple steps',
    roles: {
      caption: ['How it works', 'Input', 'Learning', 'Output'],
      title: ['From idea to result'],
      number: ['01', '02', '03', '04'],
      subtitle: ['Start with a question or information'],
      body: ['The system finds patterns in examples and offers a result to check.'],
    },
  },
  quote: {
    name: 'One big idea',
    roles: {
      quote: [
        'AI can help us think, create and discover, as long as we stay curious and check the result.',
      ],
      attribution: ['A guiding idea'],
      caption: ['Technology belongs in a human process'],
    },
  },
  text_image: {
    name: 'AI in your pocket',
    roles: {
      caption: ['AI in your pocket'],
      title: ['Your phone already uses AI'],
      subtitle: ['Smarter photos', 'Voice translation', 'Helpful routes'],
      body: [
        'The camera recognizes scenes and improves images.',
        'Speech becomes useful text and translation.',
        'Apps sort options based on context.',
      ],
    },
  },
  full_image: {
    name: 'AI in the real world',
    roles: {
      caption: ['AI in action'],
      title: ['Ideas meet\nthe real world'],
      body: ['From people and robots to daily services: the uses vary, the principle is similar.'],
    },
  },
  cards: {
    name: 'AI through your day',
    roles: {
      caption: ['AI through your day', 'Morning', 'Afternoon', 'Evening'],
      title: ['AI appears every day'],
      subtitle: ['Find information', 'Work smarter', 'Create something new'],
      body: [
        'Smart search helps surface a relevant answer.',
        'Tools help summarize and organize tasks.',
        'An image, text or song begins with an idea.',
        'The choice and the check stay with us.',
      ],
    },
  },
  timeline: {
    name: 'How a system learns',
    roles: {
      caption: ['The learning path', 'Illustrative example'],
      title: ['How does AI learn?'],
      number: ['1', '2', '3', '4'],
      subtitle: ['Collect', 'Train', 'Test', 'Improve'],
      body: [
        'Prepare suitable examples.',
        'The model looks for patterns.',
        'Try it on new cases.',
        'Adjust it based on results.',
      ],
    },
  },
  process: {
    name: 'From prompt to result',
    roles: {
      caption: [
        'From idea to result',
        'Set a goal',
        'Add context',
        'Ask for an output',
        'Check it',
        'Refine it',
      ],
      title: ['Working with an AI tool'],
      subtitle: ['Goal', 'Context', 'Prompt', 'Check', 'Refine'],
      number: ['01', '02', '03', '04', '05'],
      body: ['A clear question and a critical review make the result more useful.'],
    },
  },
  comparison: {
    name: 'Opportunities and concerns',
    roles: {
      caption: ['A balanced view', 'Opportunities', 'Questions to ask'],
      title: ['Opportunities & concerns'],
      subtitle: ['What can AI help us do?', 'What should we check?'],
      body: [
        'Learn faster, explore ideas and spend more time on meaningful work.',
        'Accuracy, privacy, bias and responsibility for final decisions.',
      ],
    },
  },
  chart: {
    name: 'Illustrative chart',
    roles: {
      caption: ['Example uses', 'Illustrative data only'],
      title: ['Where we encounter AI'],
      number: ['214', '+38%'],
      body: [
        'Examples across learning, creating, working and navigation.',
        'Illustrative change from an earlier period; sample data only.',
      ],
    },
  },
  table: {
    name: 'Everyday examples',
    roles: {
      caption: ['Everyday examples', 'Illustrative examples only'],
      title: ['AI across daily life'],
    },
  },
  team: {
    name: 'The people behind AI',
    roles: {
      caption: ['Teamwork', 'Research', 'Design', 'Engineering', 'Testing'],
      title: ['People make the systems'],
      subtitle: ['Researcher', 'Designer', 'Engineer', 'Tester'],
      body: [
        'Defines questions and measures.',
        'Makes the tool clear and accessible.',
        'Builds and develops the system.',
        'Finds errors and improves quality.',
      ],
    },
  },
  closing: {
    name: 'Thank you',
    roles: {
      caption: ['Keep exploring', 'Bina · An introduction to AI'],
      title: ['Thank you!'],
      body: ['Ask a new question.', 'Check the answers.', 'Create something of your own.'],
    },
  },
};

function samples(lang: 'he' | 'en'): SampleSlide[] {
  const copy = lang === 'he' ? he : en;
  const seen = new Set<string>();
  return ganSamples[lang].flatMap((source) => {
    const archetype = source.layout.replace('l_gan_', '');
    // One example for each editable layout; Gan's second section is unnecessary here.
    if (seen.has(archetype)) return [];
    seen.add(archetype);
    const story = copy[archetype]!;
    const content = copyJson(source.content);
    for (const [role, current] of Object.entries(content)) {
      if (role === 'image') {
        content.image =
          archetype === 'team'
            ? [
                pictures.binaPerson1,
                pictures.binaPerson2,
                pictures.binaPerson3,
                pictures.binaPerson4,
              ].map((asset) => ({ assetId: asset.id }))
            : {
                assetId: (archetype === 'full_image' ? pictures.binaWorld : pictures.binaPhone).id,
              };
        continue;
      }
      if (role === 'footer') {
        content.footer = text(
          lang === 'he' ? 'בינה · מבוא לבינה מלאכותית' : 'Bina · An introduction to AI',
        );
        continue;
      }
      const lines = story.roles[role as PlaceholderRole];
      if (!lines) continue;
      content[role as PlaceholderRole] = Array.isArray(current)
        ? current.map((_, i) => text(...(lines[i] ?? lines.at(-1) ?? '').split('\n')))
        : text(...lines[0]!.split('\n'));
    }
    const sample: SampleSlide = {
      layout: source.layout.replace('l_gan_', 'l_bina_'),
      name: story.name,
      content,
    };
    if (source.chart) {
      sample.chart = {
        chartType: 'column',
        title: lang === 'he' ? 'תחומי שימוש · דוגמה להמחשה' : 'Use cases · illustrative example',
        data: {
          categories:
            lang === 'he'
              ? ['לימוד', 'יצירה', 'עבודה', 'ניווט']
              : ['Learning', 'Creating', 'Working', 'Navigation'],
          series: [{ name: lang === 'he' ? 'דוגמה' : 'Example', values: [42, 56, 53, 63] }],
        },
      };
    }
    if (source.table) {
      sample.table = {
        ...source.table,
        rows:
          lang === 'he'
            ? [
                ['תחום', 'פעולה', 'קלט', 'תוצאה', 'מה לבדוק'],
                ['לימוד', 'סיכום', 'טקסט', 'נקודות', 'דיוק'],
                ['יצירה', 'תמונה', 'תיאור', 'איור', 'זכויות'],
                ['ניווט', 'מסלול', 'יעד', 'הצעה', 'עדכניות'],
                ['צילום', 'שיפור', 'תמונה', 'עריכה', 'מקור'],
                ['שפה', 'תרגום', 'משפט', 'נוסח', 'הקשר'],
                ['עבודה', 'ארגון', 'מסמך', 'סיכום', 'פרטיות'],
                ['שירות', 'מענה', 'שאלה', 'תשובה', 'אחריות'],
              ]
            : [
                ['Area', 'Action', 'Input', 'Output', 'Check'],
                ['Learning', 'Summary', 'Text', 'Key points', 'Accuracy'],
                ['Creative', 'Image', 'Prompt', 'Artwork', 'Rights'],
                ['Navigation', 'Route', 'Destination', 'Option', 'Freshness'],
                ['Photos', 'Enhance', 'Image', 'Edit', 'Origin'],
                ['Language', 'Translate', 'Sentence', 'Version', 'Context'],
                ['Work', 'Organize', 'Document', 'Summary', 'Privacy'],
                ['Service', 'Answer', 'Question', 'Response', 'Ownership'],
              ],
      };
    }
    return [sample];
  });
}

export const binaSamples = { he: samples('he'), en: samples('en') };

export function binaTemplate(): Template {
  const original = ganTemplate();
  const template: Template = {
    theme: copyJson(binaTheme),
    description:
      'Illustrated AI primer on warm white: violet titles, lilac characters, cyan circuits and playful neural doodles.',
    dir: 'rtl',
    layouts: original.layouts.map(illustrated),
    flipped: original.flipped?.map(illustrated),
    assets: assetTable([
      pictures.binaPhone,
      pictures.binaWorld,
      pictures.binaPerson1,
      pictures.binaPerson2,
      pictures.binaPerson3,
      pictures.binaPerson4,
    ]),
  };
  template.sample = sampleSlides(template, binaSamples.he);
  return template;
}
