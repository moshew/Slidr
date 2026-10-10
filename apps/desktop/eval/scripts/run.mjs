// The evaluation set's runner (WG11-T13, SPEC 14.5, QG-07): sends the fixed requests of
// `../requests.json` to the deck chat of the real app, one fresh document each, and keeps what
// came out. The app is the real Tauri window with a data folder of its own, driven over WebView2
// CDP; the agent is the real CLI on the user's subscription.
//
//   pnpm --filter @slidr/desktop eval -- --model sonnet --label baseline
//   pnpm --filter @slidr/desktop eval -- --model haiku --only 01,09
//
//   --model <id>       the harness model (default: sonnet)
//   --only <ids>       comma-separated request ids, or their leading numbers
//   --label <name>     added to the run folder's name
//   --images <id>      the image provider: mock (default) or codex-cli
//   --max-images <n>   with a real provider: after n image jobs the run goes back to the mock (15)
//   --no-gate          switch the design check off
//   --template <id>    the template every request's deck starts on (a built-in one, such as
//                      zerem), several with commas between them, or `all`: each in turn, by
//                      the request's place in the set; without it, the plain deck of the base
//                      theme
//   --attach           use the app that is already running on the CDP port
//   --requests <file>  another set of requests, in the shape of ../requests.json
//   --check            start the app, check its data folder and prepare the first request's
//                      document, and stop there: nothing is sent to the agent.
//
// A session that shares the machine with others runs the set under an identifier and ports of
// its own: SLIDR_EVAL_IDENTIFIER, SLIDR_EVAL_VITE_PORT, SLIDR_EVAL_CDP_PORT, and
// SLIDR_EVAL_CONFIG for the Tauri config that names them (as eval/eval.tauri.conf.json does).
//
// Output, under test-results/eval/<run>/<request>/: deck.json, deck.slidr, slides/NN.png,
// transcript.jsonl, tools.jsonl (every tool call in full), result.json (the measurements).
// `report.mjs` turns a run into the review page and the summary.
/* global window -- the functions given to page.evaluate run in the app's page */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { writeReport } from './report.mjs';

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const OUT_ROOT = join(APP_DIR, 'test-results', 'eval');
const IDENTIFIER = process.env.SLIDR_EVAL_IDENTIFIER ?? 'dev.slidr.app.quality';
const VITE_PORT = Number(process.env.SLIDR_EVAL_VITE_PORT ?? 1491);
const CDP_PORT = Number(process.env.SLIDR_EVAL_CDP_PORT ?? 9291);
const TAURI_CONFIG = process.env.SLIDR_EVAL_CONFIG ?? 'eval/eval.tauri.conf.json';
const APP_URL = `http://localhost:${VITE_PORT}/`;
const TURN_TIMEOUT_MS = 30 * 60_000;
const POLL_MS = 2000;

function parseArgs(argv) {
  const args = {
    model: 'sonnet',
    only: null,
    label: '',
    images: 'mock',
    maxImages: 15,
    gate: true,
    attach: false,
    template: null,
    requests: null,
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === '--model') args.model = value();
    else if (flag === '--only') args.only = value().split(',');
    else if (flag === '--label') args.label = value();
    else if (flag === '--images') args.images = value();
    else if (flag === '--max-images') args.maxImages = Number(value());
    else if (flag === '--no-gate') args.gate = false;
    else if (flag === '--template') args.template = value();
    else if (flag === '--attach') args.attach = true;
    else if (flag === '--requests') args.requests = value();
    else if (flag === '--check') args.check = true;
    else if (flag !== '--') throw new Error(`unknown option ${flag}`);
  }
  return args;
}

/** The built-in templates (WG7-T04, T10), in the order `--template all` deals them out. */
const BUILT_IN = [
  'zerem',
  'shvil',
  'tzuk',
  'lavan',
  'layla',
  'zohar',
  'migdal',
  'gan',
  'nof',
  'defus',
  'ariach',
  'bolet',
  'hod',
  'sirtut',
  'ziv',
  'shidur',
  'mifgash',
];

/**
 * The template a request's deck starts on. `all` and a list of several deal them out in turn,
 * by the request's place in the set, so a request keeps its template whatever `--only` says.
 */
function templateOf(args, set, request) {
  if (!args.template) return args.template;
  const turn = args.template === 'all' ? BUILT_IN : args.template.split(',');
  return turn[set.requests.indexOf(request) % turn.length];
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** Local time as 20261003-2110: what a run's folder is named by. */
function stamp() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  return `${day}-${two(now.getHours())}${two(now.getMinutes())}`;
}
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const jsonl = (items) => items.map((item) => `${JSON.stringify(item)}\n`).join('');

async function cdpIsUp() {
  try {
    return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok;
  } catch {
    return false;
  }
}

