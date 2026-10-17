/**
 * The cover of a template card: the opening slide of the template's own sample, as written, and
 * not its name set on a layout. A built-in template's sample is read on demand, so the cover is
 * undefined until it is there (the card draws its frame meanwhile).
 */
import type { AssetMeta, Deck, Slide } from '@slidr/model';
import { useEffect, useState } from 'react';
import type { LibraryEntry } from './library';
import { madePreview, readyPreview, type TemplatePreview } from './previews';

export interface Opening {
  deck: Deck;
  slide: Slide;
  resolveAsset: (asset: AssetMeta) => string | undefined;
}

const openingOf = (preview: TemplatePreview | undefined): Opening | undefined => {
  const slide = preview?.deck.slides[0];
  return preview && slide
    ? { deck: preview.deck, slide, resolveAsset: preview.resolveAsset }
    : undefined;
};

/** The opening slide of a template in the language and direction of `like`; undefined until read. */
export function useOpening(entry: LibraryEntry, like: Deck): Opening | undefined {
  const [opening, setOpening] = useState(() => openingOf(madePreview(entry, like)));
  useEffect(() => {
    let current = true;
    const known = openingOf(madePreview(entry, like));
    if (known) setOpening(known);
    else
      void readyPreview(entry, like).then((preview) => {
        if (current) setOpening(openingOf(preview));
      });
    return () => {
      current = false;
    };
  }, [entry, like]);
  return opening;
}
