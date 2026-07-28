<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent operating manual

This repo is a **boilerplate**: the starting point for CMS-driven, full-SSR
Next.js sites. It encodes hard-won production patterns (chiefly from the
Netapp project) so every new project starts on the right course. Your job when
working here is to **extend it along its designed seams** — the playbooks below
tell you exactly which seam each kind of task uses.

## Task router — read the playbook BEFORE writing code

| When the task is…                                        | Read first                          |
| -------------------------------------------------------- | ----------------------------------- |
| Anything touching caching, TTLs, or response headers      | `docs/playbooks/caching.md`         |
| Deploying to / integrating **Vercel** (headers, purge)    | `docs/playbooks/add-vercel.md`      |
| Putting **Akamai** in front (headers, Fast Purge)         | `docs/playbooks/add-akamai.md`      |
| Building a project on **Contentstack** (queries, limits)  | `docs/playbooks/contentstack.md`    |
| Adding a **new CMS** (Contentful, Sanity, …)              | `docs/playbooks/add-cms-adapter.md` |
| Adding another CDN (Cloudflare, Fastly, CloudFront, …)    | `docs/playbooks/add-akamai.md` — same seams, swap the provider's header/purge API |

After completing one of these integrations, **update the "Current stack state"
section below** — it is how the next agent (or you, months later) knows what is
already wired and how new layers must chain onto existing ones.

## Current stack state

> Maintained by agents. Update when you add/remove a CMS, CDN, or purge layer.

- **CMS**: `contentstack` adapter implemented (`lib/cms/contentstack/`), selected
  via `CMS_PROVIDER`. Not yet pointed at a real stack — the sample content model
  (`flexible_page` + `sample_section`) must be aligned to the project's model.
- **CDN layers (outermost first)**: none. Responses already carry
  `CDN-Cache-Control` so any CDN placed in front starts caching correctly.
- **Cache purge**: no-op. Webhook route exists and authenticates
  (`app/api/webhooks/cms/purge`), `PURGERS` in `lib/cache/purge.ts` is empty.
- **Cache tags**: computed per response (route tag), emitted to NO header yet
  (`TAG_HEADER_NAMES` is empty — CDN playbooks add their header name).
- **Hosting**: undecided. Nothing here assumes Vercel; `add-vercel.md` is the
  opt-in.

## Architecture — the three layers and their one-way dependencies

```
components/ + app/            render app-level types (types/content.ts)
        ↓ calls
lib/content/                  the app's content API: queries (provider-shaped,
                              by design) + mapping into app-level types
        ↓ calls
lib/cms/                      CmsAdapter interface + per-provider adapters
                              (transport, auth, retry, preview, shape quirks)
lib/cache/                    CDN headers, tags, purge chain (CMS-independent)
```

Rules that keep the boilerplate swappable:

1. **Components never import from `lib/cms/<provider>/` or mention a CMS.**
   They consume `types/content.ts` shapes handed to them by `lib/content/`.
2. **Queries are provider-specific ON PURPOSE.** We rejected masking query
   documents behind the adapter (over-abstraction — GraphQL schemas differ per
   CMS). Queries live in `lib/content/queries/` and are rewritten when the CMS
   changes; the adapter only routes them to the right endpoint with the right
   auth. Swap cost = queries + thin mappers, never components.
3. **`lib/cache/` knows nothing about any CMS** except the neutral
   `PurgeTargets` type. The adapter translates webhook payloads into it.

## Core invariants — do not regress these

- **Full SSR, CDN-cached.** NEVER cache in the Next data layer: no
  `next: { tags }`, no `"use cache"` / `unstable_cache`, no ISR `revalidate`.
  A Next-side cache can't be purged by CDN tag purges and silently serves
  stale content behind them. CMS fetches use `cache: "no-store"`.
- **One page = one query** (the N+1 fix). The page entry stores its FULL path
  in `url`; the catch-all route does a single `where: { url }` fetch. When
  provider limits force a connection out of the main query, it is fetched
  uid-only and hydrated by the **batched enrichment pass**
  (`lib/cms/contentstack/enrichment.ts`) — never by per-item fetches.
- **Request-level dedup with React `cache()`** (`lib/content/pages.ts`):
  `generateMetadata` + page render share one fetch. GraphQL POSTs are NOT
  memoized by Next's fetch memoization. Preview bypasses the cache.
- **`proxy.ts` stays fast**: no data fetching in it, ever (the full-URL lookup
  strategy exists precisely to avoid slug-resolution fetches there).
- **Preview responses are `private, no-store`** at every cache layer.
- **Purge webhook returns 200 even when a purge fails** (5xx makes
  Contentstack disable the webhook after repeated retries — worse than one
  missed purge). Alert on the `purge failure` error log instead.
- **Cache tags**: lowercase `[a-z0-9_-]`, no colons (Akamai's charset is the
  lowest common denominator). Always create tags via `lib/cache/tags.ts`.
- **No heavy CMS SDKs / Apollo.** The GraphQL client is a native-fetch POST
  with retry/backoff; queries are plain strings via the identity `gql` tag.

## Sample code you are expected to replace per project

Marked `SAMPLE` in-file: `lib/content/queries/fragments/sample-section.ts`,
the `SampleSection` spread in `lib/content/queries/page.ts`,
`components/sections/sample-section.tsx`, its entry in
`components/sections/registry.tsx`. The pattern (fragment → inline spread →
component → registry entry) is the contract; the fields are placeholders.

## Verification bar

- `npm run build` and `npm run lint` must pass.
- If you touched caching: `npm run build && npm run start`, then curl a page
  and assert the `CDN-Cache-Control` header (and `private, no-store` with
  `?live_preview=x`).
- If you touched the data layer against a real stack: verify a page URL
  returns 200 with sections rendered, and an unknown URL 404s.
