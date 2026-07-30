import { gql } from "@/lib/cms/graphql";

/**
 * SAMPLE — `heroBanner` section fragment (GraphQL typename is the PascalCase
 * of the content-type id). Replace with the project's real sections; one
 * fragment file per section keeps queries reviewable.
 *
 * Assets and single references are direct objects in Contentful's GraphQL
 * schema — only multi-reference fields are `*Collection`s, and those must
 * carry a `limit:` (see docs/playbooks/contentful.md §5).
 */
export const HERO_BANNER_FRAGMENT = gql`
  fragment HeroBannerFields on HeroBanner {
    sys {
      id
    }
    heading
    subHeading
    image {
      url
      title
      width
      height
    }
    ctaLabel
    ctaUrl
  }
`;
