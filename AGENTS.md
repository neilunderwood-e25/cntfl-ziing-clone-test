<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent operating manual

This repo is a **boilerplate**: the starting point for CMS-driven, full-SSR
Next.js sites. It encodes hard-won patterns from prior large-scale production
CMS builds so every new project starts on the right course. Your job when
working here is to **extend it along its designed seams** — the playbooks below
tell you exactly which seam each kind of task uses.

## Task router — read the playbook BEFORE writing code

| When the task is…                                        | Read first                          |
| -------------------------------------------------------- | ----------------------------------- |
| Anything touching caching, TTLs, or response headers      | `docs/playbooks/caching.md`         |
| Deploying to / integrating **Vercel** (headers, purge)    | `docs/playbooks/add-vercel.md`      |
| Putting **Akamai** in front (headers, Fast Purge)         | `docs/playbooks/add-akamai.md`      |
| Building a project on **Contentful** (queries, limits)    | `docs/playbooks/contentful.md`      |
| Adding another CDN (Cloudflare, Fastly, CloudFront, …)    | `docs/playbooks/add-akamai.md` — same seams, swap the provider's header/purge API |

After completing one of these integrations, **update the "Current stack state"
section below** — it is how the next agent (or you, months later) knows what is
already wired and how new layers must chain onto existing ones.

<!-- agentguard:start -->
## AgentGuard — mandatory workflow gates

This repo enforces its engineering rules with deterministic local scripts —
no model, no network. Full docs: `.agentguard/README.md`.

**Before writing code:**

1. Read `.agentguard/policies/core.md` plus the policies for what you touch
   (`nextjs.md`, `contentful.md`).
2. `npm run agent:scan` — refresh the project map.
3. `npm run agent:discover -- "<task description>"` — get ranked related
   files, then inspect those source files. Reuse/extend before creating.
4. If the change will **create or delete source files**: write
   `.agentguard/runs/current-plan.json`
   (schema: `.agentguard/schemas/implementation-plan.schema.json`) and run
   `npm run agent:plan:validate` before implementing.

**Before finishing:**

5. `npm run agent:diff:validate` — must exit 0. Errors are objective
   violations (unplanned files, layer-boundary breaches, caching-invariant
   breaches); fix them. Warnings are heuristics: resolve or explicitly
   justify each in your summary.
6. Run the verification bar below (`npm run lint`, `npm run build`, …).

Never edit `.agentguard/generated/` or `.agentguard/cache/` (generated), and
any change to `.agentguard/` policies/config or this file must be listed in
your plan — policy edits are deliberate acts, not side effects.
<!-- agentguard:end -->

## Current stack state

> Maintained by agents. Update when you add/remove a CMS, CDN, or purge layer.

- **CMS**: `contentful` adapter implemented (`lib/cms/contentful/`), pointed
  at the `ziing-clone` space (`ya6vm6e6836y`, `master`; `.env.local` and
  `.foundry/project.json`) — a copy of the Ziing client space's full content
  model and content. That model has `flexiblePage` but NO `heroBanner`, so
  the sample page query's `... on HeroBanner` spread is invalid against it
  until Foundry wires the real section families in its place. Do not run
  `scripts/create-content-model.mjs` here: the space is not empty.
- **Section pattern**: `HeroBanner` → `Hero` family → exact `frontendComponent`
  dispatch to `heroWithBanner` / `heroWithCTA`. Constants live in
  `lib/content/enum.ts`, derived unions in `lib/content/types.ts`, normalized
  family data in `types/contentful.ts`. The sample seeder creates `/` and
  `/sample-cta`; older spaces require a manual discriminator migration.
