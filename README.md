# next-cms-boilerplate

Starting point for CMS-driven, full-SSR Next.js sites. Encodes the
performance/caching patterns proven in production (Netapp, sophos-home):
one-query-per-page fetching with batched enrichment, CDN-first caching with
purge-ready headers, and a CMS adapter seam so components never depend on the
CMS.

**Working on this repo with an AI agent? [`AGENTS.md`](./AGENTS.md) is the
operating manual** — architecture, invariants, and per-task playbooks
(add Vercel, add Akamai, implement Contentstack, add a new CMS).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in CMS credentials
npm run dev
```

Without credentials the site boots to a setup notice. To wire a real
Contentstack stack, follow [docs/playbooks/contentstack.md](./docs/playbooks/contentstack.md).

## What's inside

| Path | Purpose |
| ---- | ------- |
| `lib/cms/` | CMS adapter interface + Contentstack adapter (transport, retry, preview, normalize, enrichment) |
| `lib/content/` | The app's content API: provider-shaped queries + mapping to app types |
| `lib/cache/` | CDN cache headers, tag vocabulary, purge chain (no-op until a CDN is added) |
| `components/sections/` | Section registry + sample section (the per-project pattern to copy) |
| `app/[[...slug]]/` | Catch-all SSR route — one CMS query per page |
| `app/api/webhooks/cms/purge/` | CMS publish webhook → CDN purge pipeline |
| `proxy.ts` | Stamps CDN cache directives on every page response |
| `docs/playbooks/` | Step-by-step guides for extending the stack |

## Design decisions (short version)

- **Full SSR; the CDN is the only cache.** No ISR, no Next data cache — they
  can't be purged by CDN tag purges. Headers: `Cache-Control` (browser) +
  `CDN-Cache-Control` (any CDN), tunable via `CDN_CACHE_S_MAXAGE` /
  `CDN_CACHE_STALE_WHILE_REVALIDATE`.
- **One page = one GraphQL query** (kills the page→sections N+1). Connections
  that would blow provider limits are fetched uid-only and hydrated by a
  batched, parallel enrichment pass.
- **Adapter for connection, not for queries.** `CMS_PROVIDER` selects the
  adapter (endpoint/auth/preview/webhook mapping); query documents stay
  provider-native in `lib/content/queries/` — masking them was deliberate
  over-abstraction we rejected.
- **Purge-ready from day 0.** Responses carry purgeable-tag plumbing and the
  webhook route runs end-to-end as a structured no-op; adding Vercel/Akamai
  is a playbook, not a redesign.
