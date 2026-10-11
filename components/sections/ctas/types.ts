import type { ButtonData } from "@/components/common/button/types";
import type { ImageData } from "@/components/common/image/types";
import type { RichTextField } from "@/components/common/richtext/types";
import type { SectionTypename } from "@/lib/content/enum";
import type { CtasFrontendComponent } from "@/lib/content/types";
import type { PageLinkData } from "@/lib/page-routes";
import type { Sys } from "@/types/contentful";

/** Contentful `NavigationLink` entry as CtasFields selects it. */
export type CtasNavigationLinkData = {
  __typename: "NavigationLink";
  sys?: { id?: string | null } | null;
  label?: string | null;
  linkBehaviour?: string | null;
  internalPage?: PageLinkData | null;
  externalUrl?: string | null;
  openInNewTab?: boolean | null;
};

/** Contentful `SectionAppearance` entry as CtasFields selects it. */
export type CtasSectionAppearanceData = {
  containerSize?: string | null;
  spacingTop?: unknown;
  spacingBottom?: unknown;
};

/** Normalized data shared by the Ctas family's visual variants. */
export type CtasSection = {
  __typename: typeof SectionTypename.Ctas;
  frontendComponent?: CtasFrontendComponent | null;
  sys?: Sys;
  sectionId?: string | null;
  eyebrow?: RichTextField | null;
  headline?: RichTextField | null;
  description?: RichTextField | null;
  buttons?: Array<ButtonData | CtasNavigationLinkData> | null;
  backgroundColor?: string | null;
  backgroundMedia?: ImageData | null;
  sectionAppearance?: CtasSectionAppearanceData | null;
};
