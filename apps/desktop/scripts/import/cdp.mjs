// Development helper: connects to the app the HTML import track runs from this working tree
// (WebView2 CDP on port 9271) and hands back its pages. Not part of the app.
import { chromium } from '@playwright/test';

export const CDP = 'http://localhost:9271';
export const APP = 'http://localhost:1471';

export async function connect() {
  const browser = await chromium.connectOverCDP(CDP);
  const pages = () => browser.contexts().flatMap((context) => context.pages());
  const at = (path) => pages().find((page) => new URL(page.url()).pathname === path);
  return {
    browser,
    pages,
    /** The editor's window. */
    main: () => at('/'),
    /** The hidden import window, once a job has created it. */
    importPage: () => at('/import.html'),
    find: (part) => pages().find((page) => page.url().includes(part)),
  };
}
