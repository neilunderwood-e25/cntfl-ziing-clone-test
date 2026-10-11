import type { AssetData, ImageData } from "@/components/common/image/types";

/** Contentful `Video` entry as VideoFields selects it. */
export type VideoData = {
  __typename?: "Video";
  sys?: { id?: string | null } | null;
  internalName?: string | null;
  videoBehavior?: string | null;
  videoSource?: string | null;
  video?: AssetData | null;
  youtubeUrl?: string | null;
  vimeoUrl?: string | null;
  embedUrl?: string | null;
  posterImage?: ImageData | null;
  playIcon?: ImageData | null;
  autoplay?: boolean | null;
  controls?: boolean | null;
  loop?: boolean | null;
  muted?: boolean | null;
  ariaLabel?: string | null;
};

export type VideoProps = {
  section?: VideoData | null;
  className?: string;
};
