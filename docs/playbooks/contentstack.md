# Playbook: building a project on Contentstack

The adapter (`lib/cms/contentstack/`) is complete — implementing a project
means pointing it at a real stack and replacing the SAMPLE content code.
Update "Current stack state" in `AGENTS.md` when the project is wired.

## 1. Wire the stack

1. `cp .env.example .env.local`; fill `CONTENTSTACK_API_KEY`,
   `CONTENTSTACK_DELIVERY_TOKEN`, `CONTENTSTACK_ENVIRONMENT`,
   `CONTENTSTACK_BRANCH` (+ `CONTENTSTACK_PREVIEW_TOKEN` for live preview).
2. **Gotcha**: `CONTENTSTACK_ENVIRONMENT` must be the stack's real environment
   name (stacks often use `dev`, not `main`). A wrong name surfaces as REST
   422 "Environment was not found" / GraphQL 401 `AUTHENTICATION_FAILURE`.
3. Introspect the real schema against the delivery endpoint before writing
   queries — don't guess field names:
   `{"query":"{ __type(name: \"<PascalCaseType>\") { fields { name type { name } } } }"`
   POSTed to `https://graphql.contentstack.com/stacks/<api_key>?environment=<env>`
   with header `access_token: <delivery token>`.

### Fresh/empty stack?

`node scripts/create-content-model.mjs --with-entries` (needs
`CONTENTSTACK_MANAGEMENT_TOKEN` in `.env.local`) creates the sample model
(`flexible_page` + `hero_banner`), seeds a published home page, and the app
renders end-to-end. Safe to re-run; skips anything that already exists.

## 2. Content model contract

The routing/caching design assumes the housing page type (`flexible_page`)
stores its **FULL public path** in a `url` field. That is what lets the
catch-all route resolve any URL with one `where: { url }` query and keeps
`proxy.ts` free of CMS fetches. Preserve this in new content models. If a
slug-only content type (blog, events…) is added later, put its prefix in a
route-prefix map and only then consider preview-time rewrites — never an
unconditional GraphQL fetch in proxy.

## 3. Replace the SAMPLE section code

Per new section content type:

1. Fragment in `lib/content/queries/fragments/<name>.ts`.
2. Inline `... on <Type>` spread + fragment registration in
   `lib/content/queries/page.ts`.
3. Component in `components/sections/<name>.tsx` typed against
   `types/contentstack.ts`.
4. Registry entry in `components/sections/registry.tsx`
   (GraphQL `__typename` = PascalCase of the content-type uid).

## 4. GraphQL shape quirks (Delivery GraphQL API)

- EVERY reference/modular/asset field is a Relay connection
  `<field>Connection { edges { node } }` — `flattenConnections` normalizes all
  of them to arrays post-fetch (single refs become 1-element arrays).
- Group fields get types `<Type><Group>` (e.g. `ImageImage`, `CtaPopup`);
  `link` fields are direct `Link { title href }`; asset nodes are
  `SysAsset { url title filename content_type dimension }`.
- Assets COUNT AS A REFERENCE HOP (they're `SysAssetConnection`).

## 5. Hard query limits — these shape every query

| Limit | Value | Consequence |
| ----- | ----- | ----------- |
| `MAX_REFERENCE_DEPTH` | 3 | `page →1 section →2 block →3 asset` is the max; anything deeper must be fetched shallow + enriched |
| `MAX_RESOLVER_COST` | 20 | put `limit:` on every **multiple**-reference connection (unbounded defaults ~100 and multiplies through nesting) |
| `MAX_DOCUMENT_LIMIT` | 7500 per query | same fix: `limit:` everything multiple |
| `uid_in` filter size | 25 | `makeByUidFetcher` already chunks |

- `limit:` is ONLY valid on multiple-reference connections; single refs and
  asset connections REJECT it (`Unknown argument "limit"`).
- Cost/document validation runs BEFORE field-existence validation — fix limit
  errors first, then real field errors surface.
- 429s: the client retries with backoff + `Retry-After` automatically.

## 6. When a query hits the limits — the enrichment pattern

Fetch the offending connection UID-ONLY in the main query, then hydrate it in
the batched enrichment pass. Worked example (a `blocks` field on a section
referencing image|video|cta entries):

```graphql
# in the section fragment — uid-only, capped
blocksConnection(limit: 50) {
  edges { node { __typename
    ... on Image { system { uid content_type_uid } }
    ... on Video { system { uid content_type_uid } }
    ... on Cta   { system { uid content_type_uid } }
  } }
}
```

```ts
// lib/content/queries/by-uid.ts — full-fat fetchers, one per content type
import { makeByUidFetcher } from "@/lib/cms/contentstack";
export const getImagesByUids = makeByUidFetcher("image", "ImageFields", [IMAGE_FRAGMENT]);
export const getVideosByUids = makeByUidFetcher("video", "VideoFields", [VIDEO_FRAGMENT]);
export const getCtasByUids   = makeByUidFetcher("cta",   "CtaFields",   [CTA_FRAGMENT]);

// lib/content/pages.ts
const ENRICHMENTS: EnrichmentConfig[] = [
  { connectionName: "blocks",
    fetchers: { Image: getImagesByUids, Video: getVideosByUids, Cta: getCtasByUids } },
];
```

Why this beats inlining: the `all_<ct>(where:{uid_in})` follow-up is a NEW
query root, so reference depth resets and each content type's asset tree fits
inside depth 3; uids are deduped, chunked (≤25), and fetched in parallel —
a whole page hydrates in 1 + ⌈uids/25⌉·types queries, not N per section.

## 7. Live preview

Server fetch path is wired: `?live_preview=<hash>` routes to the preview host
with `preview_token` + `live_preview` headers and bypasses the request cache
(`lib/cms/contentstack/preview.ts`, `client.ts`). proxy.ts marks those
responses `private, no-store`. The client-side Live Preview SDK (in-place
edit highlighting) is NOT wired — add `@contentstack/live-preview-utils`
per-project only if editors need it.

## 8. Publish webhook

Point a Contentstack webhook (publish/unpublish/delete events, concise payload
off) at `POST /api/webhooks/cms/purge` with a custom header `x-webhook-secret`
matching `CMS_WEBHOOK_SECRET`. Purging is a no-op until a CDN playbook
registers a purger, but wire the webhook from day one so the pipeline is
observable in logs.

## 9. Verify (runtime, against the real stack)

- `/` and one nested path → 200 with sections rendered; unknown path → 404.
- `?live_preview=x…` on a page → draft content + `private, no-store` headers.
- Watch the dev console for GraphQL errors; depth/cost errors mean a fragment
  needs the enrichment treatment (§6).
