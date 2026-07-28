import { buildQuery, gql } from "@/lib/cms/graphql";
import { SAMPLE_SECTION_FRAGMENT } from "./fragments/sample-section";

/**
 * Main page query — Contentstack-shaped (queries are provider-specific by
 * design; see lib/cms/types.ts).
 *
 * THE N+1 RULE: one page = ONE query. `flexible_page` stores its FULL public
 * path in `url`, so any request path maps directly to `where: { url }` — no
 * per-section follow-up fetches, no slug-resolution fetch in proxy.ts.
 * `sections` is uncapped (section count is open-ended); every LEAF multiple-
 * reference connection inside a fragment must carry a `limit:`.
 *
 * Add a section type: write its fragment, add an inline `... on X` spread
 * below, list the fragment in `buildQuery`, register the component in
 * components/sections/registry.tsx.
 */
const OPERATION = gql`
  query GetPageByUrl($url: String!) {
    all_flexible_page(where: { url: $url }, limit: 1) {
      items {
        system {
          uid
          content_type_uid
          locale
        }
        title
        url
        sectionsConnection {
          edges {
            node {
              __typename
              ... on SampleSection {
                ...SampleSectionFields
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PAGE_BY_URL = buildQuery(OPERATION, [SAMPLE_SECTION_FRAGMENT]);
