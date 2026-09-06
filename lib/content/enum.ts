/** Exact GraphQL typenames, keyed by frontend family name. */
export const SectionTypename = {
  Hero: "HeroBanner",
} as const;

/** Exact CMS values. Preserve spaces and capitalization in real projects. */
export const HeroFrontendComponent = {
  HeroWithBanner: "heroWithBanner",
  HeroWithCTA: "heroWithCTA",
} as const;
