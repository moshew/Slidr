import { useMemo } from 'react';
import { useSystemFonts } from '../fonts';
import { useDeck } from '../shell';
import { fontWeights, type FaceWeight, type FamilyWeights } from './fontWeights';

/** The faces the page has registered, when there is a page. */
function registeredFaces(): FaceWeight[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  return Array.from(document.fonts, ({ family, weight }) => ({ family, weight }));
}

/**
 * The weights of a family, for a component: `fontWeights` over the page, the deck and the
 * computer. Null while the family is not known, and for no family (text in several fonts).
 */
export function useFontWeights(family: string | null): FamilyWeights | null {
  const assets = useDeck((s) => s.deck.assets);
  const installed = useSystemFonts();
  // Registering a font changes the number of faces the page has.
  const count = typeof document === 'undefined' ? 0 : (document.fonts?.size ?? 0);
  return useMemo(
    () =>
      family === null
        ? null
        : fontWeights(family, { registered: registeredFaces(), assets, installed }),
    // The faces are read again when their number changes, though the memo does not use it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [family, assets, installed, count],
  );
}
