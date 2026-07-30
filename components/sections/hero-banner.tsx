import Image from "next/image";
import Link from "next/link";
import type { CfAsset, Section, Sys } from "@/types/contentful";

/**
 * SAMPLE — the reference implementation of a section component. Every real
 * section follows this pattern: narrow the generic `Section` to the section's
 * own field shape, render, and register in ./registry.tsx.
 */
type HeroBannerData = {
  __typename: "HeroBanner";
  sys?: Sys;
  heading?: string | null;
  subHeading?: string | null;
  image?: CfAsset | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

export function HeroBanner({ section }: { section: Section }) {
  const data = section as HeroBannerData;
  const image = data.image;

  return (
    <section data-section="hero-banner" className="relative isolate">
      {image?.url ? (
        <Image
          src={image.url}
          alt={image.title ?? ""}
          width={image.width ?? 1920}
          height={image.height ?? 720}
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
        {data.subHeading ? (
          <p className="max-w-2xl text-lg md:text-xl">{data.subHeading}</p>
        ) : null}
        {data.ctaUrl ? (
          <Link
            href={data.ctaUrl}
            className={
              image?.url
                ? "mt-2 rounded-md bg-white px-6 py-3 font-semibold text-black"
                : "mt-2 rounded-md bg-black px-6 py-3 font-semibold text-white"
            }
          >
            {data.ctaLabel ?? "Learn more"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
