export class InvalidLanguageTagError extends Error {
  override name = "InvalidLanguageTagError";

  constructor(readonly value: string) {
    super(`Invalid language tag: ${JSON.stringify(value)}`);
  }
}

export function canonicalizeLanguageTag(value: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new InvalidLanguageTagError(value);
  }

  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    if (canonical === undefined) {
      throw new InvalidLanguageTagError(value);
    }
    return canonical;
  } catch (error: unknown) {
    if (error instanceof InvalidLanguageTagError) {
      throw error;
    }
    throw new InvalidLanguageTagError(value);
  }
}
