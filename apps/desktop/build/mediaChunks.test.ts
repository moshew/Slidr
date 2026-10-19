import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { catalogChunks } from './mediaChunks';
import { manifestOf } from './media';

type Worker = {
  fetch(
    request: Request,
    env: { ASSETS: { fetch(request: Request): Promise<Response> } },
    context?: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response>;
};

async function fixture() {
  // Boundaries deliberately split UTF-8 letters, just as a real multi-language catalog can.
  const bytes = Buffer.from(JSON.stringify({ copy: 'שלום 中文 हिन्दी '.repeat(20) }));
  const logical = new Map([
    ['elements/designs/index.json', bytes],
    ['fonts/small.json', Buffer.from('{}')],
  ]);
  const files = catalogChunks(logical, 73);
  const code = files.get('_worker.js')!.toString('utf8');
  const module = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )) as { default: Worker };
  const asked: string[] = [];
  const env = {
    ASSETS: {
      fetch(request: Request) {
        const path = new URL(request.url).pathname.slice(1);
        asked.push(path);
        const body = files.get(path);
        return Promise.resolve(
          new Response(body ? new Uint8Array(body) : null, { status: body ? 200 : 404 }),
        );
      },
    },
  };
  return { bytes, logical, files, worker: module.default, env, asked };
}

describe('oversized media catalogs', () => {
  it('streams exactly the manifest bytes across UTF-8 boundaries at the original URL', async () => {
    const f = await fixture();
    expect(f.files.has('elements/designs/index.json')).toBe(false);
    const parts = [...f.files].filter(([path]) => path.endsWith('.bin'));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every(([, bytes]) => bytes.length <= 73)).toBe(true);
    const manifest = manifestOf(f.logical, '2026-10-19');
    const pending: Promise<unknown>[] = [];
    const response = await f.worker.fetch(
      new Request('https://media.test/elements/designs/index.json'),
      f.env,
      { waitUntil: (promise) => pending.push(promise) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Length')).toBe(String(f.bytes.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(f.bytes);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(manifest.files['elements/designs/index.json']!.size).toBe(f.bytes.length);
    expect(Object.keys(manifest.files)).toEqual([
      'elements/designs/index.json',
      'fonts/small.json',
    ]);
    expect(JSON.parse(f.files.get('_routes.json')!.toString())).toEqual({
      version: 1,
      include: ['/elements/designs/index.json'],
      exclude: [],
    });
  });

  it('serves metadata, preflight and conditional requests without reading parts', async () => {
    const f = await fixture();
    const url = 'https://media.test/elements/designs/index.json';
    const head = await f.worker.fetch(new Request(url, { method: 'HEAD' }), f.env);
    expect(await head.text()).toBe('');
    expect(head.headers.get('Content-Length')).toBe(String(f.bytes.length));
    const unchanged = await f.worker.fetch(
      new Request(url, {
        headers: { 'If-None-Match': head.headers.get('ETag')! },
      }),
      f.env,
    );
    expect(unchanged.status).toBe(304);
    const weak = await f.worker.fetch(
      new Request(url, { headers: { 'If-None-Match': `"older", W/${head.headers.get('ETag')!}` } }),
      f.env,
    );
    expect(weak.status).toBe(304);
    expect((await f.worker.fetch(new Request(url, { method: 'OPTIONS' }), f.env)).status).toBe(204);
    expect((await f.worker.fetch(new Request(url, { method: 'POST' }), f.env)).status).toBe(405);
    expect(f.asked).toEqual([]);
  });

  it('forwards ordinary assets and fails closed when a catalog part is missing', async () => {
    const f = await fixture();
    const small = await f.worker.fetch(new Request('https://media.test/fonts/small.json'), f.env);
    expect(await small.text()).toBe('{}');
    const part = [...f.files.keys()].find((path) => path.endsWith('.bin'))!;
    f.files.delete(part);
    const response = await f.worker.fetch(
      new Request('https://media.test/elements/designs/index.json'),
      f.env,
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Content-Length')).toBe(false);
  });

  it('keeps small catalogs static and continues rejecting oversized non-JSON assets', () => {
    const small = new Map([['a.json', Buffer.from('{}')]]);
    expect(catalogChunks(small, 73)).toEqual(small);
    expect(() => catalogChunks(new Map([['a.webp', Buffer.alloc(74)]]), 73)).toThrow(
      /Cloudflare Pages/,
    );
    expect(() => catalogChunks(new Map([['a.json', Buffer.alloc(74)]]), 73)).toThrow();
  });
});
