import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import '../../app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery, type Cell } from './Gallery';

// The component gallery (DSN-06), served by the dev server at /dev/gallery.html.
const params = new URLSearchParams(location.search);
const pick = <T extends string>(name: string, all: readonly T[]): T[] => {
  const value = params.get(name) as T | null;
  return value && all.includes(value) ? [value] : [...all];
};
const themes = pick('theme', ['light', 'dark'] as const);
const dirs = pick('dir', ['rtl', 'ltr'] as const);
const cells: Cell[] = dirs.flatMap((dir) => themes.map((theme) => ({ theme, dir })));

document.documentElement.dataset.theme = themes.length === 1 ? themes[0] : 'light';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from gallery.html');

createRoot(root).render(
  <StrictMode>
    <Gallery cells={cells} />
  </StrictMode>,
);
