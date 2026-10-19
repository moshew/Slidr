import type { ContentLanguage } from '@slidr/model';
import { ar } from './ar';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { id } from './id';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { ptBR } from './pt-BR';
import { ru } from './ru';
import { tr } from './tr';
import { vi } from './vi';
import { zhCN } from './zh-CN';

export type Technology = 'anan' | 'shvav' | 'mutzar';
export type TranslationLanguage = Exclude<ContentLanguage, 'he' | 'en'>;
type Three = [string, string, string];
type Four = [string, string, string, string];

/** Written for the same three sample stories; identifiers, measurements and pictures stay put. */
export interface TechnologyCopy {
  footer: string;
  hero: Three;
  section: [title: string, subtitle: string];
  agenda: { title: string; lead: [string, string]; points: [string, string][] };
  figures: { title: string; subtitle: string; labels: Three; body: string };
  features: { title: string; heads: Three; bodies: Three };
  timeline: { title: string; heads: Four; bodies: Four };
  process: { title: string; steps: [string, string, string, string, string] };
  comparison: { title: string; before: string; after: string; old: Three; next: Three };
  chart: { title: string; note: string; series: string; body: [string, string] };
  table: { title: string; note: string; headers: string[]; labels: string[] };
  photo: Three;
  quote: [text: string, role: string];
  team: { title: string; roles: Four };
  closing: { title: [string, string]; lines: Three };
}

export type TechnologyCopies = Record<Technology, TechnologyCopy>;

export const TECHNOLOGY_COPY = {
  ar, de, es, fr, it, 'pt-BR': ptBR, ru, tr, vi, id, hi, ja, ko, 'zh-CN': zhCN,
} satisfies Record<TranslationLanguage, TechnologyCopies>;
