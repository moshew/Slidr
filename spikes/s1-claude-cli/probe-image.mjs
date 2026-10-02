// Spike S1: does a stream-json user message accept an image content block (pasted screenshots, CHT-U05)?
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';

// 96x96 PNG: left half red, right half blue.
const W = 96, H = 96;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = y * (W * 3 + 1) + 1 + x * 3;
  if (x < W / 2) raw[o] = 255; else raw[o + 2] = 255;
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);

const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/i.test(k)));
const cwd = join(tmpdir(), 'slidr-s1', 'H-image'); mkdirSync(cwd, { recursive: true });
const child = spawn('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', 'haiku',
  '--safe-mode', '--restricted', '--strict-mcp-config', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--tools', ''], { cwd, env });
let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => process.stderr.write(d));
child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } },
  { type: 'text', text: 'What colour is the left half of this image and what colour is the right half? Answer in five words.' },
] } }) + '\n');
child.stdin.end();
child.on('close', (code) => {
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  const init = lines.find((m) => m.subtype === 'init'); const r = lines.find((m) => m.type === 'result');
  console.log(`exit ${code} | tools[${init?.tools.length}] | result: ${r?.subtype} -> ${JSON.stringify(r?.result)}`);
});
