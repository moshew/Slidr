// Spike S1 exploration helper: run the Claude CLI with a given flag set, send one prompt over
// stream-json stdin, and print what the `system/init` message says was loaded.
// Usage: node probe.mjs <label> [--prompt "..."] -- <claude flags...>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const label = argv.shift();
let prompt = 'Reply with exactly: pong';
if (argv[0] === '--prompt') {
  argv.shift();
  prompt = argv.shift();
}
if (argv[0] === '--') argv.shift();

// The app spawns the CLI from a clean process: drop everything this (Claude-hosted) shell leaked.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/i.test(k)),
);

const workdir = join(tmpdir(), 'slidr-s1', label);
mkdirSync(workdir, { recursive: true });

const args = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--model', 'haiku',
  ...argv,
];
const child = spawn('claude', args, { cwd: workdir, env, stdio: ['pipe', 'pipe', 'pipe'] });

let out = '';
let err = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (err += d));
child.stdin.write(
  JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] } }) + '\n',
);
child.stdin.end();

child.on('close', (code) => {
  writeFileSync(join(workdir, 'out.jsonl'), out);
  const lines = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const init = lines.find((m) => m.type === 'system' && m.subtype === 'init');
  const result = lines.find((m) => m.type === 'result');
  console.log(`\n=== ${label}  (exit ${code})`);
  console.log('flags:', argv.join(' '));
  if (err.trim()) console.log('stderr:', err.trim().slice(0, 400));
  if (init) {
    console.log(`tools[${init.tools.length}]:`, init.tools.join(','));
    console.log(`mcp_servers[${init.mcp_servers.length}]:`, init.mcp_servers.map((s) => `${s.name}=${s.status}`).join(', '));
    console.log(`skills[${init.skills?.length}] slash[${init.slash_commands?.length}] agents[${init.agents?.length}] plugins[${init.plugins?.length}]`);
    console.log('permissionMode:', init.permissionMode, '| memory:', JSON.stringify(init.memory_paths));
  }
  if (result) {
    const u = result.usage;
    console.log(
      `result: ${result.subtype} "${String(result.result).slice(0, 200)}" | prompt tokens: in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens} cache_read=${u.cache_read_input_tokens} | cost=$${result.total_cost_usd}`,
    );
    if (result.permission_denials?.length) console.log('denials:', JSON.stringify(result.permission_denials).slice(0, 400));
  }
  const toolUses = lines
    .filter((m) => m.type === 'assistant')
    .flatMap((m) => m.message.content.filter((c) => c.type === 'tool_use').map((c) => `${c.name}(${JSON.stringify(c.input).slice(0, 80)})`));
  if (toolUses.length) console.log('tool_use:', toolUses.join(' ; '));
});
