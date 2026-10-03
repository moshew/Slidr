/**
 * The capture page's side of conversion jobs (ADR-027): Rust names a job with
 * `window.__slidrJob(id)`, the page fetches it, runs the engine on it, and reports the result or
 * the engine's error.
 */
import { invoke } from '@tauri-apps/api/core';
import { runConversionJob, type ConversionEnvelope } from './conversion';

declare global {
  interface Window {
    __slidrJob?: (id: number) => void;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Starts listening for jobs. `inTurn` is the page's queue: a job draws its work surface over
 * the page, so it must not overlap a slide being drawn for a capture, or another job.
 */
export function listenForConversionJobs(inTurn: <T>(work: () => Promise<T>) => Promise<T>): void {
  window.__slidrJob = (id) => {
    void inTurn(async () => {
      const envelope = await invoke<ConversionEnvelope>('capture_job_take', { id });
      return runConversionJob(envelope);
    }).then(
      (result) => invoke('capture_job_done', { id, result, error: null }),
      (error: unknown) => invoke('capture_job_done', { id, result: null, error: message(error) }),
    );
  };
}
