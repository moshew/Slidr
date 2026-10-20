// A stand-in for the Codex CLI, for the provider's process tests (spawn, stdout, exit, kill,
// clean-up) without the real CLI and without cost. Line shapes follow the recordings next to this
// file. It answers what the provider calls: `--version`, `login status` and `exec --json`.
//
// `exec` reads its arguments as the real CLI does: everything after `-i` up to the next flag is
// an image, so a prompt placed after `-i` is lost (ADR-004 rule 3). A word in the prompt picks
// the behaviour:
//   "two files"     two pictures; the agent names the older one
//   "no path"       one picture; the agent says it could not get its path (rule 1)
//   "refuse"        no picture; the agent says why
//   "unauthorized"  the recorded end of a run without credentials
//   "crash"         exits with code 3 mid-turn, with a line on stderr
//   "hang"          starts and never finishes; appends to a heartbeat file while it lives
//   anything else   one picture, its path reported
// A picture is wide when the prompt says 16:9 and square otherwise.
//
// Before the turn it writes $CODEX_HOME/calls/<thread>.json: its arguments, its working folder
// and what is in it, the images it was given, and any API key variable it inherited. A file
// $CODEX_HOME/logged-out makes `login status` say so.
/* global process, setInterval, Buffer */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const home = process.env.CODEX_HOME ?? '.';
const out = (line) => process.stdout.write(JSON.stringify(line) + '\n');
// Exit once what was written has gone out: pipes can be asynchronous on Windows.
const exit = (code, complaint = '') =>
  process.stdout.write('', () => process.stderr.write(complaint, () => process.exit(code)));
const say = (id, text) =>
  out({ type: 'item.completed', item: { id: `item_${id}`, type: 'agent_message', text } });

/** The header of a PNG of the given size: enough to be recognised and measured. */
function png(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function exec() {
  let prompt;
  const images = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-i') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) images.push(argv[++i]);
    } else if (arg === '-s') i++;
    else if (!arg.startsWith('-')) prompt ??= arg;
  }
  if (prompt === undefined) return exit(1, 'No prompt provided via stdin.\n');

  const thread = randomUUID();
  const calls = path.join(home, 'calls');
  fs.mkdirSync(calls, { recursive: true });
  fs.writeFileSync(
    path.join(calls, `${thread}.json`),
    JSON.stringify({
      argv,
      prompt,
      images,
      cwd: process.cwd(),
      files: fs.readdirSync('.'),
      leaked: Object.keys(process.env).filter((key) => /^(CODEX|OPENAI)_API_KEY$/.test(key)),
    }),
  );

  const folder = path.join(home, 'generated_images', thread);
  const picture = (width, height) => {
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `exec-${randomUUID()}.png`);
    fs.writeFileSync(file, png(width, height));
    return file;
  };
  const size = prompt.includes('16:9') ? [1672, 941] : [1254, 1254];
  const complete = () => {
    out({
      type: 'turn.completed',
      usage: { input_tokens: 44051, cached_input_tokens: 39296, output_tokens: 312 },
    });
    exit(0);
  };

  out({ type: 'thread.started', thread_id: thread });
  out({ type: 'turn.started' });
  if (prompt.includes('hang')) {
    const beat = path.join(calls, `${thread}.beat`);
    setInterval(() => fs.appendFileSync(beat, '.'), 25);
  } else if (prompt.includes('crash')) {
    exit(3, 'fake-cli: crashing on purpose\n');
  } else if (prompt.includes('unauthorized')) {
    const message =
      'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses';
    out({ type: 'error', message: `Reconnecting... 5/5 (${message})` });
    out({ type: 'error', message });
    out({ type: 'turn.failed', error: { message } });
    exit(1);
  } else if (prompt.includes('refuse')) {
    say(0, "I can't create that image: it goes against the content policy.");
    complete();
  } else if (prompt.includes('no path')) {
    picture(...size);
    say(0, "I'll use the imagegen skill to create the image.");
    say(1, "The image tool completed, but I couldn't retrieve its file path.");
    complete();
  } else if (prompt.includes('two files')) {
    const first = picture(1672, 941);
    const longAgo = new Date(Date.now() - 60_000);
    fs.utimesSync(first, longAgo, longAgo);
    picture(1254, 1254);
    say(0, first);
    complete();
  } else {
    say(0, "I'll use the imagegen skill to create the image.");
    say(1, picture(...size));
    complete();
  }
}

if (argv[0] === '--version') {
  process.stdout.write('codex-cli 9.9.9\n', () => process.exit(0));
} else if (argv[0] === 'login') {
  // The real CLI answers on stderr.
  if (fs.existsSync(path.join(home, 'logged-out'))) exit(1, 'Not logged in\n');
  else exit(0, 'Logged in using ChatGPT\n');
} else if (argv[0] === 'exec') {
  exec();
} else {
  exit(2, `fake-cli: unexpected arguments ${argv.join(' ')}\n`);
}
