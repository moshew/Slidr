// The templates being authored here, for the review page and the catalog builder: every module
// of this folder that exports an `entry`.
import type { Template } from '../template';
import type { SampleSlide } from '../builtin/kit';

export interface Authored {
  id: string;
  template: () => Template;
  samples: { he: SampleSlide[]; en: SampleSlide[] };
}

const modules = import.meta.glob<{ entry?: Authored }>(
  ['./*.ts', '!./registry.ts', '!./pictures.ts', '!./legacyCatalog.ts', '!./catalog.ts'],
  { eager: true },
);

export const authored: Record<string, Authored> = Object.fromEntries(
  Object.values(modules).flatMap((m) => (m.entry ? [[m.entry.id, m.entry]] : [])),
);
