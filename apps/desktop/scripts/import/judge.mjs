// Development probe: runs the conversion engine step by step on an element of the file that is
// loaded in the import window, and prints what the fidelity guard says.
//   node scripts/import/judge.mjs "<selector>" ["<js to run first>"]
import { connect } from './cdp.mjs';

const [selector, before] = process.argv.slice(2);
const { browser, importPage } = await connect();
const page = importPage();
if (!page) throw new Error('the import window is not open');
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[import console]', m.text().slice(0, 300));
});
const ROOT = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';
const out = await page.evaluate(
  async ({ selector, before, ROOT }) => {
    const { startConversion } = await import(`${ROOT}/html-import/src/engine.ts`);
    const { createDeck } = await import(`${ROOT}/model/src/index.ts`);
    const { host } = window.__slidrImport;
    if (!document.querySelector('iframe[data-slidr-import]'))
      await window.__slidrImport.page.load();
    const frame = document.querySelector('iframe[data-slidr-import]');
    const doc = frame.contentDocument;
    if (before) await new frame.contentWindow.Function(`return (async () => {${before}})()`)();
    await new Promise((r) => setTimeout(r, 400));
    const root = doc.querySelector(selector);
    const conversion = await startConversion(root, {
      deck: createDeck({ lang: 'en' }),
      host,
      foreign: true,
      behind: 'page',
      fontFaces: false,
    });
    const name = (item) =>
      `${item.element.type}:${item.node.localName}${item.node.className ? '.' + String(item.node.className).split(' ')[0] : ''}${item.covers === 'box' ? '[box]' : ''}`;
    const rounds = [];
    const first = await conversion.judge();
    rounds.push({
      faithful: first.faithful,
      bad: first.bad.map((b) => `${name(b.item)} — ${b.why} — ${b.item.reason ?? ''}`),
      loose: first.loose,
      diff: first.diffPixels,
    });
    const items = conversion.proposal.items.map(
      (i) => `${name(i)}${i.reason ? ' (' + i.reason + ')' : ''}`,
    );
    const report = await conversion.guard();
    const result = conversion.result(report);
    conversion.dispose();
    return {
      items,
      background: conversion.proposal.background,
      rounds,
      report,
      editability: result.editability,
      notes: result.notes,
      final: result.slide.elements.map((e) => e.type),
    };
  },
  { selector, before, ROOT },
);
console.log(JSON.stringify(out, null, 1));
await browser.close();
