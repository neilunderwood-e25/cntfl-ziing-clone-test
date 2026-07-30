import Image from "next/image";
import Link from "next/link";
import type { CsAsset, CsLink, EntrySystem, Section } from "@/types/contentstack";

/**
 * SAMPLE — the reference implementation of a section component. Every real
 * section follows this pattern: narrow the generic `Section` to the section's
 * own field shape, render, and register in ./registry.tsx.
 *
 * `image` is an asset connection, so after flattening it arrives as a
 * 1-element array (consume with `[0]`).
 */
type HeroBannerData = {
  __typename: "HeroBanner";
  system?: EntrySystem;
  heading?: string | null;
  sub_heading?: string | null;
  image?: CsAsset[] | null;
  cta?: CsLink | null;
};

export function HeroBanner({ section }: { section: Section }) {
  const data = section as HeroBannerData;
  const image = data.image?.[0];

  return (
    <section data-section="hero_banner" className="relative isolate">
      {image?.url ? (
        <Image
          src={image.url}
          alt={image.title ?? ""}
          width={image.dimension?.width ?? 1920}
          height={image.dimension?.height ?? 720}
          priority
          className="h-[60vh] w-full object-cover"
        />
      ) : null}
      <div
        className={
          image?.url
            ? "absolute inset-0 flex flex-col items-start justify-center gap-4 bg-black/40 px-8 text-white md:px-16"
            : "flex flex-col items-start justify-center gap-4 px-8 py-24 md:px-16"
        }
      >
        {data.heading ? (
          <h1 className="max-w-3xl text-4xl font-bold md:text-6xl">{data.heading}</h1>
        ) : null}
        {data.sub_heading ? (
          <p className="max-w-2xl text-lg md:text-xl">{data.sub_heading}</p>
        ) : null}
        {data.cta?.href ? (
          <Link
            href={data.cta.href}
            className="mt-2 rounded-md bg-white px-6 py-3 font-semibold text-black"
          >
            {data.cta.title ?? "Learn more"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
