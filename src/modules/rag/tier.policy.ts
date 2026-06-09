import type { RetrievalTier, VectorScope } from '../vector/types';

/** Глубина retrieval по tier; scopes одинаковы для всех ролей (без ограничений). */
export const TIER_TOP_K: Record<RetrievalTier, number> = {
  consultant: 3,
  expert: 7,
  sage: 12,
};

const DEFAULT_SCOPE_FLAGS = {
  globalKb: true,
  userKb: true,
  sessionKb: true,
};

export function normalizeTier(tier: string | undefined): RetrievalTier {
  if (tier === 'expert' || tier === 'sage') return tier;
  return 'consultant';
}

/**
 * Scopes не зависят от tier — пользователь свободно переключает категорию.
 * extra_params могут явно отключить scope; по умолчанию все включены.
 */
export function resolveScopes(
  _tier: RetrievalTier,
  extraParams: Record<string, unknown> = {}
): VectorScope[] {
  const scopes: VectorScope[] = [];

  const globalKb = extraParams.global_kb_enabled ?? DEFAULT_SCOPE_FLAGS.globalKb;
  const userKb = extraParams.user_kb_enabled ?? DEFAULT_SCOPE_FLAGS.userKb;
  const sessionKb = extraParams.session_kb_enabled ?? DEFAULT_SCOPE_FLAGS.sessionKb;

  if (globalKb === true || globalKb === 1) scopes.push('global');
  if (userKb === true || userKb === 1) scopes.push('user');
  if (sessionKb === true || sessionKb === 1) scopes.push('session');

  return scopes;
}

export function getTopK(tier: RetrievalTier): number {
  return TIER_TOP_K[tier] ?? TIER_TOP_K.consultant;
}
