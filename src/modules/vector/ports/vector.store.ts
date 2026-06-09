import type { VectorChunk, VectorFilter, VectorHit, VectorSearchParams } from '../types';

export interface VectorStore {
  readonly id: string;
  upsert(chunks: VectorChunk[]): Promise<void>;
  search(params: VectorSearchParams): Promise<VectorHit[]>;
  delete(filter: VectorFilter): Promise<number>;
  health(): Promise<boolean>;
}
