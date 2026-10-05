// The app's one icon set (DSN-04): Lucide, through the design system so every area uses the same
// set. Draw them with <Icon icon={...} /> for the standard size and stroke.
import { createLucideIcon } from 'lucide-react';

export * from 'lucide-react';

/**
 * The letters "AI", for the app's AI chat (ADR-072). Lucide has no such icon, so it is drawn here
 * on Lucide's 24-pixel grid with its stroke: a rounded A, as Tabler's `ai` draws it, and an I.
 */
export const Ai = createLucideIcon('ai', [
  ['path', { d: 'M5 18v-8a4 4 0 0 1 8 0v8', key: 'a' }],
  ['path', { d: 'M5 13.5h8', key: 'bar' }],
  ['path', { d: 'M18 6v12', key: 'i' }],
]);
