/**
 * Whether XML 1.0 allows the code point. It forbids most C0 controls and
 * U+FFFE/U+FFFF; a feed that contains one is rejected by strict readers.
 */
function isXmlChar(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

/**
 * Escapes text for use in XML element content or a double- or single-quoted
 * attribute value, and drops characters that XML 1.0 cannot represent
 * (including lone surrogates).
 */
export function escapeXml(value: string): string {
  // Iterating a string yields whole code points; a lone surrogate comes out
  // alone and fails the range check.
  const text = Array.from(value)
    .filter((char) => isXmlChar(char.codePointAt(0) ?? 0))
    .join('');
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
