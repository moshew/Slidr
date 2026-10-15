// The ready-made slides being authored here, in the shape of `elements/designs/managed.json`:
// every module of this folder that exports `designs`, and the sizes of their pictures.
import type { Slide } from '@slidr/model';
import type { DesignEntry } from './kit';

export interface DesignCatalog {
  slides: Record<string, { he: Slide; en: Slide }>;
  sizes: Record<string, number[]>;
  groupIds: Record<string, string[]>;
  subjects: Record<string, [number, number]>;
  names: Record<string, { he: string; en: string }>;
}

const modules = import.meta.glob<{ designs?: DesignEntry[] }>(
  ['./*.ts', '!./kit.ts', '!./registry.ts'],
  {
    eager: true,
  },
);
const sizes = import.meta.glob<number[]>('../pictures/designs/*.json', {
  eager: true,
  import: 'default',
});

export function newDesigns(): DesignCatalog {
  const catalog: DesignCatalog = { slides: {}, sizes: {}, groupIds: {}, subjects: {}, names: {} };
  for (const [path, size] of Object.entries(sizes)) {
    catalog.sizes[
      path
        .split('/')
        .pop()!
        .replace(/\.json$/, '')
    ] = size;
  }
  for (const module of Object.values(modules)) {
    for (const design of module.designs ?? []) {
      catalog.slides[design.id] = { he: design.he, en: design.en };
      (catalog.groupIds[design.group] ??= []).push(design.id);
      catalog.subjects[design.id] = design.subject;
      catalog.names[design.id] = design.name;
    }
  }
  return catalog;
}
