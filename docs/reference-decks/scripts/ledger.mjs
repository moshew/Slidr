// The ledger of picture generations (picture.mjs): one record per call of the image tool, kept
// in a JSON file that several runs may write at once. Each record is added under a lock, to the
// file as it is at that moment: a run that read the file when it started and wrote it back when
// its picture came, a minute later, dropped the records of the runs in between (five of
// fourteen once).
import * as nodeFs from 'node:fs';

/** A lock older than this was left by a run that died: it is taken over. */
const STALE_MS = 60_000;

/**
 * What the file system answers while another run has the file. `EEXIST` is the lock that is
 * held. The others are Windows, for a moment: a lock file that is just being deleted refuses to
 * be created again with `EPERM`, and a ledger that a scanner has open refuses to be replaced.
 * A run that took one of them for a failure died in the middle, and its record was lost: three
 * runs of two hundred, when forty wrote at once.
 */
const HELD = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The records of a ledger file, oldest first; none when it is not there. */
export function readLedger(file, fs = nodeFs) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

/**
 * Adds one record to the ledger file and returns how many it holds now. `fs` is the file system
 * to write to: Node's, but for a test that makes it answer as Windows sometimes does.
 */
export async function record(file, entry, fs = nodeFs) {
  const lock = `${file}.lock`;
  for (let tries = 0; ; tries++) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (error) {
      if (!HELD.has(error.code)) throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > STALE_MS) fs.rmSync(lock, { force: true });
      } catch {
        // Gone between the two calls: try again.
      }
      if (tries > 2000) throw new Error(`the ledger stayed locked: ${lock}`, { cause: error });
      await pause(5 + Math.random() * 20);
    }
  }
  try {
    const ledger = readLedger(file, fs);
    ledger.push(entry);
    // Written beside it and moved over it, so a reader never sees half a file.
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(ledger, null, 2));
    for (let tries = 0; ; tries++) {
      try {
        fs.renameSync(`${file}.tmp`, file);
        break;
      } catch (error) {
        if (!HELD.has(error.code) || tries > 200) throw error;
        await pause(5 + Math.random() * 20);
      }
    }
    return ledger.length;
  } finally {
    // The lock goes even when Windows needs a moment to let go of it: a lock left behind
    // would hold every other run until it is old enough to be taken over.
    fs.rmSync(lock, { force: true, maxRetries: 20, retryDelay: 10 });
  }
}
