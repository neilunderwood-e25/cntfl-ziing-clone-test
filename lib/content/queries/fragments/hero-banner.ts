import { gql } from "@/lib/cms/graphql";

/**
 * SAMPLE — `hero_banner` section fragment (GraphQL typename = PascalCase of
 * the content-type uid). One fragment file per section keeps queries
 * reviewable; copy this pattern for real sections.
 *
 * The asset connection carries no `limit:` — Contentstack rejects it on
 * asset/single-reference connections (only multiple-reference connections
 * accept it; see docs/playbooks/contentstack.md §5).
 */
export const HERO_BANNER_FRAGMENT = gql`
  fragment HeroBannerFields on HeroBanner {
    system {
      uid
      content_type_uid
    }
    heading
    sub_heading
    imageConnection {
      edges {
        node {
          url
          title
          dimension {
            height
            width
          }
        }
      }
    }
    cta {
      title
      href
    }
  }
`;
