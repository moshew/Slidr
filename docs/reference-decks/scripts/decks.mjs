// Reading and writing the reference deck files. A deck is one HTML file whose <head> holds four
// <style data-part="…"> blocks and whose <body> holds one <section class="slide"> per slide, each
// inside a <div class="frame"> that belongs to the page, not to the slide.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The deck files, in the order the index shows them. */
export function deckFiles() {
  const order = ['zerem', 'shvil', 'tzuk'];
  return readdirSync(root)
    .filter((file) => file.endsWith('.html') && file !== 'index.html')
    .sort((a, b) => {
      const rank = (file) => order.indexOf(file.split('.')[0]) * 2 + (file.includes('.en.') ? 1 : 0);
      return rank(a) - rank(b);
    });
}

function part(html, name) {
  const match = new RegExp(`<style data-part="${name}">([\\s\\S]*?)</style>`).exec(html);
  if (!match) throw new Error(`the deck has no <style data-part="${name}">`);
  return match[1];
}

/** A deck file taken apart. */
export function readDeck(file) {
  const html = readFileSync(join(root, file), 'utf8');
  const open = /<html lang="([^"]+)" dir="(rtl|ltr)">/.exec(html);
  if (!open) throw new Error(`${file}: <html> needs lang and dir`);
  const slides = [];
  const pattern = /<section class="slide"([^>]*)>([\s\S]*?)\n<\/section>/g;
  for (const match of html.matchAll(pattern)) {
    slides.push({
      id: /\bid="([^"]+)"/.exec(match[1])?.[1],
      archetype: /data-archetype="([^"]+)"/.exec(match[1])?.[1],
      title: /data-title="([^"]+)"/.exec(match[1])?.[1],
      html: match[0],
    });
  }
  return {
    file,
    id: file.replace(/\.html$/, ''),
    template: file.split('.')[0],
    lang: open[1],
    dir: open[2],
    title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? file,
    theme: part(html, 'theme'),
    deck: part(html, 'deck'),
    slides,
    html,
  };
}

/** Replaces the content of one <style data-part> block of a deck file. */
export function writePart(file, name, css) {
  const path = join(root, file);
  const html = readFileSync(path, 'utf8');
  const next = html.replace(
    new RegExp(`(<style data-part="${name}">)[\\s\\S]*?(</style>)`),
    (_, open, close) => `${open}\n${css}\n${close}`,
  );
  if (next !== html) writeFileSync(path, next);
  return next !== html;
}

/**
 * Writes the id of every picture into the element that shows it: `data-asset` is the sha256 of
 * the file, which is how a deck names an asset (SPEC 5.7). A browser shows the file through
 * `src` or `background-image`; the conversion engine takes the asset by its id.
 */
export function writeAssetIds(file) {
  const path = join(root, file);
  const html = readFileSync(path, 'utf8');
  const next = html.replace(/<[a-z]+\b[^>]*\bdata-asset="[^"]*"[^>]*>/g, (tag) => {
    const picture = /images\/([\w-]+\.webp)/.exec(tag)?.[1];
    if (!picture) throw new Error(`${file}: an element with data-asset names no picture`);
    const id = createHash('sha256').update(readFileSync(join(root, 'images', picture))).digest('hex');
    return tag.replace(/data-asset="[^"]*"/, `data-asset="${id}"`);
  });
  if (next !== html) writeFileSync(path, next);
  return next !== html;
}
