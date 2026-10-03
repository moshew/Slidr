// Runs inside the import window's page (the dev server serves this file): the deck a probe
// converts for, holding the fonts the loaded file carries as font assets, the way a real
// capture registers them before it converts.
const PACKAGES = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';

const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, '$2');

export async function deckWithFonts(doc, host) {
  const { createDeck } = await import(`${PACKAGES}/model/src/index.ts`);
  const deck = createDeck({ lang: 'en' });
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules;
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule.constructor.name !== 'CSSFontFaceRule') continue;
      const source = rule.style.getPropertyValue('src');
      const url = /url\(\s*(["']?)((?:data|blob):[^"')]+)\1\s*\)/.exec(source)?.[2];
      if (!url) continue;
      const family = unquote(rule.style.getPropertyValue('font-family'));
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const asset = await host.storeAsset(bytes, { mime: 'font/woff2', name: family });
      const range = rule.style.getPropertyValue('unicode-range').trim();
      deck.assets[asset.id] = {
        ...asset,
        font: {
          family,
          weight: rule.style.getPropertyValue('font-weight').trim() || 'normal',
          style: rule.style.getPropertyValue('font-style').trim() || 'normal',
          ...(range ? { unicodeRange: range } : {}),
        },
      };
    }
  }
  return deck;
}
