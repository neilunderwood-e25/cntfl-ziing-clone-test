import { gql } from "@/lib/cms/graphql";

/**
 * SAMPLE — fragment for a `sample_section` content type (GraphQL typename is
 * the PascalCase of the content-type uid). Replace with the project's real
 * sections; one fragment file per section keeps queries reviewable.
 *
 * If a section holds a reference connection that is too deep or too large to
 * expand inline (Contentstack: depth ≤ 3, ≤ 7500 documents — see
 * docs/playbooks/contentstack.md), fetch that connection UID-ONLY here and
 * hydrate it via the enrichment pass. Worked example in the playbook.
 */
export const SAMPLE_SECTION_FRAGMENT = gql`
  fragment SampleSectionFields on SampleSection {
    system {
      uid
      content_type_uid
    }
    title
    description
  }
`;
