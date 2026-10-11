import {
  videoFileUrl,
  videoPlaybackUrl,
} from "@/components/common/video/embed";
import type { VideoData } from "@/components/common/video/types";
import { pageHref } from "@/lib/page-routes";
import { externalHref } from "@/lib/utils";
import type { ButtonData } from "./types";

/** What a Button entry links to, resolved once for every surface that links. */
export type ButtonLink = {
  /** Undefined when the entry resolves to no destination. */
  href?: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
  ariaLabel?: string;
  /** "Video Popup" link behaviour: the href opens in the Fancybox lightbox. */
  videoPopup: boolean;
  /** The lightbox URL, or null when the entry is not a playable popup. */
  popupUrl: string | null;
  /** The linked Video entry whose toggles the lightbox applies. */
  popupVideo: VideoData | null;
  /** An uploaded file, which Fancybox must be told is html5video. */
  isUploadedFile: boolean;
};

/**
 * The link a Button entry resolves to — shared by the Button and by surfaces
 * that link with the entry without rendering the Button (e.g. Icon Links
 * cards), so both apply identical rules.
 */
export function resolveButtonLink(section?: ButtonData | null): ButtonLink {
  const videoPopup = section?.linkBehaviour === "Video Popup";
  const popupVideo = section?.popupVideoFile ?? null;
  // The linked Video entry is the only popup source: it carries the source
  // type, the playback toggles and, for uploads, the asset URL Fancybox needs.
  const popupUrl = videoPopup ? videoPlaybackUrl(popupVideo) : null;

  let href: string | undefined;
  if (videoPopup) {
    href = popupUrl ?? undefined;
  } else if (section?.linkBehaviour === "Internal Link") {
    href = pageHref(section.internalPage) ?? undefined;
  } else {
    // Normalized, not verbatim: an external URL authored without a scheme is a
    // relative path to the browser and never leaves the site (ZING-675).
    href = externalHref(section?.externalUrl) || undefined;
  }
  const newTab = Boolean(section?.openInNewTab) && !videoPopup;

  return {
    href,
    target: newTab ? "_blank" : undefined,
    rel: newTab ? "noopener noreferrer" : undefined,
    ariaLabel: section?.ariaLabel ?? undefined,
    videoPopup,
    popupUrl,
    popupVideo,
    // Fancybox infers the rest from the URL (youtube/vimeo/html5video); saying
    // so outright for uploads keeps an unusual asset extension from being guessed.
    isUploadedFile: Boolean(popupUrl) && popupUrl === videoFileUrl(popupVideo),
  };
}
