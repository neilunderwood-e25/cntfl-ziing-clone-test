# Next.js policy (this repository)

This is an App Router, **full-SSR, CDN-cached** Next.js app. The caching
model is the defining constraint — read `docs/playbooks/caching.md` before
touching anything cache-adjacent.

## The caching invariant (enforced, error-level)

NEVER cache in the Next data layer:

- no `"use cache"` directive, no `unstable_cache`
- no `fetch(..., { next: { revalidate | tags } })`
- no `export const revalidate` (ISR) in route segments

A Next-side cache cannot be purged by CDN tag purges and silently serves
stale content behind them. CMS fetches use `cache: "no-store"`. The CDN owns
caching; `lib/cache/` owns the headers and purge chain.

## Server/client boundaries

- Server components are the default. Do not add `"use client"` unless
  browser-only behavior requires it, and never move code across the
  server/client boundary merely to simplify an implementation.
- Keep server-only code (CMS auth, tokens, purge secrets) out of client
  bundles.

## Established patterns — extend, don't parallel

- **One page = one query**: the catch-all route (`app/[[...slug]]/page.tsx`)
  does a single full-URL lookup. Collections that outgrow the main query are
  hydrated by the batched enrichment pass — never per-item fetches.
- **Request-level dedup** with React `cache()` lives in
  `lib/content/pages.ts`; `generateMetadata` and the page render share one
  fetch. Preview bypasses it.
- **`proxy.ts` stays fast**: no data fetching in it, ever (enforced).
- New sections follow the registry contract: fragment →
  spread in `lib/content/queries/page.ts` → component in
  `components/sections/` → entry in `components/sections/registry.tsx`.
- Respect the `@/*` path alias and existing import conventions.
- Preview responses are `private, no-store` at every layer.

Do not enforce a theoretical ideal Next.js architecture that conflicts with
this project. When Next.js knowledge from training data conflicts with
`node_modules/next/dist/docs/`, the local docs win.
