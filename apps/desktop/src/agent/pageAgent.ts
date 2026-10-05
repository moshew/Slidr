/**
 * The agent of a plain browser page (the Vite page, Playwright), where there is no Rust: the
 * scripted mock harness, with the scripts the Rust mock is built with. Loaded only there, and
 * only in development: the app runs harnesses through IPC.
 */
import deckBuild from '../../src-tauri/src/harness/fixtures/scripts/deck-build.json';
import errors from '../../src-tauri/src/harness/fixtures/scripts/errors.json';
import gateStuck from '../../src-tauri/src/harness/fixtures/scripts/gate-stuck.json';
import imageAlternatives from '../../src-tauri/src/harness/fixtures/scripts/image-alternatives.json';
import outline from '../../src-tauri/src/harness/fixtures/scripts/outline.json';
import qualityGate from '../../src-tauri/src/harness/fixtures/scripts/quality-gate.json';
import slideChat from '../../src-tauri/src/harness/fixtures/scripts/slide-chat.json';
import slideRedesign from '../../src-tauri/src/harness/fixtures/scripts/slide-redesign.json';
import templateCreate from '../../src-tauri/src/harness/fixtures/scripts/template-create.json';
import textVariations from '../../src-tauri/src/harness/fixtures/scripts/text-variations.json';
// An import session on e2e/import-set/handwritten.html, for the import panel's suites. It is
// not one of the Rust mock's: its tool calls need the import page, which the mock does not drive.
import importHandwritten from '../../e2e/import-set/handwritten.script.json';
// The same import, cut after three slides and continued (IMP-09).
import importCut from '../../e2e/import-set/handwritten.cut.script.json';
// The actions of a chart and of a table (AIO-07, AIO-08), for the suites of the AI tools. Not the
// Rust mock's either: the page is where those suites run.
import chartActions from '../../e2e/aitools-scripts/chart-actions.script.json';
import tableActions from '../../e2e/aitools-scripts/table-actions.script.json';
import tableOnSlide from '../../e2e/aitools-scripts/table-on-slide.script.json';
import { createScriptedAgent, type Script, type ScriptedAgent } from './scriptedAgent';

/** The first is the default, as in the Rust mock's list. */
const SCRIPTS: Record<string, Script> = {
  'deck-build': deckBuild,
  'slide-chat': slideChat,
  errors,
  'quality-gate': qualityGate,
  'gate-stuck': gateStuck,
  'text-variations': textVariations,
  'slide-redesign': slideRedesign,
  'image-alternatives': imageAlternatives,
  'template-create': templateCreate,
  outline,
  'import-handwritten': importHandwritten,
  'import-cut': importCut,
  // A session that begins by continuing (the deck was opened again) plays the turns that go on.
  'import-rest': { description: importCut.description, turns: importCut.turns.slice(2) },
  'chart-actions': chartActions,
  'table-actions': tableActions,
  'table-on-slide': tableOnSlide,
};

export function pageAgent(speed: number): ScriptedAgent {
  return createScriptedAgent(SCRIPTS, { speed });
}
