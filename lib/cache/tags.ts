/**
 * Cache tag vocabulary — shared between tag EMISSION (proxy.ts / route
 * handlers attach tags to responses) and tag PURGING (the CMS webhook maps a
 * publish event to the same tags).
 *
 * Format rules (lowest common denominator across CDNs — Akamai is the
 * strictest): lowercase, `[a-z0-9_-]` only, NO COLONS (Akamai rejects them),
 * no spaces. Keep every tag flowing through `sanitize()` so a new tag kind
 * can't violate this by accident.
 *
 * Vocabulary:
 *   cms-route-<path>  — one public URL's cached response(s), HTML + RSC.
 *   cms-entry-<uid>   — every response that embedded CMS entry <uid>.
 *   cms-ct-<uid>      — every response tagged with content type <uid>
 *                       (coarse; reserved for operator sweeps / global types).
 */

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function tagRoute(path: string): string {
  const slug = sanitize(path);
  return `cms-route-${slug || "index"}`;
}

export function tagEntry(uid: string): string {
  return `cms-entry-${sanitize(uid)}`;
}

export function tagContentType(uid: string): string {
  return `cms-ct-${sanitize(uid)}`;
}
