# Playbook: adding a new CMS adapter (Contentful, Sanity, …)

The adapter seam exists so THIS is the whole cost of a CMS swap: one adapter
folder + rewritten queries/mappers. Components, routing, caching, and the
purge pipeline do not change. Update "Current stack state" in `AGENTS.md`
when done.

## What is deliberately NOT abstracted

Query documents. Every CMS has its own schema shape (Contentstack:
`all_x(where:{url}) { items }` + Relay connections; Contentful:
`xCollection(where:{url}) { items }` + `sys.id`; Sanity: GROQ, not GraphQL).
Masking that behind a query-builder was rejected as over-abstraction — devs/
agents write provider-native queries in `lib/content/queries/` and pass them
to `cmsQuery()`, which only routes them to the right endpoint with the right
auth. Budget for a query+mapper rewrite in any migration; components carry
over untouched.

## Steps

1. **Adapter folder** `lib/cms/<provider>/` implementing `CmsAdapter`
   (`lib/cms/types.ts`) — use `lib/cms/contentstack/` as the reference:
   - `config.ts` — lazy env reads (never throw at import time),
     `is<Provider>Configured()`.
   - `client.ts` — native-fetch transport: auth headers, `cache: "no-store"`,
     per-attempt timeout, retry 429/network with backoff honoring
     `Retry-After`, preview endpoint routing.
   - `preview.ts` — `getPreviewContext(searchParams)` minting the opaque
     `PreviewContext`, + cheap `hasPreviewSignal(URLSearchParams)` for proxy
     (Contentful: draft via `preview=true` + preview token; adjust to the
     provider's editor-preview mechanism).
   - `webhook.ts` — provider payload → neutral `PurgeTargets` (publish-class
     events only; drafts return empty targets).
   - `normalize.ts` — flatten the provider's response quirks ONCE here
     (e.g. Contentful collections → arrays, `sys` → `system`-like ids) so
     `lib/content` mappers stay thin.
   - `index.ts` — assemble + export the `CmsAdapter`.
2. **Register** it in `ADAPTERS` (`lib/cms/index.ts`); select with
   `CMS_PROVIDER=<provider>`; extend `.env.example`.
3. **Rewrite the content layer**: `lib/content/queries/*` in the provider's
   schema, and adjust `lib/content/pages.ts` mapping to keep emitting
   `types/content.ts` shapes. Components must not change — if one has to,
   the mapping layer is leaking.
4. **Preserve the invariants** (`AGENTS.md`): one-query-per-page against a
   full-URL page field; batched enrichment (port the pattern if the provider
   has depth/size limits — Contentful's complexity limits differ but the
   uid-only + bulk-hydrate trick translates); React `cache()` dedup; no Next
   data-layer caching.
5. **Webhook**: point the new CMS's publish webhook at
   `/api/webhooks/cms/purge` (same shared-secret header). Check the
   200-on-failure policy still matches the provider's retry/disable semantics
   (it was written for Contentstack's) — adjust the route comment if not.
6. **Playbook**: write `docs/playbooks/<provider>.md` in the mold of
   `contentstack.md` — env, schema quirks, query limits, preview, webhook —
   and add it to the task router table in `AGENTS.md`.

## Verify

Same bar as `contentstack.md` §9, plus: `npm run build` with NO provider env
vars must still succeed and render the setup notice (config must stay lazy).
