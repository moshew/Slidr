import { createSlide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  designTagsOf,
  localName,
  managedSize,
  mergeCatalogs,
  type DesignCatalog,
  type ManagedDesignCatalog,
} from './designCatalog';

/** A design's slides in both languages; the merge never looks inside them. */
const slide = (name: string) => ({
  he: createSlide({ name: `${name}-he` }),
  en: createSlide({ name: `${name}-en` }),
});
const slides = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, slide(id)]));

const authored: Partial<DesignCatalog> = {
  groups: ['events', 'business'],
  groupIds: { events: ['wedding', 'concert', 'gone'], business: ['webinar'] },
  slides: slides('wedding', 'concert', 'webinar'),
  subjects: { wedding: [1500, 600] },
};

const managed: Partial<ManagedDesignCatalog> = {
  version: 1,
  groups: ['invitations', 'events', 'empty'],
  groupNames: { invitations: { he: 'הזמנות', en: 'Invitations' } },
  groupIds: {
    invitations: ['m-garden-wedding', 'm-garden-wedding', 'm-no-slide'],
    events: ['m-street-party', 'wedding'],
    empty: ['m-no-slide'],
  },
  slides: { ...slides('m-garden-wedding', 'm-street-party'), wedding: slide('managed-wedding') },
  subjects: {
    'm-garden-wedding': [1480, 520],
    wedding: [1, 1],
    // A point that is not two numbers, as a broken file could hold.
    'm-street-party': [1, 'x'] as unknown as [number, number],
  },
  names: {
    'm-garden-wedding': { he: 'חתונה בגן', en: 'Garden wedding' },
    wedding: { he: 'אחרת', en: 'Another' },
  },
  sizes: { 'm-garden-wedding': [1536, 1024], 'm-garden-wedding-bg': [1920, 1080] },
};

const order = (catalog: DesignCatalog) =>
  catalog.groups.flatMap((group) => catalog.groupIds[group]);

describe('the catalog of designs', () => {
  it('is empty without either file', () => {
    const merged = mergeCatalogs(undefined, undefined);
    expect(merged.groups).toEqual([]);
    expect(merged.groupIds).toEqual({});
    expect(merged.managed.size).toBe(0);
  });

  it('is the authored catalog as it was, without a managed one', () => {
    const merged = mergeCatalogs(authored, undefined);
    expect(merged.groups).toEqual(['events', 'business']);
    // A design without a slide is not listed.
    expect(order(merged)).toEqual(['wedding', 'concert', 'webinar']);
    expect(merged.subjects).toEqual({ wedding: [1500, 600] });
    expect(merged.managed.size).toBe(0);
  });

  it('puts the managed designs after the authored ones', () => {
    const merged = mergeCatalogs(authored, managed);
    // A group the authored catalog has takes them after its own; a new one comes last.
    expect(merged.groups).toEqual(['events', 'business', 'invitations']);
    expect(merged.groupIds.events).toEqual(['wedding', 'concert', 'm-street-party']);
    expect(merged.groupIds.invitations).toEqual(['m-garden-wedding']);
    expect(order(merged)).toEqual([
      'wedding',
      'concert',
      'm-street-party',
      'webinar',
      'm-garden-wedding',
    ]);
    expect([...merged.managed].sort()).toEqual(['m-garden-wedding', 'm-street-party']);
    expect(merged.slides['m-garden-wedding']?.en.name).toBe('m-garden-wedding-en');
  });

  it('keeps the authored design where both catalogs have an id', () => {
    const merged = mergeCatalogs(authored, managed);
    expect(merged.slides.wedding?.he.name).toBe('wedding-he');
    expect(merged.groupIds.events!.filter((id) => id === 'wedding')).toHaveLength(1);
    expect(merged.managed.has('wedding')).toBe(false);
    expect(merged.subjects.wedding).toEqual([1500, 600]);
    expect(merged.names.has('wedding')).toBe(false);
  });

  it('lists a managed design once, only with a slide, and a new group only with a design', () => {
    const merged = mergeCatalogs(authored, managed);
    expect(order(merged).filter((id) => id === 'm-garden-wedding')).toHaveLength(1);
    expect(merged.slides['m-no-slide']).toBeUndefined();
    expect(merged.groups).not.toContain('empty');
  });

  it('takes the subjects and the names of the managed designs it keeps', () => {
    const merged = mergeCatalogs(authored, managed);
    expect(merged.subjects['m-garden-wedding']).toEqual([1480, 520]);
    // A point that is not two numbers is left out.
    expect(merged.subjects['m-street-party']).toBeUndefined();
    expect(localName(merged.names.get('m-garden-wedding'), 'he')).toBe('חתונה בגן');
    expect(localName(merged.names.get('m-garden-wedding'), 'en-US')).toBe('Garden wedding');
    expect(localName(merged.names.get('m-street-party'), 'en')).toBeUndefined();
    expect(localName(merged.groupNames.get('invitations'), 'he-IL')).toBe('הזמנות');
  });

  it('survives a managed file that is not what it should be', () => {
    const broken = {
      groups: 'invitations',
      groupIds: { invitations: 'm-a' },
      slides: null,
      names: [],
      groupNames: 7,
    } as unknown as Partial<ManagedDesignCatalog>;
    const merged = mergeCatalogs(authored, broken);
    expect(merged.groups).toEqual(['events', 'business']);
    expect(merged.managed.size).toBe(0);
    expect(merged.groupNames.size).toBe(0);
    // An id that is a name of Object's own is not taken for a design.
    const sneaky = mergeCatalogs(undefined, {
      groups: ['x'],
      groupIds: { x: ['constructor', 'toString'] },
      slides: {},
    });
    expect(sneaky.groups).toEqual([]);
  });

  it('takes the tags of the managed designs it keeps, with the library’s', () => {
    const tagged = mergeCatalogs(authored, {
      ...managed,
      tags: {
        'm-garden-wedding': { he: ['חתונה', 7], en: ['wedding'] },
        // The authored design of this id is kept, without the managed one's tags.
        wedding: { he: ['אחר'], en: ['other'] },
      } as unknown as ManagedDesignCatalog['tags'],
    });
    expect(tagged.tags.get('m-garden-wedding')).toEqual({ he: ['חתונה'], en: ['wedding'] });
    expect(tagged.tags.has('wedding')).toBe(false);
    expect(mergeCatalogs(authored, managed).tags.size).toBe(0);
    const all = designTagsOf(
      {
        'm-garden-wedding': { he: ['גן'], en: ['garden', 'wedding'], fr: ['mariage'] },
        concert: { en: ['music'] },
      },
      tagged.tags,
    );
    expect(all['m-garden-wedding']).toEqual({
      he: ['חתונה', 'גן'],
      en: ['wedding', 'garden'],
      fr: ['mariage'],
    });
    expect(all.concert).toEqual({ en: ['music'] });
  });

  it('knows the sizes of the managed pictures', () => {
    expect(managedSize(managed, 'm-garden-wedding')).toEqual([1536, 1024]);
    expect(managedSize(managed, 'm-garden-wedding-bg')).toEqual([1920, 1080]);
    expect(managedSize(managed, 'm-street-party')).toBeUndefined();
    expect(managedSize(managed, 'constructor')).toBeUndefined();
    expect(managedSize(undefined, 'm-garden-wedding')).toBeUndefined();
  });
});
