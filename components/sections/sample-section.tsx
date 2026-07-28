import type { EntrySystem, Section } from "@/types/content";

/**
 * SAMPLE — the reference implementation of a section component. Every real
 * section follows this pattern: narrow the generic `Section` to the section's
 * own field shape, render, and register in ./registry.tsx.
 */
type SampleSectionData = {
  __typename: "SampleSection";
  system?: EntrySystem;
  title?: string | null;
  description?: string | null;
};

export function SampleSection({ section }: { section: Section }) {
  const data = section as SampleSectionData;

  return (
    <section data-section="sample_section" className="mx-auto max-w-3xl px-6 py-12">
      {data.title ? <h2 className="text-2xl font-semibold">{data.title}</h2> : null}
      {data.description ? <p className="mt-4 text-base leading-7">{data.description}</p> : null}
    </section>
  );
}
