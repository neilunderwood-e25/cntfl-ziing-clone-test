import { CtasFrontendComponent, HeroFrontendComponent, SectionTypename } from "./enum";

export type HeroFrontendComponent =
  (typeof HeroFrontendComponent)[keyof typeof HeroFrontendComponent];

export type CtasFrontendComponent =
  (typeof CtasFrontendComponent)[keyof typeof CtasFrontendComponent];

export type SectionTypename =
  (typeof SectionTypename)[keyof typeof SectionTypename];
