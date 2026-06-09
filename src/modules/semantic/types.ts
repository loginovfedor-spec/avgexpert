export type SemanticNodeType = 'entity' | 'concept' | 'domain' | 'section';

export type SemanticEdgeType = 'mentions' | 'part_of' | 'related_to' | 'same_domain';

export type ExtractedEntity = {
  label: string;
  canonicalKey: string;
  nodeType: SemanticNodeType;
  source: 'metadata' | 'body' | 'glossary';
};

export type EntityExtractionInput = {
  body: string;
  bookTitle?: string;
  chapterTitle?: string;
  sectionTitle?: string;
  sectionPath?: string;
};

export type EntityExtractionResult = {
  entities: ExtractedEntity[];
  domainTags: string[];
};

export type SemanticNodeRecord = {
  id: string;
  namespace: string;
  nodeType: SemanticNodeType;
  label: string;
  canonicalKey: string;
  docId?: string;
  chunkId?: string;
  domainBoundaryId?: string;
  metadata?: Record<string, unknown>;
};

export type SemanticEdgeRecord = {
  id: string;
  namespace: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: SemanticEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
};

export type EntityExtractionQualityReport = {
  generatedAt: string;
  docCount: number;
  chunkCount: number;
  totalEntities: number;
  uniqueEntities: number;
  avgEntitiesPerChunk: number;
  domainTagCoverage: number;
  samples: Array<{
    docTitle: string;
    chunkIndex: number;
    entities: string[];
    domainTags: string[];
  }>;
  notes: string[];
};
