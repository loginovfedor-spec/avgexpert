import type { VectorScope } from '../vector/types';
import { KbRepository } from './kb.repository';
import { createIngestionPipeline } from '../ingestion/pipeline';

const MAX_RETRIES = 3;

export type IndexJobPayload = {
  docId: string;
  content: string;
  filename: string;
  mime?: string;
  title?: string;
  scope: VectorScope;
  ownerUserId?: string;
  sessionId?: string;
  docType?: string;
  sourceUri?: string;
};

type QueuedJob = IndexJobPayload & { attempt: number };

const queue: QueuedJob[] = [];
let processing = false;
let started = false;

async function processNext(): Promise<void> {
  if (processing) return;
  const job = queue.shift();
  if (!job) return;

  processing = true;
  try {
    const pipeline = createIngestionPipeline();
    const result = await pipeline.indexExistingDocument(job);

    if (result.status === 'failed' && job.attempt < MAX_RETRIES) {
      queue.push({ ...job, attempt: job.attempt + 1 });
    }
  } catch (_err) {
    const kbRepository = new KbRepository();
    await kbRepository.updateStatus(job.docId, 'failed');
    if (job.attempt < MAX_RETRIES) {
      queue.push({ ...job, attempt: job.attempt + 1 });
    }
  } finally {
    processing = false;
    if (queue.length > 0) {
      setImmediate(() => {
        void processNext();
      });
    }
  }
}

export function enqueueIndexJob(payload: IndexJobPayload): void {
  queue.push({ ...payload, attempt: 1 });
  setImmediate(() => {
    void processNext();
  });
}

export async function recoverStaleIndexJobs(): Promise<void> {
  const kbRepository = new KbRepository();
  // In-memory queue cannot survive restart; fail orphan pending/processing rows.
  await kbRepository.markStaleIngestJobs(0);
}

export function startIndexingQueue(): void {
  if (started) return;
  started = true;
  void recoverStaleIndexJobs();
}

