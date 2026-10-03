/**
 * What an imported file was refused (SPEC 13.3, IMP-08): the page that holds the file has a
 * content policy, the file inherits it, and the browser's own reports say what it stopped.
 * In a file of its own: the policy is put on the test page, and stays on it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createImportPage, type ImportPage } from './importPage';
import { testHost } from './testing';

const bytes = (html: string) => new TextEncoder().encode(html).buffer;

let open: ImportPage | undefined;

afterEach(() => {
  open?.dispose();
  open = undefined;
});

describe('what the page was refused', () => {
  it('is empty where no policy stands in the way', async () => {
    open = createImportPage({
      source: () => Promise.resolve(bytes('<!doctype html><p>Nothing to load</p>')),
      host: testHost(),
    });
    expect(open.refused()).toEqual([]);
    await open.load();
    expect(open.refused()).toEqual([]);
  });

  it('lists the addresses the policy stopped, the first script of the file included', async () => {
    // As the import window's page does it: no picture and no connection from the network.
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content =
      "img-src 'self' data: blob:; connect-src 'self' ws: wss: data: blob:; frame-src 'self' data: blob:";
    document.head.append(policy);

    const file = `<!doctype html><html><head>
      <script>fetch('https://example.org/early.json').catch(function () {});</script>
    </head><body>
      <img src="https://example.com/picture.png" alt="">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
      <iframe srcdoc="<img src='https://example.net/inner.png'>"></iframe>
    </body></html>`;
    open = createImportPage({ source: () => Promise.resolve(bytes(file)), host: testHost() });
    await open.load();
    await open.evaluate('await new Promise((done) => setTimeout(done, 300)); return 1');
    const refused = open.refused();
    expect(refused).toEqual(
      expect.arrayContaining([
        'https://example.org/early.json',
        'https://example.com/picture.png',
        // A frame inside the file is asked too.
        'https://example.net/inner.png',
      ]),
    );
    // What the file carries is not on the list, and asking twice does not double it.
    expect(refused.some((address) => address.startsWith('data:'))).toBe(false);
    expect(open.refused()).toHaveLength(refused.length);
  });
});
