# Playbook: adding Akamai

Follow this when Akamai fronts the site. Read `caching.md` first, and check
"Current stack state" in `AGENTS.md`: **if Vercel (or another inner CDN) is
already wired, Akamai chains ON TOP of it** — you are adding a layer, not
replacing one. Update the state section when done.

This playbook also serves as the template for any other CDN (Cloudflare,
Fastly, CloudFront): same three seams — a header tier, a tag header name, a
purger — only the provider APIs differ.

## 1. Headers — Edge-Control tier

Akamai does not natively honor `CDN-Cache-Control`; its authoritative header
is `Edge-Control`. In `lib/cache/headers.ts`:

- Emit `Edge-Control` derived from the CDN profile value:
  - cacheable → `!no-store, max-age=<s-maxage seconds>`
  - no-store profile → `no-store`
- The `!no-store` metadata directive forces caching even when an Akamai
  property rule marked the response uncacheable (e.g. a Cache-ID rule
  appending `cid=[not cachable]`) — this was required in a previous
  production deployment. Do NOT include `public` or `stale-while-revalidate`
  inside `Edge-Control`; SWR behavior is configured property-side.
- Keep `CDN-Cache-Control` emission unchanged — the inner CDN still reads it.
- Suggested shape: a `buildEdgeControlHeader(cdnCacheControl)` helper that
  parses the CDN profile string, returns `no-store` when it contains
  `no-store`, and otherwise `!no-store, max-age=<s-maxage, falling back to
  max-age>`.

## 2. Property (Akamai config) requirements

Coordinate with whoever owns the Akamai property:

- Cache key MUST include the query string — at minimum the `_rsc` param —
  or HTML and RSC payload variants cross-contaminate and client-side
  navigation breaks. Forward the `rsc` request header to origin unmodified.
  (Details: `caching.md` → "CDN configuration facts".)
- Honor `Edge-Control` from origin; respect origin `Vary` where possible.
- Restrict the purge-webhook path (`/api/webhooks/cms/purge`) to the CMS's
  egress IPs at the edge — defense in depth on top of the shared secret.
- Beware DOUBLE-CDN pitfalls: if the origin platform has its own CDN (Vercel,
  Contentstack Launch's Cloudflare), make sure only intended layers cache, and
  purge ALL of them (see §4).

## 3. Cache tags

Add `"Edge-Cache-Tag"` to `TAG_HEADER_NAMES` (`lib/cache/headers.ts`).
Akamai tag rules: https://techdocs.akamai.com/purge-cache/docs/assign-cache-tags
— charset is why `lib/cache/tags.ts` forbids colons; don't work around it.

## 4. Purger — Fast Purge v3, outermost position

Create `lib/cache/purgers/akamai.ts` implementing `CdnPurger`:

- API: Fast Purge v3 by cache tag, authenticated with **EdgeGrid** (Akamai's
  HMAC-SHA256 signature over a canonicalized request — implementable
  dependency-free with `node:crypto`; follow Akamai's EdgeGrid docs). Env
  vars: `AKAMAI_FAST_PURGE_HOST`, `AKAMAI_FAST_PURGE_CLIENT_TOKEN`,
  `AKAMAI_FAST_PURGE_CLIENT_SECRET`, `AKAMAI_FAST_PURGE_ACCESS_TOKEN`,
  optional `AKAMAI_FAST_PURGE_NETWORK` (production|staging).
- Hard delete for `CACHE_PURGE_MODE=delete` (default), soft invalidate for
  `invalidate` — mirror the mode the inner purger uses.
- Retry transient 429 ("TAG Rate Limit exceeded") and 5xx with bounded
  exponential backoff + jitter, honoring `Retry-After`, capped per-attempt so
  the webhook stays inside `maxDuration`. Missing credentials →
  `{ ok: true, skipped: true }`, never throw.
- Provision the EdgeGrid credential with ONLY the tag-purge scope.
- Register LAST in `PURGERS` — Akamai is outermost:
  `PURGERS = [vercelPurger, akamaiPurger]` (inner purges first so Akamai can't
  refill from a stale inner layer; rationale in `lib/cache/purge.ts`).

## 5. Verify

- Two curls against the Akamai edge hostname: MISS then HIT (check the
  property's cache-status debug headers, e.g. Pragma debug headers).
- Publish an entry → confirm BOTH layers refresh (fresh content through
  Akamai, and inner CDN also purged — not just masked by an Akamai MISS).
- Live-preview URL is never cached at the edge.
- A publish burst doesn't trip the tag rate limit into webhook failure loops
  (watch the `purge failure` log; remember the webhook must still return 200).
- With purge working end-to-end, raise `CDN_CACHE_S_MAXAGE` to `86400`.
