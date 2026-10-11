import { gql } from "@/lib/cms/graphql";
import { BUTTON_FRAGMENTS } from "./common/button";
import { IMAGE_FRAGMENTS } from "./common/image";
import { PAGE_LINK_SELECTION } from "./common/page-link";

/**
 * One fragment for the Ctas family, including its variant selector. Keep the
 * union of fields consumed by the family's variants. `buttons` allows Button
 * and Navigation Link entries; it is a short list, so it stays inline.
 */
export const CTAS_FRAGMENT = gql`
  fragment CtasFields on Ctas {
    sys {
      id
    }
    frontendComponent
    sectionId
    eyebrow {
      json
    }
    headline {
      json
    }
    description {
      json
    }
    buttonsCollection(limit: 4) {
      items {
        __typename
        ... on Button {
          ...ButtonFields
        }
        ... on NavigationLink {
          sys {
            id
          }
          label
          linkBehaviour
          internalPage {
            ${PAGE_LINK_SELECTION}
          }
          externalUrl
          openInNewTab
        }
      }
    }
    backgroundColor
    backgroundMedia {
      ...ImageFields
    }
    sectionAppearance {
      containerSize
      spacingTop
      spacingBottom
    }
  }
`;

export const CTAS_FRAGMENTS = [CTAS_FRAGMENT, ...BUTTON_FRAGMENTS, ...IMAGE_FRAGMENTS];
