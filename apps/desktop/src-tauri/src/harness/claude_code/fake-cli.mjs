// A stand-in for the Claude Code CLI in stream-json mode, for the adapter's process tests
// (spawn, stdin, stdout, interrupt, kill, crash, close) without the real CLI. Line shapes follow
// the recordings next to this file. What the user turn says picks the behaviour:
//   "stream"  text deltas every 20ms until interrupted
//   "hang"    the same, but ignores the interrupt (the adapter must end the process)
//   "crash"   exits with code 3 mid-turn
//   anything else: one delta "echo: <text>" and a successful result
// On start it writes probe.json into its working directory: its arguments, any CLAUDE* or
// ANTHROPIC* variable it inherited, and the limits it was started with.
/* global process, setInterval, clearInterval */
import fs from 'node:fs';
import readline from 'node:readline';

const out = (line) => process.stdout.write(JSON.stringify(line) + '\n');
const delta = (text) =>
  out({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    parent_tool_use_id: null,
  });

fs.writeFileSync(
  'probe.json',
  JSON.stringify({
    argv: process.argv.slice(2),
    leaked: Object.keys(process.env).filter((key) => /^(CLAUDE|ANTHROPIC)/i.test(key)),
    limits: {
      MCP_TOOL_TIMEOUT: process.env.MCP_TOOL_TIMEOUT,
      MAX_MCP_OUTPUT_TOKENS: process.env.MAX_MCP_OUTPUT_TOKENS,
    },
  }),
);

let timer = null;
let ignoreInterrupt = false;

const finish = (subtype, reason) => {
  clearInterval(timer);
  timer = null;
  out({
    type: 'result',
    subtype,
    is_error: subtype !== 'success',
    terminal_reason: reason,
    session_id: 'fake-session',
  });
};

readline
  .createInterface({ input: process.stdin })
  .on('line', (line) => {
    const message = JSON.parse(line);
    if (message.type === 'control_request') {
      out({
        type: 'control_response',
        response: { subtype: 'success', request_id: message.request_id, response: {} },
      });
      if (timer && !ignoreInterrupt) finish('error_during_execution', 'aborted_streaming');
      return;
    }
    const text = message.message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ');
    out({
      type: 'system',
      subtype: 'init',
      session_id: 'fake-session',
      model: 'fake-model',
      tools: ['Read', 'Grep'],
    });
    if (text === 'stream' || text === 'hang') {
      ignoreInterrupt = text === 'hang';
      let n = 0;
      timer = setInterval(() => delta(`${++n}\n`), 20);
    } else if (text === 'crash') {
      // Exit once what was written has gone out: pipes can be asynchronous on Windows.
      process.stdout.write('', () =>
        process.stderr.write('fake-cli: crashing on purpose\n', () => process.exit(3)),
      );
    } else {
      delta(`echo: ${text}`);
      finish('success', 'completed');
    }
  })
  .on('close', () => process.stdout.write('', () => process.exit(0)));
