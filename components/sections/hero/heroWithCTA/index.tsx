import Link from "next/link";
import type { HeroSection } from "@/types/contentful";

/** SAMPLE — centered CTA layout, using the same content type as HeroWithBanner. */
export function HeroWithCTA({ section }: { section: HeroSection }) {
  return (
    <section
      data-section="hero-with-cta"
      className="flex flex-col items-center gap-4 px-8 py-24 text-center"
    >
      {section.heading ? (
        <h1 className="max-w-3xl text-4xl font-bold md:text-6xl">{section.heading}</h1>
      ) : null}
      {section.subHeading ? (
        <p className="max-w-2xl text-lg md:text-xl">{section.subHeading}</p>
      ) : null}
      {section.ctaUrl ? (
        <Link
          href={section.ctaUrl}
          className="mt-2 rounded-md bg-black px-6 py-3 font-semibold text-white"
        >
          {section.ctaLabel ?? "Learn more"}
        </Link>
      ) : null}
    </section>
  );
}
