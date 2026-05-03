/**
 * watchExtractionJob — promise wrapper around a Firestore onSnapshot listener
 * for an extraction job document.
 *
 * Replaces the per-component setInterval polling that hammered
 * `getExtractionJob` every 500ms–2s during PDF/receipt processing. The
 * backend mirrors every JobStore Create/Update to `extractionJobs/{jobId}`
 * (see backend cmd/server/main.go SetJobPublisher), so we listen there
 * instead. Resolves when the job hits COMPLETED, rejects on FAILED or
 * timeout, and unsubscribes in every terminal path including caller cancel.
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExtractionStatus, type ExtractionJob } from '@/gen/pfinance/v1/types_pb';

export interface WatchExtractionJobOptions {
  /** Reject after this many ms if the job hasn't completed. Default 90s. */
  timeoutMs?: number;
  /** Polling-cancel signal — caller flips this to abort. */
  isCancelled?: () => boolean;
}

/**
 * Watches an extraction job until it's COMPLETED, FAILED, or timed out.
 * Returns the final ExtractionJob proto (matching the GetExtractionJob RPC
 * response shape) on success.
 *
 * Note: Firestore documents store proto fields with PascalCase keys (the
 * backend writes the proto directly via `.Set(ctx, job)`), so the snapshot
 * data shape mirrors the proto JSON. Cast through unknown to ExtractionJob
 * — runtime shape matches because backend writes the same proto type.
 */
export function watchExtractionJob(
  jobId: string,
  opts: WatchExtractionJobOptions = {},
): Promise<ExtractionJob> {
  const { timeoutMs = 90_000, isCancelled } = opts;

  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Firestore not configured'));
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (unsub) { unsub(); unsub = null; }
      if (timer) { clearTimeout(timer); }
      if (cancelInterval) { clearInterval(cancelInterval); cancelInterval = null; }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Extraction timed out'));
    }, timeoutMs);

    // Cancel-poll: caller can flip a ref to abort. Cheap (no backend traffic).
    if (isCancelled) {
      cancelInterval = setInterval(() => {
        if (isCancelled()) {
          cleanup();
          reject(new Error('cancelled'));
        }
      }, 250);
    }

    unsub = onSnapshot(
      doc(db, 'extractionJobs', jobId),
      (snap) => {
        if (!snap.exists()) return;
        const job = snap.data() as unknown as ExtractionJob;
        if (job.status === ExtractionStatus.COMPLETED && job.result) {
          cleanup();
          resolve(job);
        } else if (job.status === ExtractionStatus.FAILED) {
          cleanup();
          reject(new Error(job.errorMessage || 'Extraction failed'));
        }
      },
      (err) => {
        cleanup();
        reject(err);
      },
    );
  });
}
