import type { ComponentType } from "react";
import type { Section } from "@/types/contentful";
import { SectionTypename } from "@/lib/content/enum";
import type { SectionTypename as SectionTypenameValue } from "@/lib/content/types";
import { Ctas } from "./ctas";
import { Hero } from "./hero";

/**
 * Section registry — maps a section's `__typename` to its family. This is
 * the wiring that lets editors compose pages from sections without code
 * changes per page.
 *
 * Each family dispatches on frontendComponent to its own variant folders.
 * Add one entry here per content type, never one per visual variant.
 * Unknown/unregistered
 * types render nothing in production (a new CMS section can't crash a live
 * page) and a visible marker in development.
 */
const SECTION_COMPONENTS: Record<SectionTypenameValue, ComponentType<{ section: Section }>> = {
  [SectionTypename.Hero]: Hero,
  [SectionTypename.Ctas]: Ctas,
};

export function SectionRenderer({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((section, index) => {
        const Component = Object.hasOwn(SECTION_COMPONENTS, section.__typename)
          ? SECTION_COMPONENTS[section.__typename as SectionTypenameValue]
          : undefined;
        const key = section.sys?.id ?? `${section.__typename}-${index}`;

        if (!Component) {
          if (process.env.NODE_ENV !== "production") {
            return (
              <div
                key={key}
                data-unknown-section={section.__typename}
                className="my-2 border border-dashed border-red-500 p-4 text-sm text-red-600"
              >
                Unregistered section: <code>{section.__typename}</code>
              </div>
            );
          }
          return null;
        }

        return <Component key={key} section={section} />;
      })}
    </>
  );
}
