// Fetches the model of local image upscaling (SPEC AIO-04), for development.
//
// The app never downloads a model, and the repository does not carry one: the choice of model,
// and whether one ships at all, is the user's. A developer who wants "Upscale" in a debug build
// runs this, on purpose:
//
//   node apps/desktop/scripts/fetch-upscale-model.mjs               the model
//   node apps/desktop/scripts/fetch-upscale-model.mjs --dir <path>  into another folder
//   node apps/desktop/scripts/fetch-upscale-model.mjs --list        what there is
//
// and points the debug build at the folder:
//
//   SLIDR_MODELS_DIR=<repo>/apps/desktop/src-tauri/models pnpm tauri dev
//
// or copies the file into `<the app's data folder>/models`, where a release build looks too.
//
// The authors of Real-ESRGAN publish their weights as PyTorch checkpoints only, and the app runs
// ONNX. So this downloads the checkpoint from the project's own release page and writes the same
// network as an ONNX file, here, with nothing but Node: a checkpoint is a zip of raw tensors and
// a pickle that names them, and the network is a column of convolutions (`SRVGGNetCompact` in
// the project's `srvgg_arch.py`). Both files are pinned, the download and the file written from
// it, by size and SHA-256: one that does not match is deleted and the script fails. The id, the
// file name and the size are the ones in `src-tauri/src/image_process/upscale.rs`.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

// The code of Real-ESRGAN is under BSD-3-Clause. Its release pages say nothing more about the
// weights, and its training guide names the pictures they were trained on: DIV2K ("made
// available for academic research purpose only"), Flickr2K and OST. See the round's ADR.
const MODELS = [
  {
    id: 'realesr-general-x4v3',
    file: 'realesr-general-x4v3.onnx',
    source: 'https://github.com/xinntao/Real-ESRGAN',
    weights: {
      url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth',
      bytes: 4885111,
      sha256: '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
    },
    // The network of the checkpoint: 3 channels in, `features` wide, `convs` convolutions
    // between the first and the last, and `scale` times the size out.
    network: { features: 64, convs: 32, scale: 4 },
    bytes: 4862660,
    sha256: '5e9a30f212d4cc3b66d03d5b8a05129af74b3d3d85e75117916d61738e3215d7',
  },
];

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** The file is there, of the pinned size and with the pinned hash. */
async function verified(file, pinned) {
  const info = await stat(file).catch(() => null);
  return info?.size === pinned.bytes && (await sha256(file)) === pinned.sha256;
}

/* ------------------------------------------------------------------ reading the checkpoint */

/** The entries of a zip: where each one's bytes are. A checkpoint stores them uncompressed. */
function zipEntries(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('the checkpoint is not a zip file');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('the zip directory is damaged');
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    entries.set(name, { method, start, packed });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`the checkpoint has no ${name}`);
    const raw = buffer.subarray(entry.start, entry.start + entry.packed);
    return entry.method === 0 ? raw : inflateRawSync(raw);
  };
}

/**
 * Reads the pickle of a checkpoint: the few opcodes `torch.save` writes for a dictionary of
 * tensors. Nothing of it is run: a tensor comes out as `{ storage, offset, size }`, where
 * `storage` names the zip entry its numbers are in, and every other object as plain data.
 */
