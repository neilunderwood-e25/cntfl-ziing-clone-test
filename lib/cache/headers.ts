/**
 * CDN cache directives — the caching strategy of this codebase.
 *
 * This app is FULL SSR: every page renders dynamically and the CDN in front
 * of it (whichever one a project adopts) is the ONLY cache tier. We never
 * cache in the Next data layer (no `next: { tags }`, no `"use cache"`, no ISR)
 * because a Next-side cache cannot be purged by CDN tag purges and silently
 * serves stale content behind them.
 *
 * Header stack (each layer reads its own header and strips it downstream):
 *
 *   Browser   ← Cache-Control            (the only header browsers see)
 *   Any CDN   ← CDN-Cache-Control        (generic, honored by Vercel,
 *                                         Cloudflare, Fastly, …)
 *   +Vercel   ← Vercel-CDN-Cache-Control (add via docs/playbooks/add-vercel.md)
 *   +Akamai   ← Edge-Control             (add via docs/playbooks/add-akamai.md)
 *
 * CRITICAL Next.js fact (verified in production): on
 * dynamically rendered pages Next stamps the browser-facing Cache-Control to
 * `private, no-cache, no-store, …` — anything we set there is clobbered, and
 * that's fine (browsers should always revalidate HTML). Next also owns
 * Vercel-CDN-Cache-Control on dynamic renders. But it treats CDN-CACHE-CONTROL
 * AS AN OPAQUE PASS-THROUGH — which makes it the load-bearing header that
 * keeps dynamic pages cacheable at the CDN. Do not remove it on the theory
 * that "no CDN reads it yet".
 *
 * TTL strategy (env-tunable):
 *  - No purge mechanism wired (the boilerplate default): keep the fresh
 *    window SHORT — editorial changes only surface when it expires. Default
 *    s-maxage=300 (5 min) + long stale-while-revalidate so expiry never
 *    causes an origin stampede: stale serves coalesce concurrent traffic
 *    into a single background revalidate.
 *  - Once tag-based purge is wired (Vercel/Akamai playbooks): raise
 *    s-maxage to hours/a day. Freshness then comes from publish-driven
 *    purges, and a long fresh window minimises origin egress to the CMS
 *    (fewer rate-limit incidents).
 */

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export type CacheProfile = {
  /** Cache-Control (browser + fallback for CDNs without a specific header). */
  browser: string;
  /** CDN-Cache-Control (any CDN). */
  cdn: string;
};

/** HTML page profile. Reads env at call time so TTLs are deploy-tunable. */
export function pageCacheProfile(): CacheProfile {
  const sMaxAge = envInt("CDN_CACHE_S_MAXAGE", 300);
  const swr = envInt("CDN_CACHE_STALE_WHILE_REVALIDATE", 86_400);
  const cdn = `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
  return { browser: "public, max-age=0, must-revalidate", cdn };
}

/** Live preview / draft / personalised — never cached, at any layer. */
export const NO_STORE_PROFILE: CacheProfile = {
  browser: "private, no-store",
  cdn: "private, no-store",
};

/**
 * Response-header names that carry cache tags to a CDN. EMPTY by default —
 * the boilerplate has no CDN, so tags are computed but emitted nowhere.
 * The CDN playbooks add the provider's header name here (one line):
 *   Vercel → "Vercel-Cache-Tag"   Akamai → "Edge-Cache-Tag"   Cloudflare → "Cache-Tag"
 */
export const TAG_HEADER_NAMES: string[] = [];

/**
 * Apply the cache profile (+ cache tags, if any CDN tag headers are
 * registered) to an outgoing response's headers. Mutates in place.
 */
export function applyCacheHeaders(
  headers: Headers,
  profile: CacheProfile,
  tags: string[] = [],
): void {
  headers.set("Cache-Control", profile.browser);
  headers.set("CDN-Cache-Control", profile.cdn);
  if (tags.length > 0) {
    const value = tags.join(",");
    for (const name of TAG_HEADER_NAMES) headers.set(name, value);
  }
}

/**
 * Same directives as a plain header bag, for route handlers that construct
 * their Response directly (feeds, sitemaps, JSON endpoints).
 */
export function buildCacheHeaders(
  profile: CacheProfile,
  tags: string[] = [],
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {
    "Cache-Control": profile.browser,
    "CDN-Cache-Control": profile.cdn,
    ...extra,
  };
  if (tags.length > 0) {
    const value = tags.join(",");
    for (const name of TAG_HEADER_NAMES) out[name] = value;
  }
  return out;
}
