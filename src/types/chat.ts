export type SourceReference = {
  ref: number;
  id: string;
  source: string;
  excerpt: string;
  denseScore?: number | null;
  bm25Score?: number | null;
  rrfScore?: number | null;
  crossScore?: number | null;
};

export type AvgExpertResponse = {
  answer: string;
  sources: SourceReference[];
  sourceFiles: string[];
  usage: Record<string, unknown> | null;
  model: string;
  provider: "openai" | "deepseek-compatible" | string;
  latencyMs: number;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};
