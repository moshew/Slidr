import { isTauri } from '@tauri-apps/api/core';

/*
 * Links that lead out of the app: an address in the chat, the credit of a stock photo, a link in
 * the text of a slide while the deck is shown. The app's own window never navigates and opens no
 * second one, so in the app such a link is handed to the browser of the system (the opener
 * plugin, whose permission allows `http` and `https` and nothing else). A plain browser page
 * opens it in a tab, as browsers do.
 */

/** An address of the web: `http` or `https`, with a host. Nothing else leaves the app. */
export function isWebAddress(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '';
  } catch {
    return false;
  }
}

/** Opens a web address in the browser of the system. False when it is not one, or it failed. */
export async function openExternal(url: string): Promise<boolean> {
  if (!isWebAddress(url)) return false;
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener');
    return true;
  }
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return true;
  } catch (error) {
    console.error('The link could not be opened', error);
    return false;
  }
}

/** The link a click landed in, through shadow roots too: `html` elements live in one. */
function linkOf(event: MouseEvent): HTMLAnchorElement | undefined {
  return event
    .composedPath()
    .find(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.href !== '',
    );
}

/**
 * In the app: every click on a link to the web, anywhere in the window, goes to the browser of
 * the system instead of to the webview, and so does a script that opens a window on such an
 * address (the show opens the link of an element that way). Other links are left as they are.
 * Returns a function that undoes it. In a plain browser page there is nothing to do.
 */
export function installExternalLinks(): () => void {
  if (!isTauri()) return () => undefined;
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = linkOf(event);
    if (!link || !isWebAddress(link.href)) return;
    event.preventDefault();
    void openExternal(link.href);
  };
  const open = window.open.bind(window);
  window.open = (url, ...rest) => {
    const address = url === undefined ? '' : String(url);
    if (!isWebAddress(address)) return open(url, ...rest);
    void openExternal(address);
    return null;
  };
  document.addEventListener('click', onClick);
  return () => {
    document.removeEventListener('click', onClick);
    window.open = open;
  };
}
