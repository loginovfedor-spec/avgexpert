export type Lang = 'ru' | 'en';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  docs?: AttachedDoc[];
  categoryName?: string;
  timestamp?: number;
}

export interface AttachedDoc {
  name: string;
  text?: string;
  tokens?: number;
  id?: string;
  status?: 'pending' | 'processing' | 'ready' | 'failed' | string;
  indexed?: boolean;
  sessionScoped?: boolean;
}

export interface CategoryData {
  provider?: string;
  rag_allowed?: boolean | number;
  sort_index?: number;
  suggested_questions?: string;
  complexity?: number | string;
  max_tokens?: number | string;
  input_context_default?: number | string;
  input_context_max?: number | string;
  retrieval_tier?: string;
  extra_params?: Record<string, unknown>;
  debug_mode?: boolean | number;
}

export interface AppUser {
  username?: string;
  email?: string;
  category?: string;
  is_admin?: boolean | number;
  is_blocked?: boolean | number;
  rag_enabled?: boolean | number;
  system_prompt?: string;
  tokens_allocated?: number;
  tokens_input_used?: number;
  tokens_output_used?: number;
  balance_usd?: number;
  credit_limit_usd?: number;
  cost_usd_used?: number;
  input_context_credits?: number;
  output_generation_credits?: number;
  n_ctx?: number;
  allowed_categories?: string[];
  expiration_date?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  category?: string;
}

export interface SessionData extends SessionSummary {
  messages?: ChatMessage[];
}

export interface AppState {
  lang: Lang;
  chatHistory: ChatMessage[];
  attachedDocs: AttachedDoc[];
  isGenerating: boolean;
  abortCtrl: AbortController | null;
  contextSize: number;
  maxDocsAllowed: number;
  currentUser: AppUser | null;
  authToken: string | null;
  currentSessionId: string | null;
  adminStatsInterval: ReturnType<typeof setInterval> | null;
  healthInterval: ReturnType<typeof setInterval> | null;
  inactivityTimeout: ReturnType<typeof setTimeout> | null;
  activityListenersBound: boolean;
  categories: Record<string, CategoryData>;
  welcomeHintsTimeout: ReturnType<typeof setTimeout> | null;
  isInactive?: boolean;
}

export interface AppSettings {
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  repeat_penalty: number;
  n_predict: number;
  n_ctx: number;
  api_key: string;
}

export type ToastVariant = 'success' | 'error' | 'info' | string;

export interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

export type I18nReplacements = Record<string, string | number>;

export interface BookEntry {
  title?: string;
  subtitle?: string;
  file?: string;
  order?: number;
}

export interface UserDocument {
  id: string;
  filename: string;
  status: string;
  size?: number | null;
}

export interface UserDocumentsResponse {
  documents?: UserDocument[];
  limit?: number;
  count?: number;
}
