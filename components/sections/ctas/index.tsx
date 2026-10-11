import { CtasFrontendComponent } from "@/lib/content/enum";
import type { Section } from "@/types/contentful";
import { Cta } from "./cta";
import type { CtasSection } from "./types";

/** One registry entry per family; exact CMS values select sibling variants. */
export function Ctas({ section }: { section: Section }) {
  const data = section as CtasSection;

  switch (section.frontendComponent) {
    case CtasFrontendComponent.CTA:
      return <Cta section={data} />;
    default:
      return null;
  }
}
