/**
 * The agent of a plain browser page (the Vite page, Playwright), where there is no Rust: the
 * scripted mock harness, with the scripts the Rust mock is built with. Loaded only there, and
 * only in development: the app runs harnesses through IPC.
 */
import deckBuild from '../../src-tauri/src/harness/fixtures/scripts/deck-build.json';
import errors from '../../src-tauri/src/harness/fixtures/scripts/errors.json';
import gateStuck from '../../src-tauri/src/harness/fixtures/scripts/gate-stuck.json';
import qualityGate from '../../src-tauri/src/harness/fixtures/scripts/quality-gate.json';
import slideChat from '../../src-tauri/src/harness/fixtures/scripts/slide-chat.json';
import { createScriptedAgent, type Script, type ScriptedAgent } from './scriptedAgent';

/** The first is the default, as in the Rust mock's list. */
const SCRIPTS: Record<string, Script> = {
  'deck-build': deckBuild,
  'slide-chat': slideChat,
  errors,
  'quality-gate': qualityGate,
  'gate-stuck': gateStuck,
};

export function pageAgent(speed: number): ScriptedAgent {
  return createScriptedAgent(SCRIPTS, { speed });
}
