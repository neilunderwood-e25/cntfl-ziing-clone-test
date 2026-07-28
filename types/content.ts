/**
 * App-level content types — the contract components render against.
 *
 * These are CMS-agnostic by construction: `lib/content/` maps whatever the
 * active provider returns into these shapes, so components never import
 * provider types. Extend per project as the content model grows.
 */

export type EntrySystem = {
  uid: string;
  content_type_uid?: string | null;
  locale?: string | null;
};

/**
 * One page section. `__typename` is the discriminator the section registry
 * dispatches on; each section component narrows the remaining fields to its
 * own type (see components/sections/sample-section.tsx).
 */
export type Section = {
  __typename: string;
  system?: EntrySystem;
} & Record<string, unknown>;

export type Page = {
  system: EntrySystem;
  title: string | null;
  /** Full public path ("/pricing/home"). */
  url: string | null;
  sections: Section[];
};
