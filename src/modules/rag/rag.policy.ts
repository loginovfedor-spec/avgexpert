function isTruthyFlag(value: unknown, defaultWhenUndefined: boolean): boolean {
  if (value === undefined || value === null) return defaultWhenUndefined;
  return value !== false && value !== 0;
}

export function categoryRagAllowed(catSettings: Record<string, unknown> = {}): boolean {
  const allowed = catSettings.rag_allowed ?? catSettings.rag_enabled;
  return isTruthyFlag(allowed, false);
}

export function userRagEnabled(user: Record<string, unknown> = {}): boolean {
  return isTruthyFlag(user.rag_enabled, true);
}

export function isRagEffective(
  catSettings: Record<string, unknown> = {},
  user: Record<string, unknown> = {}
): boolean {
  return categoryRagAllowed(catSettings) && userRagEnabled(user);
}
