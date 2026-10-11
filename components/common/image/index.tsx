import NextImage from "next/image";
import { fieldTag } from "@/lib/live-preview/field-tags";
import type { ImageData, ImageProps } from "./types";

/**
 * An Image entry's alt text: its "Alternative Text" when the author filled it
 * in, otherwise its Internal Name. Blank values are skipped rather than kept —
 * Contentful returns an empty field as "", which a `??` chain would stop at.
 */
export function imageAlt(section?: ImageData | null): string {
  return (
    section?.alternativeText?.trim() || section?.internalName?.trim() || ""
  );
}

/**
 * Renders a Contentful `Image` entry. Vector assets skip the optimizer because
 * the Next image endpoint rejects SVG unless the project opts in globally.
 */
export function Image({
  section,
  className,
  sizes,
  priority = false,
  decorative = false,
  hideCaption = false,
  alt: altProp,
}: ImageProps) {
  const asset = section?.image;
  const url = asset?.url;
  if (!url) return null;

  // Both the optimized and fallback paths must keep the alt attribute, even
  // when this is decorative background media. An explicit `alt` from the
  // caller wins; otherwise the entry's own alt text (see imageAlt).
  const alt = decorative ? "" : (altProp ?? imageAlt(section));
  const width = asset?.width ?? 0;
  const height = asset?.height ?? 0;
  const caption = section?.caption;
  // Inspector mode: the img opens this Image entry's `image` field.
  const tag = fieldTag(section, "image");

  const media =
    width > 0 && height > 0 ? (
      <NextImage
        {...tag}
        src={url}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        unoptimized={asset?.contentType === "image/svg+xml"}
        className={className}
      />
    ) : (
      // next/image requires intrinsic dimensions; fall back when the asset omits them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...tag}
        src={url}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={className}
      />
    );

  if (decorative || hideCaption || !caption) return media;

  return (
    <figure className="flex flex-col gap-5xs">
      {media}
      <figcaption className="body-2" {...fieldTag(section, "caption")}>
        {caption}
      </figcaption>
    </figure>
  );
}
