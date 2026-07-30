# Playbook: building a project on Contentful

The adapter (`lib/cms/contentful/`) is complete — implementing a project
means pointing it at a real space and replacing the SAMPLE content code.
Update "Current stack state" in `AGENTS.md` when the project is wired.

## 1. Wire the space

1. `cp .env.example .env.local`; fill `CONTENTFUL_SPACE_ID`,
   `CONTENTFUL_DELIVERY_TOKEN` (CDA), `CONTENTFUL_ENVIRONMENT` (default
   `master`); for draft preview add `CONTENTFUL_PREVIEW_TOKEN` (CPA) +
   `CONTENTFUL_PREVIEW_SECRET`.
2. Introspect the real schema before writing queries — don't guess field
   names. GraphiQL lives at
   `https://graphql.contentful.com/content/v1/spaces/<space>/explore?access_token=<CDA token>`,
   or POST an introspection query to the endpoint in
   `lib/cms/contentful/config.ts`.

### Fresh/empty space?

`node scripts/create-content-model.mjs --with-entries` (needs
`CONTENTFUL_MANAGEMENT_TOKEN` in `.env.local`) creates the sample model
(`flexiblePage` + `heroBanner`), seeds a published home page, and the app
renders end-to-end. Safe to re-run; skips anything that already exists.

## 2. Content model contract

The routing/caching design assumes the housing page type (`flexiblePage`)
stores its **FULL public path** in a `url` field (unique). That is what lets
the catch-all route resolve any URL with one `where: { url }` query and keeps
`proxy.ts` free of CMS fetches. Preserve this in new content models — the
pattern is inherited from a proven production architecture. If a
slug-only content type (blog, events…) is added later, put its prefix in a
route-prefix map; never resolve slugs with a fetch in proxy.

## 3. Replace the SAMPLE section code

Per new section content type:

1. Fragment in `lib/content/queries/fragments/<name>.ts`.
2. Inline `... on <Type>` spread + fragment registration in
   `lib/content/queries/page.ts`.
3. Component in `components/sections/<name>.tsx` typed against
   `types/contentful.ts`.
4. Registry entry in `components/sections/registry.tsx`
   (GraphQL `__typename` = PascalCase of the content-type id).

## 4. GraphQL shape (Content API)

- Multi-reference fields are collections: `<field>Collection { items }` —
  `flattenCollections` normalizes them to plain arrays post-fetch and drops
  `null` items (unresolvable/unpublished links arrive as nulls).
- Single references and assets are DIRECT objects (`image { url title }`) —
  no unwrapping, no connection shape.
- Entry identity is `sys { id }`; content type `X` gets GraphQL type `X`
  (PascalCase) and root field `xCollection`.
- Rich text fields return `{ json }` (plus `links` for embedded entries) —
  render with `@contentful/rich-text-react-renderer` when a project needs it.

## 5. Query limits — these shape every query

| Limit | Value | Consequence |
| ----- | ----- | ----------- |
| Query complexity | 11,000 per query | every collection without `limit:` defaults to 100 items and multiplies nested cost — put an explicit `limit:` on EVERY collection |
| Collection `limit` max | 1,000 | page through anything larger |
| Rate limit | 429 responses | client retries with backoff honoring `Retry-After` / `X-Contentful-RateLimit-Reset` automatically |

If a query trips the complexity limit, the error names the cost — fix by
lowering collection limits or pulling the offending collection out into the
enrichment pass (§6).

## 6. When a query hits the limits — the enrichment pattern

Fetch the offending collection SHALLOW in the main query, then hydrate it in
the batched enrichment pass. Worked example (a `blocks` field on a section
referencing mixed image/video/cta entries):

```graphql
# in the section fragment — shallow, capped
blocksCollection(limit: 50) {
  items {
    __typename
    ... on ImageBlock { sys { id } }
    ... on VideoBlock { sys { id } }
    ... on CtaBlock   { sys { id } }
  }
}
```

```ts
// lib/content/queries/by-id.ts — full-fat fetchers, one per content type
import { makeByIdFetcher } from "@/lib/cms/contentful";
export const getImagesByIds = makeByIdFetcher("imageBlock", "ImageBlockFields", [IMAGE_FRAGMENT]);
export const getVideosByIds = makeByIdFetcher("videoBlock", "VideoBlockFields", [VIDEO_FRAGMENT]);
export const getCtasByIds   = makeByIdFetcher("ctaBlock",   "CtaBlockFields",   [CTA_FRAGMENT]);

// lib/content/pages.ts
const ENRICHMENTS: EnrichmentConfig[] = [
  { collectionName: "blocks",
    fetchers: { ImageBlock: getImagesByIds, VideoBlock: getVideosByIds, CtaBlock: getCtasByIds } },
];
```

Why this beats inlining: the `<ct>Collection(where: { sys: { id_in } })`
follow-up is a NEW query root, so its complexity budget resets; ids are
deduped, chunked (≤50), and fetched in parallel — a whole page hydrates in
1 + ⌈ids/50⌉·types queries, not N per section.

## 7. Preview (draft content)

Server fetch path is wired: `?preview=<CONTENTFUL_PREVIEW_SECRET>` switches
the client to the Content Preview API token and flips the `$preview` variable
that every query threads into its collections
(`lib/cms/contentful/preview.ts`, `client.ts` — the client injects
`$preview` automatically). proxy.ts marks any `?preview=` request
`private, no-store`. Configure the preview URL pattern in Contentful →
Settings → Content preview, e.g. `https://<host>{entry.fields.url}?preview=<secret>`.
The Live Preview SDK (in-place editing) is NOT wired — add
`@contentful/live-preview` per-project only if editors need it.

## 8. Publish webhook

Contentful → Settings → Webhooks: POST to `/api/webhooks/cms/purge`,
filtered to Entry/Asset publish, unpublish, delete, archive events, with a
custom header `x-webhook-secret` = `CMS_WEBHOOK_SECRET`. The event kind
arrives in the `X-Contentful-Topic` header (the adapter reads it). Purging is
a no-op until a CDN playbook registers a purger, but wire the webhook from
day one so the pipeline is observable in logs.

## 9. Verify (runtime, against the real space)

- `/` and one nested path → 200 with sections rendered; unknown path → 404.
- `?preview=<secret>` on a page → draft content + `private, no-store` headers.
- Watch the dev console for GraphQL errors; complexity errors mean a
  collection needs the enrichment treatment (§6).
