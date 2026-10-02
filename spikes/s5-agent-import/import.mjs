// Spike WG0-S5: agent-led import of one HTML file, end to end.
//   node import.mjs <file.html> <label> [model]
// Starts the isolated page and the tool server, runs Claude Code (flags of ADR-001) with the
// import prompt, and writes out/<label>/report.json (+ per-slide source/converted/diff PNGs).
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportEnv } from './lib/engine.mjs';
import { startMcpServer } from './lib/mcp.mjs';
import { createTools } from './lib/tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [file, label, model = 'sonnet'] = process.argv.slice(2);
if (!file || !label) {
  console.error('usage: node import.mjs <file.html> <label> [model]');
  process.exit(2);
}

const outDir = join(here, 'out', label);
rmSync(outDir, { recursive: true, force: true });
const attachments = join(outDir, 'session', 'attachments');
mkdirSync(attachments, { recursive: true });
const source = join(attachments, 'source.html');
copyFileSync(resolve(file), source);

const started = Date.now();
const env = await ImportEnv.open(source, outDir);
const calls = [];
const log = (line) => {
  const stamped = `[${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s] ${line}`;
  console.log(stamped);
  calls.log = (calls.log || '') + stamped + '\n';
};
const mcp = await startMcpServer(createTools(env), (call) => {
  calls.push({ name: call.name, ms: call.ms, isError: call.isError, images: call.content.filter((c) => c.type === 'image').length });
  const firstText = call.content.find((c) => c.type === 'text')?.text ?? '';
  log(`  <- ${call.name} ${call.ms}ms${call.isError ? ' ERROR' : ''} ${firstText.replace(/\s+/g, ' ').slice(0, 160)}`);
});

const sessionDir = join(outDir, 'session');
writeFileSync(join(sessionDir, 'mcp.json'), JSON.stringify({ mcpServers: { slidr: { type: 'http', url: `http://127.0.0.1:${mcp.port}/mcp` } } }));
copyFileSync(join(here, 'prompts', 'import.md'), join(sessionDir, 'system.md'));

const env2 = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/i.test(k)));
const child = spawn(
  'claude',
  [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--restricted', '--disable-slash-commands', '--strict-mcp-config',
    '--mcp-config', join(sessionDir, 'mcp.json'),
    '--tools', 'Read,Grep',
    '--allowedTools', 'Read', 'Grep', 'mcp__slidr__*',
    '--permission-mode', 'dontAsk',
    '--append-system-prompt-file', join(sessionDir, 'system.md'),
    '--model', model,
  ],
  { cwd: attachments, env: env2, stdio: ['pipe', 'pipe', 'pipe'] },
);
child.stderr.on('data', (d) => log(`[stderr] ${String(d).trim().slice(0, 300)}`));
child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Import the presentation in source.html.' }] } }) + '\n');

const timeout = setTimeout(() => {
  log('TIMEOUT after 30 minutes: killing the agent');
  child.kill();
}, 30 * 60 * 1000);

let buffer = '';
let result = null;
let raw = '';
const agentText = [];
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  raw += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.type === 'system' && message.subtype === 'init') log(`init: model=${message.model} tools=${message.tools.length} mcp=${JSON.stringify(message.mcp_servers)}`);
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          agentText.push(block.text);
          log(`agent: ${block.text.replace(/\s+/g, ' ').slice(0, 400)}`);
        }
        if (block.type === 'tool_use') log(`  -> ${block.name.replace('mcp__slidr__', '')} ${JSON.stringify(block.input).slice(0, 220)}`);
      }
    }
    if (message.type === 'result') {
      result = message;
      child.stdin.end();
    }
  }
});

await new Promise((done) => child.on('close', done));
clearTimeout(timeout);
env.save();

const slides = env.deck.slides.map((s, i) => ({
  n: i + 1,
  id: s.id,
  name: s.name,
  hasNotes: Boolean(s.notes),
  source: `${Math.round(s.source.width)}x${Math.round(s.source.height)}`,
  ...s.metrics,
  fontsMissing: s.fontsMissing,
}));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const byTool = {};
for (const call of calls) byTool[call.name] = (byTool[call.name] || 0) + 1;
const usage = result?.usage ?? {};
const report = {
  file,
  model: result?.modelUsage ? Object.keys(result.modelUsage).join(', ') : model,
  finished: result?.subtype ?? 'no result (killed or crashed)',
  wallSeconds: Math.round((Date.now() - started) / 1000),
  agentTurns: result?.num_turns,
  toolCalls: calls.length,
  toolCallsByName: byTool,
  toolSeconds: Math.round(calls.reduce((n, c) => n + c.ms, 0) / 1000),
  imagesReturnedToAgent: calls.reduce((n, c) => n + c.images, 0),
  tokens: { input: usage.input_tokens, cacheWrite: usage.cache_creation_input_tokens, cacheRead: usage.cache_read_input_tokens, output: usage.output_tokens },
  costUsd: result?.total_cost_usd,
  deck: { title: env.deck.title, lang: env.deck.lang, dir: env.deck.dir, theme: env.deck.theme },
  slideCount: slides.length,
  faithfulSlides: slides.filter((s) => s.faithful).length,
  medianEditability: median(slides.map((s) => s.editability)),
  medianTextEditability: median(slides.map((s) => s.textEditability)),
  wholeSlideHtml: slides.filter((s) => s.wholeSlideHtml).length,
  slides,
  finalMessage: result?.result,
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
writeFileSync(join(outDir, 'run.log'), calls.log || '');
writeFileSync(join(outDir, 'claude.jsonl'), raw);

console.log('\n================ REPORT ================');
console.log(`${file} | model ${report.model} | ${report.finished} | ${report.wallSeconds}s wall, ${report.agentTurns} agent turns, ${report.toolCalls} tool calls (${report.toolSeconds}s in tools), ${report.imagesReturnedToAgent} images shown to the agent`);
console.log(`tokens in=${usage.input_tokens} cacheWrite=${usage.cache_creation_input_tokens} cacheRead=${usage.cache_read_input_tokens} out=${usage.output_tokens} | cost $${result?.total_cost_usd?.toFixed(3)}`);
console.log(`slides ${report.slideCount} | faithful ${report.faithfulSlides}/${report.slideCount} | median editability ${report.medianEditability}% (text ${report.medianTextEditability}%) | whole-slide HTML ${report.wholeSlideHtml}`);
console.log(`tools: ${JSON.stringify(byTool)}`);
for (const s of slides) {
  console.log(`  ${String(s.n).padStart(2)} ${s.faithful ? 'ok ' : 'BAD'} edit ${String(s.editability).padStart(5)}% text ${String(s.textEditability).padStart(5)}% diff ${String(s.diffPct).padStart(6)}% rounds ${s.rounds} ${JSON.stringify(s.counts)} ${s.source} ${s.name ?? ''}${s.hasNotes ? ' [notes]' : ''}`);
}
console.log(`\nfinal message:\n${result?.result ?? '(none)'}`);

mcp.close();
await env.close();
process.exit(0);
