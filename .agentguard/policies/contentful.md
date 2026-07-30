# Contentful policy (this repository)

Contentful is the current CMS, implemented as an adapter in
`lib/cms/contentful/`. This policy is an optional integration concern: core
policies stand on their own if the CMS changes.

## No SDK — this is deliberate

There is **no** `contentful` npm package here and none may be added
(enforced: `no-cms-sdk-imports`). The GraphQL client is a native-fetch POST
with retry/backoff (`lib/cms/graphql.ts`); queries are plain strings via the
identity `gql` tag. Do not introduce Apollo, urql, or a CMS SDK.

## Boundaries (enforced, path-based)

- `lib/cms/contentful/**` internals (client, config, preview, normalize,
  enrichment, webhook translation) are private to `lib/cms/` — reach them
  through the `lib/cms` public API (`getCms()`, `cmsQuery()`, …).
- Components and `app/` consume normalized shapes via `lib/content/` and
  `types/contentful.ts` — they never query Contentful directly.
- `lib/cache/` knows nothing about Contentful beyond the neutral
  `PurgeTargets` type.

## Reuse, don't duplicate

- One client, one config, one preview mechanism: extend
  `lib/cms/contentful/{client,config,preview}.ts` — never instantiate a
  second client or re-read env vars elsewhere.
- Queries live in `lib/content/queries/` and are provider-native GraphQL ON
  PURPOSE — we rejected masking query documents behind the client interface
  as over-abstraction. Extend existing queries/fragments before adding new
  ones.
- One mapping layer: normalization (collection flattening) lives in
  `lib/cms/contentful/normalize.ts`. Do not add a second mapping/DTO layer
  for the same content type.
- Provider limits (complexity, depth) are documented in
  `docs/playbooks/contentful.md` — the enrichment pass exists because of
  them; use it instead of inventing new hydration paths.

## Do not generalize speculatively

Do not build a multi-CMS interface. The seam already exists (`CmsAdapter` in
`lib/cms/types.ts` + the `ADAPTERS` registry); a future provider implements
that seam under `lib/cms/<provider>/` and updates these policies. That work
happens when a real project needs it, not before.
