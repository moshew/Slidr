/**
 * The reference decks (`docs/reference-decks/*.html`) as the tests and the dev page read them:
 * the slides one by one, as the HTML an agent would hand to `slide_create_from_html`. The
 * pictures they use are in `./pictures`: `data-asset` names them by id.
 */

const files = import.meta.glob<string>('../../../../../Slidr-media/templates/reference-decks/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});
export interface ReferenceSlide {
  /** `s01`, `s02`, ... */
  id: string;
  archetype: string;
  /** What the slide shows, in a word or two. */
  title: string;
  /** The slide alone, with the stylesheet the deck's slides share. */
  html: string;
}

export interface ReferenceDeck {
  /** The file name without its extension: `zerem`, `tzuk.en`. */
  id: string;
  /** The template derived from the deck: the first part of the id. */
  template: string;
  lang: string;
  dir: 'rtl' | 'ltr';
  /** The theme block of the file: the CSS variables the template's theme must equal. */
  themeCss: string;
  slides: ReferenceSlide[];
}

function part(doc: Document, name: string): string {
  return doc.querySelector(`style[data-part="${name}"]`)?.textContent ?? '';
}

/** The reference decks, in the order of their file names. */
export function referenceDecks(): ReferenceDeck[] {
  return Object.entries(files)
    .filter(([path]) => !path.endsWith('/index.html'))
    .map(([path, source]) => {
      const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.html$/, '');
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const shared = part(doc, 'deck');
      return {
        id,
        template: id.split('.')[0]!,
        lang: doc.documentElement.lang,
        dir: doc.documentElement.dir === 'ltr' ? 'ltr' : 'rtl',
        themeCss: part(doc, 'theme'),
        slides: Array.from(doc.querySelectorAll('section.slide'), (section) => ({
          id: section.id,
          archetype: section.getAttribute('data-archetype') ?? 'blank',
          title: section.getAttribute('data-title') ?? section.id,
          html: `<style>${shared}</style>\n${section.outerHTML}`,
        })),
      };
    });
}
