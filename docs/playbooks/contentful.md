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
(`flexiblePage` + `heroBanner`) and seeds two published pages: `/` selects
`heroWithBanner`; `/sample-cta` selects `heroWithCTA`. Both use the same Hero
content type. Existing models and entries are not migrated automatically.
An older `heroBanner` without a usable `frontendComponent` field stops the
script with migration instructions. Foundry itself does not run this seeder;
the backend team owns models, entries, and publishing.

## 2. Content model contract

The routing/caching design assumes the housing page type (`flexiblePage`)
stores its **FULL public path** in a `url` field (unique). That is what lets
the catch-all route resolve any URL with one `where: { url }` query and keeps
`proxy.ts` free of CMS fetches. Preserve this in new content models — the
pattern is inherited from a proven production architecture. If a
slug-only content type (blog, events…) is added later, put its prefix in a
route-prefix map; never resolve slugs with a fetch in proxy.

## 3. Section families and frontend variants

The boilerplate includes the reusable pattern from
[`cntfl-eight25corporate`](https://github.com/825media/cntfl-eight25corporate/tree/4d9f3301f4eaf60e1b4999714df847fb6b64ff83/components/sections/hero):

`Contentful type → __typename registry → family → frontendComponent → variant`

The sample `heroBanner` type has GraphQL typename `HeroBanner`, registered as
the `Hero` family. Its `frontendComponent` Symbol field allows exactly
`heroWithBanner` and `heroWithCTA`. These are example values, not naming rules
for other projects. The backend team maintains each real model and its values;
Foundry discovers them using CMA + Delivery. Preserve the actual values,
including spaces and capitalization, without inventing aliases or updating
the CMS to match a folder name.

```text
lib/content/enum.ts                         # exact typenames + variant values
lib/content/types.ts                        # unions derived from the constants
types/contentful.ts                         # normalized family data
lib/content/queries/fragments/hero-banner.ts # HeroFields + dependency list
lib/content/queries/page.ts                 # one page operation
components/sections/registry.tsx             # HeroBanner → Hero
components/sections/hero/index.tsx           # variant dispatcher
components/sections/hero/heroWithBanner/index.tsx
components/sections/hero/heroWithCTA/index.tsx
```

### Add a variant to an existing family

1. Confirm the exact `frontendComponent` value and required fields in the CMS.
2. Add the value to the family's constant in `lib/content/enum.ts`. The union
   in `lib/content/types.ts` derives from it.
3. Extend the family's queried/normalized type as needed. Query the union of
   fields used by all built variants; never remove a sibling's required fields.
4. Add a sibling variant folder and its `case` in the family dispatcher.
   Variants receive the normalized family type and reuse common components.
5. Keep the existing root registry entry and page spread. A visual variant
   does not need its own CMS type, registry entry, or data fetch.

### Add a new family

1. Add its exact typename and variant constants, plus derived union types.
2. Define the normalized family data in `types/contentful.ts` (or a family-local
   type module as the project grows).
3. Add its family fragment, including `sys { id }` and `frontendComponent`.
   Export `<FAMILY>_FRAGMENTS` with the fragment and every dependency.
4. Add `... on <ActualType> { ...<Family>Fields }` to `sectionsCollection.items`
   and include its complete fragment list in `buildQuery` in `page.ts`.
5. Create the family dispatcher and initial variant, then register the family
   once using `[SectionTypename.<Family>]` in `registry.tsx`.

The CMS page's sections validation must already allow the new model. A new
constant alone does not establish a backend mapping. Unknown typenames retain
the development marker and render nothing in production. Missing, unknown,
or differently capitalized variant values return `null` from the family;
verification must report them as unbuilt/unmapped, never silently use the
first variant. Every built variant provides a stable `data-section` marker
for section-level QA.

### Common components and foundation

Follow [components/common/README.md](../../components/common/README.md) for
developer-owned `[role:common]` components, normalized types, and reusable
fragment lists. Common components are imported by variants and stay out of
the section registry. Keep `flattenCollections` as the single normalization
boundary; do not add a parallel CMS-to-DTO layer.

The sample layouts have intentionally simple Tailwind styles. On a real
project, Foundry generates the style guide and container, developers build
common components against those tokens, and section variants consume them.
The boilerplate supplies the pattern; it does not impose corporate tokens,
fonts, or shared component field names on every new project.

### Migrate an older sample space

Before running the new page query, have the backend team add and publish the
`heroBanner.frontendComponent` Symbol field with the two sample values above.
Set existing banner entries to `heroWithBanner` and republish them. Add
`heroWithCTA` entries only where that layout is wanted. The updated query
cannot run against a schema that still lacks the discriminator field.
The optional seeder never performs this migration or rewrites existing entries.

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

- `npm test` exercises the real page query against a local sample GraphQL
  schema, collection normalization, both variants, and unknown-value behavior.
  These fixtures do not constitute a live Contentful check.
- `/` and one nested path → 200 with sections rendered; unknown path → 404.
- `?preview=<secret>` on a page → draft content + `private, no-store` headers.
- Watch the dev console for GraphQL errors; complexity errors mean a
  collection needs the enrichment treatment (§6).
