const NAMED_CHARACTER_REFERENCES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  colon: ":",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  newline: "\n",
  quot: '"',
  tab: "\t",
};

/** Decode the HTML character references needed by text and URL consumers. */
export function decodeHtmlCharacterReferences(
  value: string,
  invalidCodePoint = "\ufffd",
): string {
  return value.replace(
    /&(?:#x([\da-f]+);?|#(\d+);?|([a-z]+);)/gi,
    (
      reference,
      hexadecimal: string | undefined,
      decimal: string | undefined,
      named: string | undefined,
    ) => {
      if (named !== undefined) {
        return NAMED_CHARACTER_REFERENCES[named.toLowerCase()] ?? reference;
      }
      const codePoint = Number.parseInt(
        hexadecimal ?? decimal ?? "",
        hexadecimal === undefined ? 10 : 16,
      );
      return isValidCodePoint(codePoint)
        ? String.fromCodePoint(codePoint)
        : invalidCodePoint;
    },
  );
}

function isValidCodePoint(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
  );
}
