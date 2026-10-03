// The templates Slidr ships with (THM-01, WG7-T04). Each is derived from a reference deck under
// `docs/reference-decks/`: the deck set the design, the template is what of it a theme and
// fourteen layouts can carry.
import type { Theme } from '@slidr/model';
import { shvilTheme } from './shvil';
import { tzukTheme } from './tzuk';
import { zeremTheme } from './zerem';

/** The themes of the built-in templates, by template id. */
export const builtInThemes: Record<string, Theme> = {
  zerem: zeremTheme,
  shvil: shvilTheme,
  tzuk: tzukTheme,
};
