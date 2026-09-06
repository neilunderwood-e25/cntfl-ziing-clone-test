import { gql } from "@/lib/cms/graphql";

/**
 * SAMPLE — one fragment for the Hero family, including its variant selector.
 * Keep the union of fields consumed by the family's variants. Shared component
 * dependencies belong in HERO_FRAGMENTS so every query includes them.
 *
 * Assets and single references are direct objects in Contentful's GraphQL
 * schema — only multi-reference fields are `*Collection`s, and those must
 * carry a `limit:` (see docs/playbooks/contentful.md §5).
 */
export const HERO_FRAGMENT = gql`
  fragment HeroFields on HeroBanner {
    sys {
      id
    }
    frontendComponent
    heading
    subHeading
    image {
      url
      title
      description
      width
      height
    }
    ctaLabel
    ctaUrl
  }
`;

export const HERO_FRAGMENTS = [HERO_FRAGMENT];
