/** Exact GraphQL typenames, keyed by frontend family name. */
export const SectionTypename = {
  Hero: "HeroBanner",
  Ctas: "Ctas",
} as const;

/** Exact CMS values. Preserve spaces and capitalization in real projects. */
export const HeroFrontendComponent = {
  HeroWithBanner: "heroWithBanner",
  HeroWithCTA: "heroWithCTA",
} as const;

export const CtasFrontendComponent = {
  CTA: "CTA",
} as const;
