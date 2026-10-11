import { ROUTED_PAGE_TYPES, typenameOf } from "@/lib/page-routes";

/**
 * A page a link points to — Flexible Pages and Dynamic Listing Pages by
 * `url`, routed page types by `slug` — as `pageHref` (lib/page-routes.ts)
 * reads it. Interpolate it into
 * every internal-page reference (`internalPage { ${PAGE_LINK_SELECTION} }`):
 * link `internalPage` fields and rich-text entry hyperlinks.
 *
 * The `... on Entry` wrapper is ON PURPOSE. A reference allowing one content
 * type is that type (`internalPage: FlexiblePage`), where `... on
 * ResourcePage` alone is invalid; allowing several, it becomes a union
 * (`ButtonInternalPage = FlexiblePage | ResourcePage | …`), where nothing but
 * `__typename` can be selected directly. Type conditions nested in `Entry`
 * are valid in both shapes, so widening a field's validation in Contentful
 * needs no query change.
 *
 * A selection rather than a named fragment, so no query document has to list
 * it as a dependency.
 */
export const PAGE_LINK_SELECTION = `
    __typename
    ... on Entry {
      ... on FlexiblePage { url }
      ... on DynamicListingPage { url }
      ${ROUTED_PAGE_TYPES.map((type) => `... on ${typenameOf(type)} { slug }`).join("\n      ")}
    }`;
