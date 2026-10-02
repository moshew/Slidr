// Spike WG0-S4: image generation through Codex CLI (no API key, ChatGPT login).
// Findings: docs/adr/ADR-004-image-provider.md.
//   node run.mjs            # one generation, one edit with a reference image, four in parallel
// Every image uses the ChatGPT plan's quota.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');

/** PNG width/height from the IHDR chunk. */
function pngSize(file) {
  const b = readFileSync(file);
  return b.toString('ascii', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'not a PNG';
}

/** One `codex exec` call. Resolves with timing, usage, and the files it left in generated_images. */
function generate(label, prompt, images = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'slidr-s4-'));
  const args = ['exec', '--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--ephemeral', '-s', 'read-only'];
  // The prompt goes first: `-i` takes any number of files and would swallow it.
  args.push(prompt);
  for (const image of images) args.push('-i', image);
  const started = Date.now();
  // `shell: true`: on Windows the global `codex` is a .cmd shim.
  const child = spawn('codex', args.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)), { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  return new Promise((resolve) => {
    child.on('close', (code) => {
      const seconds = (Date.now() - started) / 1000;
      const events = stdout.trim().split('\n').flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      });
      writeFileSync(join(out, `${label}.jsonl`), stdout);
      const thread = events.find((e) => e.type === 'thread.started')?.thread_id;
      const usage = events.find((e) => e.type === 'turn.completed')?.usage;
      const dir = thread ? join(codexHome, 'generated_images', thread) : null;
      const files = dir && existsSync(dir) ? readdirSync(dir).map((f) => join(dir, f)) : [];
      const copies = files.map((file, i) => {
        const copy = join(out, `${label}${files.length > 1 ? `-${i + 1}` : ''}.png`);
        copyFileSync(file, copy);
        return { copy, size: pngSize(file), kb: Math.round(statSync(file).size / 1024) };
      });
      const lastMessage = events.filter((e) => e.item?.type === 'agent_message').pop()?.item.text ?? '';
      resolve({ label, code, seconds, thread, usage, files, copies, lastMessage, itemTypes: [...new Set(events.map((e) => e.item?.type).filter(Boolean))], stderrLines: stderr.trim().split('\n').filter((l) => /ERROR|error/.test(l)).length });
    });
  });
}

const show = (r) =>
  console.log(
    `${r.label}: exit ${r.code}, ${r.seconds.toFixed(1)}s, ${r.files.length} file(s) ${r.copies.map((c) => `${c.size} ${c.kb}KB`).join(', ')} | tokens in=${r.usage?.input_tokens} cached=${r.usage?.cached_input_tokens} out=${r.usage?.output_tokens} | item types: ${r.itemTypes.join(',')} | path in last message: ${r.files.some((f) => r.lastMessage.includes(f))}`,
  );

const rule = 'Use your image generation tool. Do not write or run any code. When the image exists, reply with only its file path.';

const first = await generate('generate', `${rule} Create ONE image: a wide 16:9 photographic hero image for a presentation slide about renewable energy, wind turbines on rolling hills at sunrise, soft warm light, no text or logos.`);
show(first);

if (first.files[0]) {
  const edit = await generate('edit', `${rule} Edit the attached image: keep the same composition and turbines, but make it a clear night with stars and a full moon. Produce ONE image.`, [first.files[0]]);
  show(edit);
}

const subjects = ['a modern city skyline at dusk', 'a close-up of a circuit board with shallow depth of field', 'a team of four people around a whiteboard, seen from behind', 'an abstract flowing gradient in teal and indigo'];
const started = Date.now();
const parallel = await Promise.all(subjects.map((subject, i) => generate(`parallel-${i + 1}`, `${rule} Create ONE square 1:1 image: ${subject}, no text.`)));
parallel.forEach(show);
console.log(`four in parallel: ${((Date.now() - started) / 1000).toFixed(1)}s wall, ${parallel.filter((r) => r.files.length === 1).length}/4 produced exactly one image`);
