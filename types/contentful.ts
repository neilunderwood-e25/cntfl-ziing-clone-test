/**
 * Content types as components consume them: Contentful response shapes AFTER
 * `flattenCollections` normalization — every `*Collection` is a plain array
 * under its real field name. Single references and assets are direct objects
 * in Contentful's GraphQL schema (no unwrapping needed).
 *
 * Extend per project as the content model grows (one type per section,
 * defined next to its component or here for shared shapes).
 */

export type Sys = {
  id: string;
};

/** Contentful `Asset` (linked file) as queried in fragments. */
export type CfAsset = {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  width?: number | null;
  height?: number | null;
  contentType?: string | null;
};

/**
 * One page section. `__typename` is the discriminator the section registry
 * dispatches on; each section component narrows the remaining fields to its
 * own shape (see components/sections/hero-banner.tsx).
 */
export type Section = {
  __typename: string;
  sys?: Sys;
} & Record<string, unknown>;

export type Page = {
  sys: Sys;
  title: string | null;
  /** Full public path ("/pricing/home"). */
  url: string | null;
  sections: Section[];
};
