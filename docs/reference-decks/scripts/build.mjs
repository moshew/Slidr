// Brings the generated parts of the reference decks up to date:
//   node docs/reference-decks/scripts/build.mjs [deck ...]
// 1. the embedded fonts of every deck file (<style data-part="fonts">), from its theme block;
// 2. the asset id of every picture (data-asset), from the picture file;
// 3. the asset records of the pictures, for the samples of the built-in templates;
// 4. index.html, the page that shows every slide of every deck (see index.mjs).
import { deckFiles, readDeck, writeAssetIds, writePart } from './decks.mjs';
import { fontFaces } from './fonts.mjs';
import { writeIndex } from './index.mjs';
import { writePictures } from './pictures.mjs';

const wanted = process.argv.slice(2);
for (const file of deckFiles()) {
  const deck = readDeck(file);
  if (wanted.length > 0 && !wanted.includes(deck.id)) continue;
  const fonts = writePart(file, 'fonts', fontFaces(deck.theme));
  const assets = writeAssetIds(file);
  console.log(
    `${file}: ${deck.slides.length} slides, fonts ${fonts ? 'written' : 'up to date'}, asset ids ${assets ? 'written' : 'up to date'}`,
  );
}
console.log(writePictures());
console.log(writeIndex());
