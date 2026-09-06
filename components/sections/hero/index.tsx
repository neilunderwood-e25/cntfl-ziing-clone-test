import { HeroFrontendComponent } from "@/lib/content/enum";
import type { HeroSection, Section } from "@/types/contentful";
import { HeroWithBanner } from "./heroWithBanner";
import { HeroWithCTA } from "./heroWithCTA";

/** One registry entry per family; exact CMS values select sibling variants. */
export function Hero({ section }: { section: Section }) {
  const data = section as HeroSection;

  switch (section.frontendComponent) {
    case HeroFrontendComponent.HeroWithBanner:
      return <HeroWithBanner section={data} />;
    case HeroFrontendComponent.HeroWithCTA:
      return <HeroWithCTA section={data} />;
    default:
      return null;
  }
}
