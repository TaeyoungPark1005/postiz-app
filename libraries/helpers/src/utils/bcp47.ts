export const normalizeBcp47Language = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return Intl.getCanonicalLocales(value.trim())[0] || null;
  } catch {
    return null;
  }
};