function unpickle(data) {
  const stack = [];
  const marks = [];
  const memo = new Map();
  let at = 0;
  const toMark = () => stack.splice(marks.pop());
  const call = (fn, args) => {
    if (fn.global === 'collections.OrderedDict') return new Map();
    if (fn.global === 'torch._utils._rebuild_tensor_v2') {
      const [storage, offset, size] = args;
      return { storage: storage.key, offset, size };
    }
    throw new Error(`the checkpoint calls ${fn.global}, which a table of weights does not`);
  };
  for (;;) {
    const op = data[at++];
    switch (op) {
      case 0x80: // PROTO
        at += 1;
        break;
      case 0x63: {
        // GLOBAL: module and name, a line each. Kept as a name; nothing is imported.
        const moduleEnd = data.indexOf(10, at);
        const nameEnd = data.indexOf(10, moduleEnd + 1);
        const module = data.toString('utf8', at, moduleEnd);
        stack.push({ global: `${module}.${data.toString('utf8', moduleEnd + 1, nameEnd)}` });
        at = nameEnd + 1;
        break;
      }
      case 0x58: {
        // BINUNICODE
        const length = data.readUInt32LE(at);
        stack.push(data.toString('utf8', at + 4, at + 4 + length));
        at += 4 + length;
        break;
      }
      case 0x4b: // BININT1
        stack.push(data[at]);
        at += 1;
        break;
      case 0x4d: // BININT2
        stack.push(data.readUInt16LE(at));
        at += 2;
        break;
      case 0x4a: // BININT
        stack.push(data.readInt32LE(at));
        at += 4;
        break;
      case 0x88: // NEWTRUE
        stack.push(true);
        break;
      case 0x89: // NEWFALSE
        stack.push(false);
        break;
      case 0x4e: // NONE
        stack.push(null);
        break;
      case 0x7d: // EMPTY_DICT
        stack.push(new Map());
        break;
      case 0x29: // EMPTY_TUPLE
        stack.push([]);
        break;
      case 0x28: // MARK
        marks.push(stack.length);
        break;
      case 0x74: // TUPLE
        stack.push(toMark());
        break;
      case 0x85: // TUPLE1
        stack.push(stack.splice(-1));
        break;
      case 0x86: // TUPLE2
        stack.push(stack.splice(-2));
        break;
      case 0x87: // TUPLE3
        stack.push(stack.splice(-3));
        break;
      case 0x51: {
        // BINPERSID: ('storage', FloatStorage, key, device, length)
        const [kind, type, key] = stack.pop();
        if (kind !== 'storage' || type.global !== 'torch.FloatStorage') {
          throw new Error('the checkpoint holds something other than 32-bit float tensors');
        }
        stack.push({ key });
        break;
      }
      case 0x52: {
        // REDUCE
        const args = stack.pop();
        stack.push(call(stack.pop(), args));
        break;
      }
      case 0x71: // BINPUT
        memo.set(data[at], stack[stack.length - 1]);
        at += 1;
        break;
      case 0x72: // LONG_BINPUT
        memo.set(data.readUInt32LE(at), stack[stack.length - 1]);
        at += 4;
        break;
      case 0x68: // BINGET
        stack.push(memo.get(data[at]));
        at += 1;
        break;
      case 0x6a: // LONG_BINGET
        stack.push(memo.get(data.readUInt32LE(at)));
        at += 4;
        break;
      case 0x73: {
        // SETITEM
        const [key, value] = stack.splice(-2);
        stack[stack.length - 1].set(key, value);
        break;
      }
      case 0x75: {
        // SETITEMS
        const items = toMark();
        const target = stack[stack.length - 1];
        for (let i = 0; i < items.length; i += 2) target.set(items[i], items[i + 1]);
        break;
      }
      case 0x62: // BUILD: the state of an OrderedDict is its metadata, which is not needed
        stack.pop();
        break;
      case 0x2e: // STOP
        return stack.pop();
      default:
        throw new Error(`the checkpoint's pickle has an opcode this reader does not know: ${op}`);
    }
  }
}

/** The tensors of a checkpoint by name: `{ dims, bytes }`, the bytes little-endian float32. */
function readCheckpoint(buffer) {
  const entry = zipEntries(buffer);
  const top = unpickle(entry('archive/data.pkl'));
  const table = top.get('params_ema') ?? top.get('params') ?? top;
  const tensors = new Map();
  for (const [name, tensor] of table) {
    const count = tensor.size.reduce((n, d) => n * d, 1);
    const storage = entry(`archive/data/${tensor.storage}`);
    const from = tensor.offset * 4;
    tensors.set(name, { dims: tensor.size, bytes: storage.subarray(from, from + count * 4) });
  }
  return tensors;
}

/* ------------------------------------------------------------------ writing the ONNX file */

// Protocol buffers, the little of them an ONNX file needs: varints, and fields that are a
// varint, a 32-bit float or a run of bytes.
function varint(value) {
  const out = [];
  let rest = BigInt(value);
  do {
    const low = Number(rest & 0x7fn);
    rest >>= 7n;
    out.push(rest ? low | 0x80 : low);
  } while (rest);
  return Buffer.from(out);
}
const int = (field, value) => Buffer.concat([varint(field << 3), varint(value)]);
const bytes = (field, value) =>
  Buffer.concat([varint((field << 3) | 2), varint(value.length), value]);
const text = (field, value) => bytes(field, Buffer.from(value, 'utf8'));
const message = (field, ...parts) => bytes(field, Buffer.concat(parts));

const FLOAT = 1; // TensorProto.DataType
/** An initializer: a named tensor of 32-bit floats. */
const tensor = (name, dims, raw) =>
  message(5, ...dims.map((d) => int(1, d)), int(2, FLOAT), text(8, name), bytes(9, raw));
const ints = (name, values) =>
  message(5, text(1, name), ...values.map((v) => int(8, v)), int(20, 7 /* INTS */));
const oneInt = (name, value) => message(5, text(1, name), int(3, value), int(20, 2 /* INT */));
const string = (name, value) => message(5, text(1, name), text(4, value), int(20, 3 /* STRING */));
const node = (type, name, inputs, output, ...attributes) =>
  message(
    1,
    ...inputs.map((i) => text(1, i)),
    text(2, output),
    text(3, name),
    text(4, type),
    ...attributes,
  );
/** A picture as the network takes and gives it: one, of three channels, of any size. */
const picture = (field, name, height, width) => {
  const dim = (d) => message(1, typeof d === 'number' ? int(1, d) : text(2, d));
  const shape = message(2, dim(1), dim(3), dim(height), dim(width));
  return message(field, text(1, name), message(2, message(1, int(1, FLOAT), shape)));
};

/**
 * `SRVGGNetCompact` as an ONNX graph: a convolution and a PReLU, `convs` times more, a last
 * convolution to `3 * scale * scale` channels, and a pixel shuffle that lays those channels out
 * as `scale` times the size. The network learns what to add to the picture enlarged by plain
 * repetition of its pixels; that repetition is written here as one more convolution into the
 * same channels (each input channel copied to its `scale * scale` places), so the graph is
 * convolutions, PReLUs, one addition and one `DepthToSpace`, and nothing a runtime may read
 * differently.
 */
