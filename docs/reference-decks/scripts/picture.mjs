// One picture for the samples of the built-in templates, generated through Codex CLI (ADR-004)
// and stored as WebP under docs/reference-decks/images:
//   node docs/reference-decks/scripts/picture.mjs <name> "<what the picture shows>" [options]
//   node docs/reference-decks/scripts/picture.mjs <name> --from <file.png> [options]
// Options:
//   --grid CxR     cut the picture into C columns and R rows: <name>-1.webp, <name>-2.webp, ...
//                  in reading order (a sheet of four portraits is one generation, not four)
//   --inset F      trim this share of each cell's sides before it is cut (default 0.01 with --grid)
//   --width N      the longest side of each file, in pixels (default 1600)
//   --from FILE    do not generate: cut and convert a picture that already exists
// Every generation uses the ChatGPT plan's quota. Each run is written to
// apps/desktop/test-results/design/templates/pictures/ledger.json (not in git), with the PNG
// as it came. The asset records the templates name (pictures.generated.ts) are written again.
/* global document, Image */
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root } from './decks.mjs';
import { writePictures } from './pictures.mjs';

const MAX_BYTES = 200_000;
const RULE =
  'Use your image generation tool. Do not write or run any code. When the image exists, reply with only its file path.';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const grid = flag('--grid');
const from = flag('--from');
const width = Number(flag('--width') ?? 1600);
const inset = Number(flag('--inset') ?? (grid ? 0.01 : 0));
const [name, prompt] = args;
if (!name || (!prompt && !from)) {
  console.error('usage: picture.mjs <name> "<prompt>" [--grid CxR] [--inset F] [--width N] | <name> --from <file>');
  process.exit(2);
}
const [columns, rows] = (grid ?? '1x1').split('x').map(Number);

const work = join(root, '..', '..', 'apps', 'desktop', 'test-results', 'design', 'templates', 'pictures');
mkdirSync(work, { recursive: true });
const ledgerFile = join(work, 'ledger.json');
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : [];

/** One `codex exec` call; resolves with the file it left in `generated_images`. */
function generate(text) {
  const cwd = mkdtempSync(join(tmpdir(), 'slidr-picture-'));
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const argv = ['exec', '--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--ephemeral', '-s', 'read-only', text];
  // `shell: true`: on Windows the global `codex` is a .cmd shim.
  const quoted = argv.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  const child = spawn('codex', quoted, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', () => {});
  return new Promise((resolve) => {
    child.on('close', (code) => {
      const events = stdout.trim().split('\n').flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
      // The file is found by the thread, not by what the agent says (ADR-004).
      const thread = events.find((e) => e.type === 'thread.started')?.thread_id;
      const dir = thread ? join(codexHome, 'generated_images', thread) : undefined;
      const files = dir && existsSync(dir) ? readdirSync(dir).map((f) => join(dir, f)) : [];
      const said = events.filter((e) => e.item?.type === 'agent_message').pop()?.item.text ?? '';
      resolve({ code, file: files.find((f) => said.includes(f)) ?? files.at(-1) });
    });
  });
}

let source = from;
if (!source) {
  const started = Date.now();
  const made = await generate(`${RULE} Create ONE image: ${prompt} No text, no letters, no logos, no watermark.`);
  const seconds = Math.round((Date.now() - started) / 1000);
  ledger.push({ name, prompt, at: new Date().toISOString(), seconds, ok: Boolean(made.file) });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
  if (!made.file) {
    console.error(`${name}: codex exited ${made.code} and left no image (${seconds}s). It still counts against the budget.`);
    process.exit(1);
  }
  source = join(work, `${name}.png`);
  copyFileSync(made.file, source);
  console.log(`${name}: generated in ${seconds}s, kept as ${source}`);
}

// Cut and encode in the browser the app runs on: no image library to depend on.
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const dataUrl = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
const cells = await page.evaluate(
  async ({ dataUrl, columns, rows, inset, width, maxBytes }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const cw = image.naturalWidth / columns;
    const ch = image.naturalHeight / rows;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const sx = c * cw + cw * inset;
        const sy = r * ch + ch * inset;
        const sw = cw * (1 - 2 * inset);
        const sh = ch * (1 - 2 * inset);
        let k = Math.min(1, width / Math.max(sw, sh));
        let quality = 0.86;
        for (;;) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(sw * k);
          canvas.height = Math.round(sh * k);
          canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/webp', quality);
          const bytes = Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);
          if (bytes <= maxBytes || (quality <= 0.6 && k <= 0.5)) {
            out.push({ url, w: canvas.width, h: canvas.height });
            break;
          }
          // First ask less of the encoder, then of the size.
          if (quality > 0.6) quality -= 0.06;
          else k *= 0.85;
        }
      }
    }
    return out;
  },
  { dataUrl, columns, rows, inset, width, maxBytes: MAX_BYTES },
);
await browser.close();

for (const [i, cell] of cells.entries()) {
  const file = `${name}${cells.length > 1 ? `-${i + 1}` : ''}.webp`;
  const path = join(root, 'images', file);
  writeFileSync(path, Buffer.from(cell.url.slice(cell.url.indexOf(',') + 1), 'base64'));
  console.log(`images/${file}: ${cell.w}x${cell.h}, ${Math.round(statSync(path).size / 1024)}kB`);
}
console.log(writePictures());
console.log(`generations so far in this worktree: ${ledger.length}`);
