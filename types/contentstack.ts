/**
 * Content types as components consume them: Contentstack response shapes
 * AFTER `flattenConnections` normalization — every `*Connection` is a plain
 * array under its real field name (single references/assets included; they
 * become 1-element arrays, consume with `[0]`).
 *
 * Extend per project as the content model grows (one type per section,
 * defined next to its component or here for shared shapes).
 */

export type EntrySystem = {
  uid: string;
  content_type_uid?: string | null;
  locale?: string | null;
};

/** Normalized `SysAsset` node (file fields, after flattening). */
export type CsAsset = {
  url?: string | null;
  title?: string | null;
  filename?: string | null;
  content_type?: string | null;
  dimension?: { height?: number | null; width?: number | null } | null;
};

/** Contentstack `link` field. */
export type CsLink = {
  title?: string | null;
  href?: string | null;
};

/**
 * One page section. `__typename` is the discriminator the section registry
 * dispatches on; each section component narrows the remaining fields to its
 * own shape (see components/sections/hero-banner.tsx).
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
