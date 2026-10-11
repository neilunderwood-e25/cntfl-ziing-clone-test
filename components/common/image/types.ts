/** Contentful `Asset` fields as AssetFields selects them. */
export type AssetData = {
  __typename?: "Asset";
  sys?: { id?: string | null } | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
};

/** Contentful `Image` entry as ImageFields selects it. */
export type ImageData = {
  __typename?: "Image";
  sys?: { id?: string | null } | null;
  internalName?: string | null;
  alternativeText?: string | null;
  caption?: string | null;
  image?: AssetData | null;
};

export type ImageProps = {
  section?: ImageData | null;
  /** Presentation classes owned by the calling section. */
  className?: string;
  sizes?: string;
  priority?: boolean;
  /**
   * Accessible name for the image, overriding the entry's own. Leave it unset
   * for content images: they take the CMS Alternative Text, else the entry's
   * Internal Name. Pass "" for decorative media (or set `decorative`).
   */
  alt?: string;
  /**
   * Opt in only for purely decorative media, such as the CTA background.
   * Always emits alt="" and suppresses the caption. Content images keep their
   * CMS Alternative Text (else Internal Name) by default.
   */
  decorative?: boolean;
  /**
   * Keep the alt text but draw no caption — for content images laid out as a
   * background, where a caption has nowhere to sit.
   */
  hideCaption?: boolean;
};
