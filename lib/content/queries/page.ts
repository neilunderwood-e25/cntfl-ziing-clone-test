import { buildQuery, gql } from "@/lib/cms/graphql";
import { HERO_BANNER_FRAGMENT } from "./fragments/hero-banner";

/**
 * Main page query.
 *
 * THE N+1 RULE: one page = ONE query. `flexiblePage` stores its FULL public
 * path in `url`, so any request path maps directly to `where: { url }` — no
 * per-section follow-up fetches, no slug-resolution fetch in proxy.ts.
 * Every collection carries an explicit `limit:` — uncapped collections
 * default to 100 items and multiply through Contentful's per-query
 * complexity budget.
 *
 * `$preview` is the draft-content switch — the client injects its value
 * automatically (see lib/cms/contentful/client.ts); thread it into every
 * collection in every query.
 *
 * Add a section type: write its fragment, add an inline `... on X` spread
 * below, list the fragment in `buildQuery`, register the component in
 * components/sections/registry.tsx.
 */
const OPERATION = gql`
  query GetPageByUrl($url: String!, $preview: Boolean = false) {
    flexiblePageCollection(where: { url: $url }, limit: 1, preview: $preview) {
      items {
        sys {
          id
        }
        title
        url
        sectionsCollection(limit: 30) {
          items {
            __typename
            ... on HeroBanner {
              ...HeroBannerFields
            }
          }
        }
      }
    }
  }
`;

export const GET_PAGE_BY_URL = buildQuery(OPERATION, [HERO_BANNER_FRAGMENT]);
