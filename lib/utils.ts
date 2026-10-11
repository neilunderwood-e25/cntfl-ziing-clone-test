/** Split an array into chunks of at most `size`. */
export function arrayChunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * A URL already carrying a scheme, a protocol-relative "//", a fragment or a
 * leading "/" is authored as intended and passes through verbatim.
 */
const ABSOLUTE_OR_ROOTED = /^(?:[a-z][a-z\d+.-]*:|\/\/|[#/])/i;

/**
 * Normalize a CMS-authored external URL.
 *
 * One typed without a scheme ("ziing.com") is a RELATIVE path to the browser,
 * so it resolves against the page you are on rather than leaving the site —
 * ZING-675's "home url followed by the external one". Only a bare host needs
 * the scheme supplied. Returns "" when there is no URL, so callers can fall
 * through to their own empty-link handling.
 */
export function externalHref(url: string | null | undefined): string {
  const link = url?.trim();
  if (!link) return "";
  return ABSOLUTE_OR_ROOTED.test(link) ? link : `https://${link}`;
}
