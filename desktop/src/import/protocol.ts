/**
 * What travels between the editor and the import page (SPEC 13.3). Rust carries both ways as
 * opaque JSON (`import_run_job`); in a plain browser the same jobs run in the page itself.
 */
import type {
  ImportCaptureRequest,
  ImportPage,
  ImportTarget,
  ImportViewport,
} from '@slidr/html-import';

export type ImportJob =
  | { kind: 'load' }
  | { kind: 'inspect'; request: ImportTarget & { depth?: number; maxNodes?: number } }
  | { kind: 'evaluate'; code: string }
  | { kind: 'screenshot'; request: ImportTarget & { maxWidth?: number } }
  | { kind: 'viewport'; size: ImportViewport }
  | { kind: 'refused' }
  | { kind: 'capture'; request: ImportCaptureRequest };

/** A picture as a job returns it: the PNG in base64. */
export interface JobPicture {
  data: string;
  width: number;
  height: number;
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Runs one job on an import page. What it returns is JSON. */
export async function runImportJob(page: ImportPage, job: ImportJob): Promise<unknown> {
  switch (job.kind) {
    case 'load':
      await page.load();
      return null;
    case 'inspect':
      return page.inspect(job.request);
    case 'evaluate':
      return page.evaluate(job.code);
    case 'screenshot': {
      const shot = await page.screenshot(job.request);
      const picture: JobPicture = {
        data: await base64(shot.png),
        width: shot.width,
        height: shot.height,
      };
      return picture;
    }
    case 'viewport':
      return page.setViewport(job.size);
    case 'refused':
      return page.refused();
    case 'capture':
      return page.capture(job.request);
  }
}
