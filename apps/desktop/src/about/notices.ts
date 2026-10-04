/*
 * The third-party notices of this build (WG13-T05): a text file the build writes into its own
 * output (`build/notices.ts`), so the app carries the licences of what it is made from. In
 * development the dev server answers the same address with a note that says so.
 */

/** Where the file is, beside the app's pages. */
export const NOTICES_PATH = '/THIRD-PARTY-NOTICES.txt';

/** The notices, as text. Rejects when the build has none. */
export async function loadNotices(): Promise<string> {
  const response = await fetch(NOTICES_PATH);
  const type = response.headers.get('content-type') ?? '';
  // A dev server answers an unknown address with the app's page: that is not the file.
  if (!response.ok || type.includes('text/html')) {
    throw new Error(`${NOTICES_PATH} is not part of this build (${response.status})`);
  }
  return response.text();
}