- **Common components**: developer-owned seam documented in
  `components/common/README.md`. Foundry generates style guide/container per
  project before common components and sections are built. Built so far,
  copied verbatim from `cntfl-ziing` at the paths `.foundry/sections.json`
  already binds: `image/` (`Image` model), `button/` (`Button` model; links
  via `pageHref`/`externalHref`, may open a Video lightbox), `video/`
  (default export; inline/popup, upload/YouTube/Vimeo, `@fancyapps/ui`
  lightbox) and `richtext/` (`Richtext`; Contentful rich-text renderer,
  embedded `Button` entries grouped as CTAs). Their fragments live in
  `lib/content/queries/fragments/common/` (`asset`, `image`, `video`,
  `button`, plus the `page-link` selection), with `lib/page-routes.ts`
  (`PAGE_ROUTES`: `resourcePage` → `/resources/<slug>`) and
  `lib/live-preview/field-tags.ts` (`fieldTag`; the vendored
  `@eight25-factory/live-preview` supplies only its type here — no live
  preview is wired, so tags render nothing). Rich-text `links` (embedded
  Buttons) need a separate entries query that Foundry's section wiring
  generates; until then embedded Buttons do not render.
  `sections.json` also binds `sectionAppearance` and the `card`, `logoItem`,
  `metric`, `menuItem`, `navigationLink` fragments, which are NOT here yet.
  The GraphQL client (`lib/cms/contentful/client.ts`) throws on ANY GraphQL
  error, including `UNRESOLVABLE_LINK`; the space has such links (e.g. a
  Button's `popupVideoFile` → an unpublished Video), which cntfl-ziing's
  client tolerates.
- **Foundation (Foundry)**: Ziing's style guide and container, copied
  verbatim from the `cntfl-ziing` repo with its tracked `.foundry` state
  (`foundation-state.json` lists the generated files): `styles/` (imported by
  `app/globals.css`), `/styleguide`, `/container`,
  `components/ui/Container.tsx`, and fonts/icon sprite/logos under
  `public/assets/`. `.foundry/sections.json` and the `wiring-*` state came
  across too and describe cntfl-ziing's section wiring, whose files are NOT
  in this repo.
- **Images**: sample Hero uses Next Image with HTTPS `images.ctfassets.net`
  assets allowed in `next.config.ts`.
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
components/ + app/            render normalized content (types/contentful.ts)
        ↓ calls
lib/content/                  the app's content API: queries + page fetch
        ↓ calls
lib/cms/                      CMS client boundary + the contentful adapter
                              (transport, auth, retry, preview, shape quirks)
lib/cache/                    CDN headers, tags, purge chain (CMS-independent)
```

This version is **single-CMS (Contentful)** — components consume the
normalized (collection-flattened) Contentful shapes directly via
`types/contentful.ts`; there is deliberately no extra CMS-agnostic mapping
layer. The rules that keep the boundaries clean:

1. **Components import `lib/content/` + `types/contentful.ts`, never
   `lib/cms/contentful/` internals** — transport/config/preview stay behind
   the `lib/cms` public API.
2. **Queries are provider-native ON PURPOSE.** We rejected masking query
   documents behind the client interface (over-abstraction). They live in
   `lib/content/queries/`; the client only routes them to the right endpoint
   with the right auth.
3. **`lib/cache/` knows nothing about any CMS** except the neutral
   `PurgeTargets` type. The adapter translates webhook payloads into it.

## Core invariants — do not regress these

- **Full SSR, CDN-cached.** NEVER cache in the Next data layer: no
  `next: { tags }`, no `"use cache"` / `unstable_cache`, no ISR `revalidate`.
  A Next-side cache can't be purged by CDN tag purges and silently serves
  stale content behind them. CMS fetches use `cache: "no-store"`.
- **One page = one query** (the N+1 fix). The page entry stores its FULL path
  in `url`; the catch-all route does a single `where: { url }` fetch. When
  provider limits force a collection out of the main query, it is fetched
  shallow (`sys { id }`) and hydrated by the **batched enrichment pass**
  (`lib/cms/contentful/enrichment.ts`) — never by per-item fetches.
- **Request-level dedup with React `cache()`** (`lib/content/pages.ts`):
  `generateMetadata` + page render share one fetch. GraphQL POSTs are NOT
  memoized by Next's fetch memoization. Preview bypasses the cache.
- **`proxy.ts` stays fast**: no data fetching in it, ever (the full-URL lookup
  strategy exists precisely to avoid slug-resolution fetches there).
- **Preview responses are `private, no-store`** at every cache layer.
- **Purge webhook returns 200 even when a purge fails** (some CMSs disable a
  webhook after repeated 5xx — this caused a real production incident — and
  one missed purge is the lesser evil). Alert on the `purge failure` error
  log instead.
- **Cache tags**: lowercase `[a-z0-9_-]`, no colons (Akamai's charset is the
  lowest common denominator). Always create tags via `lib/cache/tags.ts`.
- **No heavy CMS SDKs / Apollo.** The GraphQL client is a native-fetch POST
  with retry/backoff; queries are plain strings via the identity `gql` tag.

## Sample code you are expected to replace per project

Marked `SAMPLE` in-file: `lib/content/queries/fragments/hero-banner.ts`,
the `HeroBanner` spread in `lib/content/queries/page.ts`,
the variants under `components/sections/hero/`, and their normalized
`HeroSection` type. The fields and styles are placeholders; the two-level
dispatch is the reusable contract.

Each family gets ONE registry entry by GraphQL `__typename`. Its `index.tsx`
switches on the exact `frontendComponent` value from Contentful and renders
a sibling variant directory, with `default: return null`. Keep CMS spelling
verbatim; do not add guessed aliases or change the CMS to fit code names.
Variants receive the normalized family data and never fetch CMS data directly.

Adding a variant extends the family's constants, type/fragment if needed,
and dispatcher. Adding a family also adds a page-query spread and registry
entry. Always compose complete fragment dependency lists (`HERO_FRAGMENTS`
in the sample); common components are imported directly by variants and
never registered as sections. Follow `docs/playbooks/contentful.md` §3.

## Verification bar

- `npm run build` and `npm run lint` must pass.
- For section/data-wiring changes, `npm test` must pass. It uses a local
  GraphQL schema and rendered fixtures, not a live Contentful space.
- If you touched caching: `npm run build && npm run start`, then curl a page
  and assert the `CDN-Cache-Control` header (and `private, no-store` with
  `?preview=x`).
- If you touched the data layer against a real space: verify a page URL
  returns 200 with sections rendered, and an unknown URL 404s.
