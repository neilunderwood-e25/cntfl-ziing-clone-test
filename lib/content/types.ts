import { HeroFrontendComponent, SectionTypename } from "./enum";

export type HeroFrontendComponent =
  (typeof HeroFrontendComponent)[keyof typeof HeroFrontendComponent];

export type SectionTypename =
  (typeof SectionTypename)[keyof typeof SectionTypename];
