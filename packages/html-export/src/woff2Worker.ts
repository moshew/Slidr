import type * as Woff2 from 'woff2-encoder';

/*
 * The WOFF2 codec, in a worker of its own (ADR-066).
 *
 * The codec is WebAssembly with glue that builds its functions from text (`Function(...)`).
 * A page with a content policy refuses that unless the policy allows `'unsafe-eval'`, which
 * would allow it to every script of the page. A worker is not under the page's policy: its own
 * comes with its script, and the app serves scripts with none. So the codec runs here, where
 * what it compiles can reach neither the page nor the app's core, and the page's policy stays
 * without `'unsafe-eval'`. All that crosses is bytes of a font, in and out.
 */

export interface CodecRequest {
  id: number;
  op: 'compress' | 'decompress';
  bytes: Uint8Array;
  /** The address of the codec's module: the page knows it, the worker imports it. */
  codecUrl: string;
}

export type CodecReply =
  { id: number; bytes: Uint8Array<ArrayBuffer> } | { id: number; error: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<CodecRequest>) => void) | null;
  postMessage(message: CodecReply, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let codec: Promise<typeof Woff2> | undefined;

scope.onmessage = ({ data }) => {
  const { id, op, bytes, codecUrl } = data;
  codec ??= import(/* @vite-ignore */ codecUrl) as Promise<typeof Woff2>;
  codec
    .then((woff2) => woff2[op](bytes))
    .then(
      (result) => {
        const out = new Uint8Array(result);
        scope.postMessage({ id, bytes: out }, [out.buffer]);
      },
      (error: unknown) => {
        scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
      },
    );
};
