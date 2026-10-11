import type { VideoData } from "@/components/common/video/types";
import type { PageLinkData } from "@/lib/page-routes";

/** Contentful `Button` entry as ButtonFields selects it. */
export type ButtonData = {
  __typename?: "Button";
  sys?: { id?: string | null } | null;
  internalName?: string | null;
  label?: string | null;
  buttonVariant?: string | null;
  buttonColor?: string | null;
  linkBehaviour?: string | null;
  internalPage?: PageLinkData | null;
  externalUrl?: string | null;
  popupVideoFile?: VideoData | null;
  openInNewTab?: boolean | null;
  ariaLabel?: string | null;
};

export type ButtonProps = {
  section?: ButtonData | null;
  className?: string;
};
