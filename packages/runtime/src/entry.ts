// The entry of the bundle an exported file carries (see scripts/build-bundle.mjs): it starts the
// show, and leaves the player on `window.slidr` for whoever embeds or scripts the file.
import type { Player } from './player';
import { boot } from './standalone';

declare global {
  interface Window {
    slidr?: Player | undefined;
  }
}

window.slidr = boot();
