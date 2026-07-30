# Caching architecture

The design in one line: **every page renders dynamically (full SSR), and the
CDN — whichever ones a project adopts — is the only cache. Freshness comes from
publish-driven purges, with `stale-while-revalidate` as the safety net.**

## Why not Next's data cache / ISR?

Tag-based CDN purging is the freshness mechanism. Any cache the CDN purge
can't reach (Next data cache, `"use cache"`, ISR) keeps serving stale content
*behind* a purged CDN — the worst kind of staleness, invisible to operators.
So the Next data layer is bypassed entirely (`cache: "no-store"` on CMS
fetches) and request-level dedup is done with React `cache()` instead.

## The header stack

Each cache layer reads its own header, most-specific wins; a layer strips its
header before passing the response downstream.

| Layer            | Header                    | Who sets it                              |
| ---------------- | ------------------------- | ---------------------------------------- |
| Browser          | `Cache-Control`           | `proxy.ts` (Next may clobber on dynamic HTML — fine, browsers must revalidate) |
| Any CDN          | `CDN-Cache-Control`       | `proxy.ts` — **the load-bearing header** |
| Vercel only      | `Vercel-CDN-Cache-Control`| add-vercel playbook                      |
| Akamai only      | `Edge-Control`            | add-akamai playbook                      |

**Production-verified Next.js behavior**: on dynamically rendered
pages Next stamps browser `Cache-Control` itself and owns
`Vercel-CDN-Cache-Control`, but passes `CDN-Cache-Control` through untouched.
That is why `CDN-Cache-Control` is what keeps dynamic pages cacheable at CDNs.
Never remove it "because no CDN reads it yet".

All page headers are applied in ONE place: `proxy.ts` →
`applyCacheHeaders()` (`lib/cache/headers.ts`). Route handlers (feeds,
sitemaps) use `buildCacheHeaders()` with their own profile. Editor-preview
requests get `NO_STORE_PROFILE` (`private, no-store`) at every layer.

## TTL strategy (env: `CDN_CACHE_S_MAXAGE`, `CDN_CACHE_STALE_WHILE_REVALIDATE`)

- **No purge wired (boilerplate default)**: short fresh window
  (`s-maxage=300`) — editorial changes surface within 5 minutes — plus a LONG
  `stale-while-revalidate` (24 h). Long SWR is the origin shield: at expiry,
  stale serves coalesce concurrent traffic into one background revalidate, so
  neither the SSR origin nor the CMS API gets stampeded (CMS rate-limit 429s
  are a real production incident class on high-traffic CMS sites).
- **Purge wired (after a CDN playbook)**: raise `s-maxage` to 86400. Freshness
  is then event-driven; the long fresh window minimizes CMS egress.

## Cache tags

Tags connect **emission** (responses declare what they depend on) to
**purging** (a publish event invalidates exactly those responses).

- Vocabulary and charset rules: `lib/cache/tags.ts` (`cms-route-*`,
  `cms-entry-*`, `cms-ct-*`; lowercase, no colons — Akamai's restriction).
- Emission: `proxy.ts` computes the route tag on every page response, but tags
  are only written to headers listed in `TAG_HEADER_NAMES`
  (`lib/cache/headers.ts`) — **empty until a CDN playbook registers its header
  name** (`Vercel-Cache-Tag`, `Edge-Cache-Tag`, `Cache-Tag`).
- Today only the route tag is emitted. Entry-dependency tags (`cms-entry-*` on
  every page that embeds an entry) enable surgical purges but require knowing
  the page's entry graph at response time (typically a best-effort dependency
  fetch with a short timeout). Add that only when a project actually needs
  entry-level purging; route + content-type tags cover most sites.

## The purge chain (`lib/cache/purge.ts`)

`CMS webhook → app/api/webhooks/cms/purge → adapter.webhookToPurgeTargets()
→ purgeCdns()` — which runs each registered `CdnPurger` **sequentially,
origin-most first**.

Ordering rationale: request path is `browser → outer CDN → inner CDN →
origin`. If the outer layer purges first, it can immediately refill from the
still-stale inner layer and the stale copy survives a full TTL. Inner-first
closes the window. So with Vercel behind Akamai: `PURGERS = [vercel, akamai]`.

Webhook policies (production lessons, keep them):

- **Always 200 for authenticated well-formed events, even on purge failure.**
  Some CMSs disable a webhook after repeated 5xx retries (a failure mode
  observed in production) — losing ALL future purges to save one. The SWR
  window backstops a missed purge. Alert on the
  `[cms-purge-webhook] purge failure` error log.
- Purgers must resolve `{ ok: true, skipped: true }` when their credentials
  are missing (never throw), and retry transient 429/5xx with bounded backoff
  honoring `Retry-After`.
- Only publish/unpublish/delete purge. Draft saves and workflow events must
  not (cached content mirrors *published* state).

## CDN configuration facts (any CDN you put in front)

From `node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md` — re-read
it when integrating a CDN; the RSC scheme evolves:

- App Router varies responses on custom headers (`rsc`,
  `next-router-state-tree`, `next-router-prefetch`,
  `next-router-segment-prefetch`) and sets `Vary` accordingly. The `_rsc`
  search param is the cache-key discriminator for CDNs that ignore `Vary`.
- The CDN **must include the `_rsc` query param in its cache key** and must
  NOT strip query strings from cache keys, or RSC payloads and HTML will
  cross-contaminate (broken navigations).
- The `rsc` request header must be forwarded to origin, never stripped.
- A purge must cover both the HTML and RSC variants of a path — tag-based
  purging handles this naturally since both variants carry the same tags;
  URL-based purging must purge query-param variants too.
- `/_next/static/*` is content-hashed and immutable
  (`public, max-age=31536000, immutable`) — let the CDN cache it forever;
  no purging needed.
