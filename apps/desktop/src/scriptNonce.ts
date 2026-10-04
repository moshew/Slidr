import { setFrameScriptNonce } from '@slidr/renderer';

/*
 * The page's script nonce (SEC-05, ADR-066).
 *
 * The content policy of the app's pages lets a script run only when it is a file of the app, or
 * carries the nonce of this load. Nothing in the page itself needs the nonce: its scripts are
 * files. The one place that does is an `html` object with scripts (RND-06). It runs in a
 * sandboxed frame made from `srcdoc`, and such a frame inherits the policy of the page around
 * it, so without the nonce its scripts would not run at all. With it they run, inside the
 * frame's sandbox, and the policy of the page stays as strict as it was: markup that reaches the
 * page from a deck or from the clipboard cannot know the nonce of a load.
 *
 * The page is served with the nonce written into a `<meta>` (index.html, capture.html): by Tauri
 * in the app, which also adds it to the policy it sends; by the dev server's plugin in
 * development (build/csp.ts). Served by anything else, the placeholder is still there and there
 * is no nonce, which is right: there is no policy either.
 */

const PLACEHOLDER = /^__\w+__$/;

/** The nonce of this load, when the page was served with one. */
export function pageScriptNonce(doc: Document = document): string | undefined {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="slidr-script-nonce"]');
  const nonce = meta?.content.trim();
  return nonce && !PLACEHOLDER.test(nonce) ? nonce : undefined;
}

/** Hands the page's nonce to the renderer, for the frames of `html` objects with scripts. */
export function shareScriptNonce(): void {
  setFrameScriptNonce(pageScriptNonce());
}
