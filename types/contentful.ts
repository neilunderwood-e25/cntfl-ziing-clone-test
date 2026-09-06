/**
 * Content types as components consume them: Contentful response shapes AFTER
 * `flattenCollections` normalization — every `*Collection` is a plain array
 * under its real field name. Single references and assets are direct objects
 * in Contentful's GraphQL schema (no unwrapping needed).
 *
 * Extend per project as the content model grows (one type per section,
 * defined next to its component or here for shared shapes).
 */
import type { SectionTypename } from "@/lib/content/enum";
import type { HeroFrontendComponent } from "@/lib/content/types";

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
 * dispatches on. A family narrows the data once and selects a variant using
 * frontendComponent. Unknown CMS types/values remain representable so the
 * rendering boundary can safely ignore layouts that have not been built.
 */
export type Section = {
  __typename: string;
  frontendComponent?: string | null;
  sys?: Sys;
} & Record<string, unknown>;

/** SAMPLE — normalized data shared by the Hero family's visual variants. */
export type HeroSection = {
  __typename: typeof SectionTypename.Hero;
  frontendComponent?: HeroFrontendComponent | null;
  sys?: Sys;
  heading?: string | null;
  subHeading?: string | null;
  image?: CfAsset | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

export type Page = {
  sys: Sys;
  title: string | null;
  /** Full public path ("/pricing/home"). */
  url: string | null;
  sections: Section[];
};
