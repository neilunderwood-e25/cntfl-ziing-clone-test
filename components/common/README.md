# Common components

Developer-owned components go in `<name>/index.tsx`, for example `cta/index.tsx`
or `image/index.tsx`. Build them manually against the project's style-guide
tokens and Contentful models before Foundry builds sections that depend on them.
This directory deliberately contains no corporate branding or assumed CMS fields.

For each Contentful model marked `[role:common]`:

1. Add its queried, collection-flattened type to `types/contentful.ts`.
2. Add a fragment under `lib/content/queries/fragments/common/<name>.ts`.
   Export both `<NAME>_FRAGMENT` and `<NAME>_FRAGMENTS`, including all dependencies.
3. Build the component here and document its props and supported states in the
   project's style guide. Import it directly from the consuming section variants.

Common components do not belong in the section registry. They receive data from
the page query and do not fetch Contentful themselves. Keep content-specific
rendering behavior in the common component and section layout in its caller.

For example, a section linking to a shared image model spreads `ImageFields`
on that field and includes `...IMAGE_FRAGMENTS` in its own fragment list. The page
query includes the section's complete list. No second normalization layer is
needed: `flattenCollections` remains the single mapping boundary.

The sample Hero links directly to a Contentful Asset and uses inline CTA fields.
Replace those only when the backend team supplies the corresponding common models.
