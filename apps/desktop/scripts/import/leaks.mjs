// Proof by a listening server: every way a page can reach the network is tried from inside the
// frame of the import window against a server on this machine, which writes down what arrives.
// Nothing should. An import session must be open.
//   node scripts/import/leaks.mjs
import { createServer } from 'node:http';
import { connect } from './cdp.mjs';

const seen = [];
const server = createServer((request, response) => {
  seen.push(`${request.method} ${request.url}`);
  response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' });
  response.end('reached');
});
server.on('upgrade', (request, socket) => {
  seen.push(`UPGRADE ${request.url}`);
  socket.destroy();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const { browser, main, importPage } = await connect();
const page = importPage();
if (!page) throw new Error('the import window is not open: start an import first');

const tried = await page.evaluate(async (base) => {
  if (!document.querySelector('iframe[data-slidr-import]')) await window.__slidrImport.page.load();
  const frame = document.querySelector('iframe[data-slidr-import]');
  const view = frame.contentWindow;
  const doc = frame.contentDocument;
  const out = {};
  const attempt = async (name, work) => {
    try {
      out[name] = String(
        await Promise.race([work(), new Promise((r) => setTimeout(() => r('no answer'), 2500))]),
      );
    } catch (error) {
      out[name] = `threw ${error?.name ?? error}`;
    }
  };
  await attempt('fetch', async () => (await view.fetch(`${base}/fetch`)).status);
  await attempt(
    'fetch keepalive',
    async () => (await view.fetch(`${base}/keepalive`, { keepalive: true })).status,
  );
  await attempt(
    'fetch no-cors',
    async () => (await view.fetch(`${base}/no-cors`, { mode: 'no-cors' })).type,
  );
  await attempt(
    'xhr',
    () =>
      new Promise((resolve) => {
        const xhr = new view.XMLHttpRequest();
        xhr.onload = () => resolve(xhr.status);
        xhr.onerror = () => resolve('error');
        xhr.open('GET', `${base}/xhr`);
        xhr.send();
      }),
  );
  await attempt('sendBeacon', async () => view.navigator.sendBeacon(`${base}/beacon`, 'x'));
  await attempt(
    'img',
    () =>
      new Promise((resolve) => {
        const img = doc.createElement('img');
        img.onload = () => resolve('loaded');
        img.onerror = () => resolve('error');
        img.src = `${base}/img.png`;
      }),
  );
  await attempt('css background', async () => {
    const box = doc.createElement('div');
    box.style.cssText = `width:10px;height:10px;background:url(${base}/background.png)`;
    doc.body.append(box);
    await new Promise((r) => setTimeout(r, 800));
    box.remove();
    return 'set';
  });
  await attempt('font face', async () => {
    const face = new view.FontFace('LeakProbe', `url(${base}/font.woff2)`);
    try {
      await face.load();
      return 'loaded';
    } catch {
      return 'failed';
    }
  });
  await attempt('link prefetch', async () => {
    for (const rel of ['prefetch', 'preload', 'dns-prefetch', 'preconnect', 'modulepreload']) {
      const link = doc.createElement('link');
      link.rel = rel;
      if (rel === 'preload') link.as = 'image';
      link.href = `${base}/link-${rel}`;
      doc.head.append(link);
    }
    await new Promise((r) => setTimeout(r, 1200));
    return 'added';
  });
  await attempt('a ping', async () => {
    const a = doc.createElement('a');
    a.href = '#leak-probe';
    a.ping = `${base}/ping`;
    doc.body.append(a);
    a.click();
    await new Promise((r) => setTimeout(r, 800));
    a.remove();
    return 'clicked';
  });
  await attempt(
    'websocket',
    () =>
      new Promise((resolve) => {
        const socket = new view.WebSocket(`${base.replace('http', 'ws')}/socket`);
        socket.onopen = () => resolve('opened');
        socket.onerror = () => resolve('error');
      }),
  );
  await attempt(
    'event source',
    () =>
      new Promise((resolve) => {
        const source = new view.EventSource(`${base}/events`);
        source.onopen = () => resolve('opened');
        source.onerror = () => {
          source.close();
          resolve('error');
        };
      }),
  );
  await attempt('worker', async () => {
    const code = `fetch(${JSON.stringify(`${base}/worker-fetch`)}).then(r => postMessage(r.status), e => postMessage('error'))`;
    const worker = new view.Worker(
      URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
    );
    return new Promise((resolve) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = () => resolve('worker error');
    });
  });
  await attempt('form to a new target', async () => {
    const form = doc.createElement('form');
    form.action = `${base}/form`;
    form.method = 'post';
    form.target = '_blank';
    doc.body.append(form);
    form.submit();
    await new Promise((r) => setTimeout(r, 800));
    form.remove();
    return 'submitted';
  });
  await attempt('nested frame', async () => {
    const inner = doc.createElement('iframe');
    inner.src = `${base}/frame`;
    doc.body.append(inner);
    await new Promise((r) => setTimeout(r, 1200));
    inner.remove();
    return 'added';
  });
  await attempt(
    'from the engine page itself',
    async () => (await fetch(`${base}/parent-fetch`)).status,
  );
  await attempt('webrtc', async () => {
    if (!view.RTCPeerConnection) return 'no RTCPeerConnection';
    const peer = new view.RTCPeerConnection({
      iceServers: [{ urls: `stun:127.0.0.1:${new URL(base).port}` }],
    });
    peer.createDataChannel('x');
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise((r) => setTimeout(r, 1500));
    const candidates = (peer.localDescription?.sdp.match(/a=candidate/g) ?? []).length;
    peer.close();
    return `offer made, ${candidates} candidates`;
  });
  return out;
}, base);

await new Promise((resolve) => setTimeout(resolve, 2500));
const blocked = await main().evaluate(() => window.__TAURI_INTERNALS__.invoke('import_blocked'));
for (const [name, result] of Object.entries(tried)) console.log(`${name.padEnd(28)} ${result}`);
console.log(`\nthe server on ${base} saw ${seen.length} requests:`);
for (const line of seen) console.log(`  ${line}`);
console.log('\nRust wrote down as refused:');
for (const url of blocked.filter((u) => u.startsWith(base)))
  console.log(`  ${url.slice(base.length)}`);
await browser.close();
server.close();
process.exit(seen.length ? 1 : 0);