function toOnnx(tensors, { features, convs, scale }) {
  const get = (name, dims) => {
    const found = tensors.get(name);
    if (!found || found.dims.join() !== dims.join()) {
      throw new Error(
        `the checkpoint's ${name} is ${found ? `[${found.dims}]` : 'missing'}, not [${dims}]`,
      );
    }
    return found.bytes;
  };
  const out = 3 * scale * scale;
  const initializers = [];
  const nodes = [];
  const conv = (index, from, to, input) => {
    initializers.push(
      tensor(
        `body.${index}.weight`,
        [to, from, 3, 3],
        get(`body.${index}.weight`, [to, from, 3, 3]),
      ),
      tensor(`body.${index}.bias`, [to], get(`body.${index}.bias`, [to])),
    );
    nodes.push(
      node(
        'Conv',
        `conv${index}`,
        [input, `body.${index}.weight`, `body.${index}.bias`],
        `conv${index}`,
        ints('kernel_shape', [3, 3]),
        ints('pads', [1, 1, 1, 1]),
        ints('strides', [1, 1]),
      ),
    );
    return `conv${index}`;
  };
  const prelu = (index, input) => {
    // One slope per channel: [features, 1, 1] is how ONNX lines it up with the channels.
    initializers.push(
      tensor(`body.${index}.weight`, [features, 1, 1], get(`body.${index}.weight`, [features])),
    );
    nodes.push(node('PRelu', `act${index}`, [input, `body.${index}.weight`], `act${index}`));
    return `act${index}`;
  };

  let last = prelu(1, conv(0, 3, features, 'input'));
  for (let i = 1; i <= convs; i++) last = prelu(i * 2 + 1, conv(i * 2, features, features, last));
  last = conv(convs * 2 + 2, features, out, last);

  // The picture's own pixels, each repeated over its `scale` by `scale` block.
  const repeat = new Float32Array(out * 3);
  for (let channel = 0; channel < 3; channel++) {
    for (let k = 0; k < scale * scale; k++) repeat[(channel * scale * scale + k) * 3 + channel] = 1;
  }
  initializers.push(tensor('repeat', [out, 3, 1, 1], Buffer.from(repeat.buffer)));
  nodes.push(
    node('Conv', 'base', ['input', 'repeat'], 'base', ints('kernel_shape', [1, 1])),
    node('Add', 'sum', [last, 'base'], 'sum'),
    node(
      'DepthToSpace',
      'shuffle',
      ['sum'],
      'output',
      oneInt('blocksize', scale),
      string('mode', 'CRD'),
    ),
  );

  const graph = message(
    7,
    ...nodes,
    text(2, 'SRVGGNetCompact'),
    ...initializers,
    picture(11, 'input', 'height', 'width'),
    picture(12, 'output', `height*${scale}`, `width*${scale}`),
  );
  return Buffer.concat([
    int(1, 7), // ir_version
    text(2, 'slidr fetch-upscale-model'),
    graph,
    message(8, text(1, ''), int(2, 12)), // the default operator set, version 12
  ]);
}

/* ------------------------------------------------------------------ the script */

async function fetchModel(model, dir) {
  const target = join(dir, model.file);
  if (await verified(target, model)) {
    console.log(`${model.file} is already in ${dir} (verified).`);
    return;
  }
  const { weights } = model;
  console.log(`Downloading ${weights.url} (${megabytes(weights.bytes)})`);
  const response = await fetch(weights.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`the download failed: HTTP ${response.status}`);
  }
  await mkdir(dir, { recursive: true });
  // Under other names until each is verified: the app never sees half a file.
  const checkpoint = `${target}.pth.partial`;
  const partial = `${target}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(checkpoint));
    if (!(await verified(checkpoint, weights))) {
      throw new Error('the checkpoint does not match its pinned size and SHA-256');
    }
    const onnx = toOnnx(readCheckpoint(await readFile(checkpoint)), model.network);
    await writeFile(partial, onnx);
    if (!(await verified(partial, model))) {
      const hash = createHash('sha256').update(onnx).digest('hex');
      throw new Error(
        `${model.file} as written (${onnx.length} bytes, SHA-256 ${hash}) does not match its pinned size and SHA-256`,
      );
    }
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw new Error(`${error.message}; nothing was installed`, { cause: error });
  } finally {
    await rm(checkpoint, { force: true });
  }
  console.log(`${model.file} is in ${dir} (verified). Weights: ${model.source}`);
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const model of MODELS) {
    console.log(`${model.id.padEnd(24)} ${megabytes(model.bytes).padStart(9)}  ${model.source}`);
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
      `usage: fetch-upscale-model.mjs [${MODELS.map((m) => m.id).join(' | ')}] [--dir <path>]`,
    );
    process.exit(2);
  }
  await fetchModel(model, dir);
  console.log(`A debug build finds it with SLIDR_MODELS_DIR=${dir}`);
}
