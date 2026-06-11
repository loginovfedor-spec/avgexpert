/**
 * Hybrid RAG policy: effective RAG = category.rag_allowed AND user.rag_enabled.
 */

function isTruthyFlag(value, defaultWhenUndefined) {
  if (value === undefined || value === null) return defaultWhenUndefined;
  return value !== false && value !== 0;
}

function categoryRagAllowed(catSettings = {}) {
  const allowed = catSettings.rag_allowed ?? catSettings.rag_enabled;
  return isTruthyFlag(allowed, false);
}

function userRagEnabled(user = {}) {
  return isTruthyFlag(user.rag_enabled, true);
}

function isRagEffective(catSettings = {}, user = {}) {
  return categoryRagAllowed(catSettings) && userRagEnabled(user);
}

module.exports = {
  categoryRagAllowed,
  userRagEnabled,
  isRagEffective,
};
