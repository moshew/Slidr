// The ledger of picture generations (picture.mjs): one record per call of the image tool, kept
// in a JSON file that several runs may write at once. Each record is added under a lock, to the
// file as it is at that moment: a run that read the file when it started and wrote it back when
// its picture came, a minute later, dropped the records of the runs in between (five of
// fourteen once).
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';

/** A lock older than this was left by a run that died: it is taken over. */
const STALE_MS = 60_000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The records of a ledger file, oldest first; none when it is not there. */
export function readLedger(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

/** Adds one record to the ledger file and returns how many it holds now. */
export async function record(file, entry) {
  const lock = `${file}.lock`;
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { force: true });
      } catch {
        // Gone between the two calls: try again.
      }
      if (tries > 2000) throw new Error(`the ledger stayed locked: ${lock}`, { cause: error });
      await pause(5 + Math.random() * 20);
    }
  }
  try {
    const ledger = readLedger(file);
    ledger.push(entry);
    // Written beside it and moved over it, so a reader never sees half a file.
    writeFileSync(`${file}.tmp`, JSON.stringify(ledger, null, 2));
    renameSync(`${file}.tmp`, file);
    return ledger.length;
  } finally {
    rmSync(lock, { force: true });
  }
}
