// Fetches a matting model for local background removal (SPEC GEN-06), for development.
//
// The app never downloads a model, and the repository does not carry one: the files are large,
// and the choice of model is the user's. A developer who wants background removal in a debug
// build runs this, on purpose:
//
//   node apps/desktop/scripts/fetch-matting-model.mjs               the default model
//   node apps/desktop/scripts/fetch-matting-model.mjs u2netp        another one, by id
//   node apps/desktop/scripts/fetch-matting-model.mjs --dir <path>  into another folder
//   node apps/desktop/scripts/fetch-matting-model.mjs --list        what there is
//
// and points the debug build at the folder:
//
//   SLIDR_MODELS_DIR=<repo>/apps/desktop/src-tauri/models pnpm tauri dev
//
// or copies the file into `<the app's data folder>/models`, where a release build looks too.
//
// Every file is pinned: its address, its size and its SHA-256. A file that does not match is
// deleted and the script fails. The ids, the file names and the sizes are the ones in
// `src-tauri/src/image_process/model.rs`.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// The ONNX files the rembg project publishes (MIT), converted from weights their authors
// published in repositories under Apache-2.0. The first is the default, as in `model.rs`.
const RELEASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0';
const MODELS = [
  {
    id: 'u2net',
    file: 'u2net.onnx',
    bytes: 175997641,
    sha256: '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491',
    source: 'https://github.com/xuebinqin/U-2-Net',
  },
  {
    id: 'isnet-general-use',
    file: 'isnet-general-use.onnx',
    bytes: 178648008,
    sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
    source: 'https://github.com/xuebinqin/DIS',
  },
  {
    id: 'u2netp',
    file: 'u2netp.onnx',
    bytes: 4574861,
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    source: 'https://github.com/xuebinqin/U-2-Net',
  },
];

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** The file is there, of the pinned size and with the pinned hash. */
async function verified(file, model) {
  const info = await stat(file).catch(() => null);
  return info?.size === model.bytes && (await sha256(file)) === model.sha256;
}

async function fetchModel(model, dir) {
  const target = join(dir, model.file);
  if (await verified(target, model)) {
    console.log(`${model.file} is already in ${dir} (verified).`);
    return;
  }
  const url = `${RELEASE}/${model.file}`;
  console.log(`Downloading ${url} (${megabytes(model.bytes)})`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`the download failed: HTTP ${response.status}`);
  }
  await mkdir(dir, { recursive: true });
  // Under another name until it is verified: the app never sees half a file.
  const partial = `${target}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  if (!(await verified(partial, model))) {
    await rm(partial, { force: true });
    throw new Error(
      `${model.file} does not match its pinned size and SHA-256; nothing was installed`,
    );
  }
  await rename(partial, target);
  console.log(`${model.file} is in ${dir} (verified). Weights: ${model.source}`);
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const model of MODELS) {
    console.log(`${model.id.padEnd(20)} ${megabytes(model.bytes).padStart(9)}  ${model.source}`);
  }
} else {
  const at = args.indexOf('--dir');
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(at >= 0 ? (args[at + 1] ?? '') : join(here, '..', 'src-tauri', 'models'));
  const named = args.find((arg, i) => !arg.startsWith('--') && (at < 0 || i !== at + 1));
  const id = named ?? MODELS[0].id;
  const model = MODELS.find((candidate) => candidate.id === id);
  if (!model || (at >= 0 && !args[at + 1])) {
    console.error(
      `usage: fetch-matting-model.mjs [${MODELS.map((m) => m.id).join(' | ')}] [--dir <path>]`,
    );
    process.exit(2);
  }
  await fetchModel(model, dir);
  console.log(`A debug build finds it with SLIDR_MODELS_DIR=${dir}`);
}
