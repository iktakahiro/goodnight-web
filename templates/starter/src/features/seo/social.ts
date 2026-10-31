/** Converts a BCP 47 locale tag to the underscore format used by Open Graph. */
export function ogLocale(tag: string): string {
  return tag.replaceAll('-', '_');
}
