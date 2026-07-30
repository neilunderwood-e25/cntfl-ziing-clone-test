# Playbook: adding Vercel

Follow this when the project deploys to Vercel (alone, or as the inner layer
under Akamai/another CDN). Read `caching.md` first. When done, update
"Current stack state" in `AGENTS.md`.

## 1. Headers — add the Vercel-specific tier

In `lib/cache/headers.ts`:

- Extend `CacheProfile` with a `vercel` value and emit it as
  `Vercel-CDN-Cache-Control` in `applyCacheHeaders`/`buildCacheHeaders`.
  Start with the same value as `cdn`.
- **Known behavior** (production-verified on Netapp): Next.js owns
  `Vercel-CDN-Cache-Control` on dynamically rendered pages and may clobber
  what proxy sets. Vercel's CDN then falls back to `CDN-Cache-Control` — which
  we always send — so pages still cache correctly. Emit the Vercel header
  anyway (route handlers keep it, and it's the precise directive when it
  survives), but **verify with curl against a real deployment** and trust
  `CDN-Cache-Control` as the guarantee. Vercel strips both CDN headers before
  the browser sees the response.
- Header precedence at Vercel: `Vercel-CDN-Cache-Control` >
  `CDN-Cache-Control` > `Cache-Control`. Docs:
  https://vercel.com/docs/caching/cdn-cache

## 2. Cache tags

- Add `"Vercel-Cache-Tag"` to `TAG_HEADER_NAMES` in `lib/cache/headers.ts`.
  Tag purging docs: https://vercel.com/docs/caching/cdn-cache/purge
- Optionally also call `addCacheTag(...tags)` from `@vercel/functions` inside
  the page render (binds tags from the SSR function context; belt-and-braces
  alongside the response header). Only add the dependency when doing this.

## 3. Purger — first entry in the chain

Create `lib/cache/purgers/vercel.ts` implementing `CdnPurger`:

- **Delete mode (default)**: `dangerouslyDeleteByTag(tag)` from
  `@vercel/functions` — next request synchronously refetches origin.
  `revalidateTag(tag, { expire: 0 })` is the soft alternative but was observed
  serving stale RSC payloads for the full SWR window after publish — use
  delete unless origin-spike is a real concern (make it env-switchable,
  `CACHE_PURGE_MODE=invalidate`).
- Resolve `{ ok: true, skipped: true }` when not running on Vercel (no
  `VERCEL` env) instead of throwing.
- Register it in `PURGERS` (`lib/cache/purge.ts`). Vercel is origin-most, so
  it goes **before** any outer CDN: `PURGERS = [vercelPurger /*, akamai… */]`.

## 4. Vercel platform config

- `vercel.ts` (the current config format — `@vercel/config`) or dashboard:
  no special routing needed; proxy.ts and route handlers own the headers.
- Raise the webhook route's headroom only if purger retries need it
  (`maxDuration` is already 30).
- Env vars: set everything in `.env.example` via `vercel env`.

## 5. Verify

- `curl -sI https://<deployment>/<page>` → first hit `x-vercel-cache: MISS`,
  second `HIT`; confirm no `private, no-store` on public pages.
- Publish an entry in the CMS → webhook fires → next request is `MISS` with
  fresh content, then `HIT` again.
- `?preview=x` request → never cached (`x-vercel-cache: MISS/BYPASS`
  every time).
- Raise `CDN_CACHE_S_MAXAGE` to `86400` now that purge-driven freshness works.
