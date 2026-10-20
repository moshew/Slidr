import { isTauri } from '@tauri-apps/api/core';
import { isWebAddress } from '../shell/external';

/**
 * Which links a show in this window follows. The app hands an address to the system only when
 * it is one of the web (`shell/external.ts`; the opener's permission names `http` and `https`
 * and nothing else), and its own window opens nothing itself. A link to a mail address or a
 * phone number would look like a link there and do nothing, so the show is told not to draw it
 * as one. A plain browser page follows such a link itself, and so does whoever opens an
 * exported file.
 */
export function opensInShow(address: string): boolean {
  return !isTauri() || isWebAddress(address);
}