/** Starts the app from this worktree, with the evaluation's identifier and ports. */
async function startApp(logFile) {
  if (await cdpIsUp()) {
    throw new Error(`Something already answers on CDP port ${CDP_PORT}; stop it, or use --attach.`);
  }
  const log = createWriteStream(logFile);
  // One string: on Windows pnpm is a script, which only a shell can start.
  const child = spawn(`pnpm exec tauri dev --no-watch --config ${TAURI_CONFIG}`, {
    cwd: APP_DIR,
    shell: true,
    env: {
      ...process.env,
      PATH: `${join(homedir(), '.cargo', 'bin')}${delimiter}${process.env.PATH}`,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let exited = false;
  child.on('exit', () => (exited = true));
  // The first start compiles the app.
  for (let waited = 0; waited < 15 * 60_000; waited += 1000) {
    if (exited) throw new Error(`The app did not start; see ${logFile}`);
    if (await cdpIsUp()) return child;
    await sleep(1000);
  }
  stopApp(child);
  throw new Error(`The app did not open its CDP port; see ${logFile}`);
}

/** Ends the process tree this script started, and nothing else. */
function stopApp(child) {
  if (!child?.pid) return;
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

async function mainPage(browser) {
  for (let waited = 0; waited < 60_000; waited += 500) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((p) => p.url().startsWith(APP_URL) && !p.url().includes('capture'));
    if (page) return page;
    await sleep(500);
  }
  throw new Error('The app window did not appear over CDP.');
}

/**
 * The app's page, with the evaluation's module loaded. The window opens on an empty page
 * (`/?hold`, see ../vite.config.ts), so the data folder is checked before the app itself loads
 * and writes anything.
 *
 * The folder is asked of a command of the app's own, which needs no permission of the window:
 * the diagnostics log is kept in it, and reading the log writes nothing. The path plugin's
 * `resolve_directory`, which this used to call, has been refused since the window's
 * capabilities were cut down to what the app calls (ADR-066), and the runner then stopped here.
 */
async function openApp(browser) {
  const page = await mainPage(browser);
  const log = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('agent_diagnostics_read', { maxBytes: 1 }),
  );
  // <data folder>/agent/diagnostics.jsonl
  const dataDir = String(log.path).replace(/[\\/]agent[\\/][^\\/]+$/, '');
  if (!String(dataDir).includes(IDENTIFIER)) {
    throw new Error(
      `The app's data folder is ${dataDir}, not the evaluation's own. Nothing was run.`,
    );
  }
  await page.goto(APP_URL);
  await page.waitForFunction(() => Boolean(window.slidr), null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await import('/eval/page.ts');
  });
  return { page, dataDir };
}

/** Waits for the chat's running turn to end; stops it after the time limit. */
async function turnEnd(page, turns, onPoll) {
  const started = Date.now();
  for (;;) {
    await sleep(POLL_MS);
    const status = await page.evaluate(() => window.slidrEval.status());
    await onPoll?.(status);
    if (!status.busy && status.turns >= turns && status.outcome) return status;
    if (Date.now() - started > TURN_TIMEOUT_MS) {
      await page.evaluate(() => window.slidrEval.stop());
      await sleep(5000);
      return { ...(await page.evaluate(() => window.slidrEval.status())), timedOut: true };
    }
  }
}

async function runRequest(page, request, context) {
  const { args, set, runDir, images } = context;
  const dir = join(runDir, request.id);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  const started = Date.now();
  const provider = images.count >= args.maxImages ? 'mock' : args.images;
  const template = templateOf(args, set, request);
  await page.evaluate((options) => window.slidrEval.prepare(options), {
    settings: {
      harnessId: 'claude-code',
      model: args.model,
      // Off for the set, so that two runs can be compared: nothing depends on what the web says.
      webAccess: false,
      qualityGate: args.gate,
    },
    imageProvider: provider,
    ...(request.base ? { base: request.base } : {}),
    ...(template ? { template } : {}),
  });
  await page.waitForFunction(() => window.slidrEval.status().ready, null, { timeout: 30_000 });

  // A real provider is paid for per image: past the cap, the rest of the run paints mocks.
  const before = images.count;
  const watchImages = async (status) => {
    images.count = before + status.imageCalls;
    if (provider !== 'mock' && images.count >= args.maxImages && !images.capped) {
      images.capped = true;
      await page.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke('image_set_default_provider', { providerId: 'mock' }),
      );
      console.log(`  image cap of ${args.maxImages} reached: back to the mock provider`);
    }
  };

  await page.evaluate((text) => window.slidrEval.send(text), request.prompt);
  let status = await turnEnd(page, 1, watchImages);
  let approvals = 0;
  // The agent proposed an outline, or asked: a user would say "go ahead". Once.
  if (status.outcome === 'completed' && !status.wrote && !status.timedOut) {
    approvals = 1;
    const approve = set.approve[request.lang === 'en' ? 'en' : 'he'];
    await page.evaluate((text) => window.slidrEval.send(text), approve);
    status = await turnEnd(page, 2, watchImages);
  }

  const collected = await page.evaluate(() => window.slidrEval.collect());
  const { deck, score } = collected;
  writeJson(join(dir, 'deck.json'), deck);
  writeFileSync(join(dir, 'transcript.jsonl'), jsonl(collected.entries));
  writeFileSync(join(dir, 'tools.jsonl'), jsonl(collected.tools));
  // The measurements first: a picture that fails to draw must not cost the request its result.
  const result = {
    request,
    model: args.model,
    images: provider,
    gate: args.gate,
    ...(template ? { template } : {}),
    approvals,
    outcome: status.timedOut ? 'timed_out' : (status.outcome ?? 'unknown'),
    ...(status.problem ? { problem: status.problem } : {}),
    wallMs: Date.now() - started,
    score,
  };
  writeJson(join(dir, 'result.json'), result);

  for (const [index, slide] of deck.slides.entries()) {
    const name = `${String(index + 1).padStart(2, '0')}.png`;
    try {
      const data = await page.evaluate((id) => window.slidrEval.png(id, 1920), slide.id);
      writeFileSync(join(dir, 'slides', name), Buffer.from(data, 'base64'));
    } catch (error) {
      console.log(`  slide ${index + 1} was not captured: ${error.message.split('\n')[0]}`);
    }
  }
  try {
    await page.evaluate((path) => window.slidrEval.save(path), join(dir, 'deck.slidr'));
  } catch (error) {
    console.log(`  the .slidr file was not saved: ${error.message.split('\n')[0]}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const set = JSON.parse(
    readFileSync(
      args.requests ? resolve(args.requests) : join(APP_DIR, 'eval', 'requests.json'),
      'utf8',
    ),
  );
  const requests = set.requests.filter(
    (request) => !args.only || args.only.some((id) => request.id.startsWith(id)),
  );
  if (requests.length === 0) throw new Error('No request matches --only.');
  const run = [stamp(), args.model, args.label].filter(Boolean).join('-');
  const runDir = join(OUT_ROOT, run);
  mkdirSync(runDir, { recursive: true });
  const git = (...command) =>
    spawnSync('git', command, { cwd: APP_DIR, encoding: 'utf8' }).stdout.trim();
  writeJson(join(runDir, 'run.json'), {
    run,
    args,
    set: set.version,
    // What was measured: the commit, and whether the sources had changes it does not hold.
    commit: git('rev-parse', '--short', 'HEAD'),
    dirty: git('status', '--porcelain', '--', '../../packages', 'src') !== '',
    startedAt: new Date(),
  });
  console.log(
    `run ${run}: ${requests.length} requests on ${args.model}, images: ${args.images}` +
      (args.template ? `, template: ${args.template}` : ''),
  );

  const app = args.attach ? null : await startApp(join(runDir, 'app.log'));
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const { page, dataDir } = await openApp(browser);
    console.log(`data folder: ${dataDir}`);
    if (args.check) {
      const [first] = requests;
      const template = templateOf(args, set, first);
      const { deckId } = await page.evaluate((options) => window.slidrEval.prepare(options), {
        settings: { harnessId: 'claude-code', model: args.model, webAccess: false },
        imageProvider: 'mock',
        ...(first.base ? { base: first.base } : {}),
        ...(template ? { template } : {}),
      });
      await page.waitForFunction(() => window.slidrEval.status().ready, null, { timeout: 30_000 });
      const status = await page.evaluate(() => window.slidrEval.status());
      console.log(
        `check: the document of ${first.id} is open (deck ${deckId}, ${status.slides} slides) and ` +
          'its chat is ready. Nothing was sent.',
      );
      await page.evaluate(() => window.slidrEval.close()).catch(() => undefined);
      return;
    }
    const images = { count: 0, capped: false };
    for (const request of requests) {
      const on = templateOf(args, set, request);
      console.log(`${request.id}${on ? ` on ${on}` : ''} …`);
      let result;
      try {
        result = await runRequest(page, request, { args, set, runDir, images });
      } catch (error) {
        console.log(`  failed: ${error.message}`);
        writeJson(join(runDir, `${request.id}.error.json`), { message: String(error.stack) });
        continue;
      }
      const { score } = result;
      console.log(
        `  ${result.outcome}: ${score.slides.length} slides, ` +
          `${score.findings.error} errors, ${score.findings.warning} warnings, ` +
          `gate ${score.gate.passedFirstRound}/${score.gate.judged}, ` +
          `${Math.round(result.wallMs / 1000)}s`,
      );
    }
    await page.evaluate(() => window.slidrEval.close()).catch(() => undefined);
  } finally {
    await browser?.close().catch(() => undefined);
    stopApp(app);
  }
  const { reviewPage } = writeReport(runDir);
  console.log(`review page: ${reviewPage}`);
  console.log(`score it with: pnpm --filter @slidr/desktop eval:review -- ${run}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A run that is cut short should say by what: twice a run ended in its first seconds with
  // nothing written, and the app it had started stayed up (ADR-042). `--attach` picks it up.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    process.on(signal, () => {
      console.error(`stopped by ${signal}`);
      process.exit(1);
    });
  }
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
