const DEFAULT_MAX_DOCS_BY_CATEGORY: Record<string, number> = {
  'Консультант': 3,
  'Эксперт': 5,
  'Мудрец': 10,
};

export function getUserKbMaxDocs(category: string | undefined, envMax?: number): number {
  if (envMax != null && Number.isFinite(envMax) && envMax > 0) {
    return envMax;
  }
  if (category && DEFAULT_MAX_DOCS_BY_CATEGORY[category] != null) {
    return DEFAULT_MAX_DOCS_BY_CATEGORY[category];
  }
  return 3;
}

module.exports = { getUserKbMaxDocs, DEFAULT_MAX_DOCS_BY_CATEGORY };
