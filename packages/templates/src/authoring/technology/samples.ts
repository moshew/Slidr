import { CONTENT_LANGUAGES, type Localized, type RichText } from '@slidr/model';
import { points, text, token, type SampleSlide } from '../../builtin/kit';
import { TECHNOLOGY_COPY, type Technology, type TechnologyCopy, type TranslationLanguage } from './copy';

const rich = (value: unknown): value is RichText =>
  typeof value === 'object' && value !== null && 'paragraphs' in value;

/** Replaces words inside the existing sample, keeping its assets, data and rich-text styling. */
function translated(base: SampleSlide[], copy: TechnologyCopy, id: Technology, lang: TranslationLanguage): SampleSlide[] {
  const slides = structuredClone(base);
  const find = (kind: string) => slides.find((s) => s.layout === `l_${id}_${kind}`)!;
  const put = (kind: string, name: string, content: SampleSlide['content']) => {
    const slide = find(kind);
    slide.name = name;
    slide.content = { ...slide.content, ...content };
  };
  const many = (values: readonly string[]) => values.map((value) => text(value));
  // A footer is the same run everywhere, so replace it before filling the individual slides.
  for (const slide of slides) if (slide.content.footer) slide.content.footer = text(copy.footer);
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(id === 'anan' ? '2027-01-14' : id === 'shvav' ? '2027-03-14' : '2026-12-08'),
  );
  put('hero', copy.hero.slice(0, 2).join(' '), {
    title: text(...copy.hero.slice(0, 2)), subtitle: text(copy.hero[2]),
    caption: many([copy.footer, date]),
  });
  put('section', copy.section[0], {
    caption: text(copy.section[0]), title: text(copy.section[0]), subtitle: text(copy.section[1]),
  });
  const oldBody = find('text').content.body;
  const leadStyle = rich(oldBody) ? oldBody.paragraphs[0] : undefined;
  put('text', copy.agenda.title, {
    title: text(copy.agenda.title),
    body: {
      paragraphs: [
        // Two authored lines, including in scripts whose words can break at any character.
        { ...leadStyle, runs: [{ text: copy.agenda.lead.join('\n') }] },
        ...points(copy.agenda.points, { kind: 'number', mark: token('primary'), gap: 22 }).paragraphs,
      ],
    },
  });
  put('big_number', copy.figures.title, {
    title: text(copy.figures.title), subtitle: text(copy.figures.subtitle),
    caption: many([copy.figures.title, ...copy.figures.labels]), body: text(copy.figures.body),
  });
  put('cards', copy.features.title, {
    title: text(copy.features.title), caption: many([copy.features.title, ...copy.features.heads]),
    subtitle: many(copy.features.heads), body: many([...copy.features.bodies, copy.figures.body]),
  });
  put('text_image', copy.features.title, {
    title: text(copy.features.title), caption: text(copy.features.title),
    subtitle: many(copy.features.heads), body: many(copy.features.bodies),
  });
  put('timeline', copy.timeline.title, {
    title: text(copy.timeline.title), caption: many([copy.timeline.title, copy.section[1]]),
    subtitle: many(copy.timeline.heads), body: many(copy.timeline.bodies),
  });
  const duration = lang === 'ar' ? ['١ د', '٣ د', '١ د', '١٠ د', '٧ أيام'] :
    [1, 3, 1, 10, 7].map((n, i) => new Intl.NumberFormat(lang, { style: 'unit', unit: i === 4 ? 'day' : 'minute', unitDisplay: 'short' }).format(n));
  put('process', copy.process.title, {
    title: text(copy.process.title), subtitle: many(copy.process.steps),
    caption: many([copy.process.title, ...copy.process.steps]),
    body: text(copy.figures.body), ...(id === 'mutzar' ? { number: many(duration) } : {}),
  });
  const before = find('comparison').content.body;
  const bullets = (values: readonly string[], index: number): RichText => {
    const style = Array.isArray(before) && rich(before[index]) ? before[index].paragraphs[0] : undefined;
    return { paragraphs: values.map((value) => ({ ...style, runs: [{ text: value }] })) };
  };
  put('comparison', copy.comparison.title, {
    title: text(copy.comparison.title),
    caption: many([copy.comparison.title, copy.comparison.before, copy.comparison.after]),
    subtitle: many([copy.comparison.before, copy.comparison.after]),
    body: [bullets(copy.comparison.old, 0), bullets(copy.comparison.next, 1)],
  });
  put('chart', copy.chart.title, {
    title: text(copy.chart.title), caption: many([copy.chart.title, copy.chart.note]),
    body: many(copy.chart.body),
  });
  const chart = find('chart').chart!;
  chart.title = copy.chart.title;
  chart.data.series[0]!.name = copy.chart.series;
  if (id !== 'shvav') chart.data.categories = chart.data.categories.map((_, i) =>
    new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, (id === 'anan' ? 6 : 5) + i, 1))),
  );
  put('table', copy.table.title, { title: text(copy.table.title), caption: many([copy.table.title, copy.table.note]) });
  const table = find('table').table!;
  table.rows[0] = copy.table.headers;
  if (id === 'anan') {
    table.rows.slice(1).forEach((row, i) => { row[1] = copy.table.labels[i]!; });
    table.rows[4]![0] = copy.table.labels[4]!;
  } else if (id === 'shvav') {
    table.rows.slice(1).forEach((row, i) => { row[1] = copy.table.labels[i]!; });
  } else {
    table.rows.slice(1).forEach((row, i) => { row[0] = copy.table.labels[i]!; });
    // Product tier names are trademarks; the descriptions in the cells are translated.
    for (const row of table.rows) for (let i = 1; i < row.length; i++) {
      if (row[i] === 'Unlimited') row[i] = copy.table.labels[6]!;
      if (row[i] === 'Basic') row[i] = copy.table.labels[7]!;
      if (row[i] === 'Full') row[i] = copy.table.labels[8]!;
      if (row[i] === 'Free') row[i] = copy.table.labels[5]!;
    }
  }
  put('full_image', copy.photo.slice(0, 2).join(' '), {
    title: text(...copy.photo.slice(0, 2)), caption: text(copy.features.title), body: text(copy.photo[2]),
  });
  put('quote', copy.quote[1], { quote: text(copy.quote[0]), caption: text(copy.quote[1]) });
  put('team', copy.team.title, {
    title: text(copy.team.title), caption: many([copy.team.title, ...copy.team.roles]),
    body: many(copy.team.roles),
  });
  put('closing', copy.closing.title.join(' '), {
    title: text(...copy.closing.title), body: many(copy.closing.lines),
    caption: [text(copy.closing.title.join(' ')), find('closing').content.caption instanceof Array ? find('closing').content.caption[1]! : text(copy.footer)],
  });
  // Devanagari vowel signs need space above and below the letters, including display type.
  if (lang === 'hi') for (const slide of slides) for (const role of ['title', 'subtitle', 'quote'] as const) {
    const fill = slide.content[role];
    if (rich(fill)) for (const paragraph of fill.paragraphs) paragraph.lineHeight = role === 'subtitle' ? 1.42 : 1.2;
  }
  return slides;
}

/** All sixteen are explicit authored variants; a missing language cannot silently become English. */
export function technologySamples(id: Technology, he: SampleSlide[], en: SampleSlide[]): Localized<SampleSlide[]> {
  return Object.fromEntries(CONTENT_LANGUAGES.map((lang) => [lang,
    lang === 'he' ? he : lang === 'en' ? en : translated(en, TECHNOLOGY_COPY[lang][id], id, lang),
  ])) as Record<(typeof CONTENT_LANGUAGES)[number], SampleSlide[]>;
}
