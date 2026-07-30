import type { ComponentType } from "react";
import type { Section } from "@/types/contentful";
import { HeroBanner } from "./hero-banner";

/**
 * Section registry — maps a section's `__typename` to its component. This is
 * the wiring that lets editors compose pages from sections without code
 * changes per page.
 *
 * As each section component is built, register it here. Unknown/unregistered
 * types render nothing in production (a new CMS section can't crash a live
 * page) and a visible marker in development.
 */
const SECTION_COMPONENTS: Record<string, ComponentType<{ section: Section }>> = {
  HeroBanner,
};

export function SectionRenderer({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((section, index) => {
        const Component = SECTION_COMPONENTS[section.__typename];
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
