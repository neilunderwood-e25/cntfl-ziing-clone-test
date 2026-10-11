"use client";

import { type RefObject, useId, useRef, useState } from "react";
import { Image, imageAlt } from "@/components/common/image";
import {
  applyVideoParams,
  videoEmbedParamsFor,
  videoEmbedUrl,
  videoFileUrl,
  videoPlaybackFlags,
} from "./embed";
import { useFancyboxVideo } from "./fancybox";
import { type PlayableElement, useViewportAutoplay } from "./viewport-autoplay";
import type { ImageData } from "@/components/common/image/types";
import type { VideoProps } from "./types";
import { fieldTag } from "@/lib/live-preview/field-tags";

/**
 * Authors choose how a video opens with `videoBehavior`:
 *   Inline — plays where it sits, behind its poster until asked for.
 *   Popup  — the poster becomes a trigger and the video opens in a Fancybox
 *            lightbox, the same one the Button's "Video Popup" link uses.
 */
const POPUP = "Popup";

/** The authored play icon, or the styleguide's own glyph when none is set. */
function PlayIcon({ icon }: Readonly<{ icon?: ImageData | null }>) {
  return icon ? (
    <Image section={icon} alt={imageAlt(icon)} hideCaption className="h-auto w-auto" />
  ) : (
    <span className="icon icon-video-play" aria-hidden="true" />
  );
}

/** Matches the styleguide's own hover timing (styles/util/_buttons.css). */
const ZOOM_TRANSITION = "transition-transform duration-300 ease-out";

/**
 * The poster with its play icon — the clickable face of both behaviours.
 * `zoomOnHover` grows the play icon alone; the poster behind it stays put.
 * It needs an ancestor marked `group` to react to.
 */
function PosterFace({
  poster,
  playIcon,
  zoomOnHover = false,
}: Readonly<{
  poster?: ImageData | null;
  playIcon?: ImageData | null;
  zoomOnHover?: boolean;
}>) {
  const iconClass = [
    "absolute inset-0 flex items-center justify-center",
    zoomOnHover && `${ZOOM_TRANSITION} group-hover:scale-110`,
  ]
    .filter(Boolean)
    .join(" ");

  const posterAlt = imageAlt(poster);

  return (
    <>
      {poster ? (
        <Image
          section={poster}
          className="h-auto w-full object-cover"
          alt={posterAlt}
        />
      ) : null}
      <span className={iconClass}>
        <PlayIcon icon={playIcon} />
      </span>
    </>
  );
}

export default function Video({ section, className }: Readonly<VideoProps>) {
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayableElement>(null);
  const fallbackGroup = useId();

  const fileUrl = videoFileUrl(section);
  const embedUrl = videoEmbedUrl(section);
  const isPopup = section?.videoBehavior === POPUP;
  const popupUrl = isPopup ? fileUrl ?? embedUrl : null;

  useFancyboxVideo(containerRef, popupUrl, section);

  // Inline + authored autoplay hands the start/stop decision to the viewport.
  const viewportAutoplay = !isPopup && Boolean(section?.autoplay);
  useViewportAutoplay(playerRef, viewportAutoplay);

  if (!section) return null;
  if (!fileUrl && !embedUrl) return null;

  const flags = videoPlaybackFlags(section);
  const { autoplay, controls, loop, muted } = flags;
  const label = section.ariaLabel ?? section.internalName ?? undefined;
  // Inspector mode opens the field the playing media comes from.
  const tag = fieldTag(
    section,
    fileUrl
      ? "video"
      : section.embedUrl
        ? "embedUrl"
        : section.youtubeUrl
          ? "youtubeUrl"
          : "vimeoUrl",
  );

  // The player is already mounted, so toggling a prop will not start it.
  const startPlayback = () => {
    setPlaying(true);
    const element = playerRef.current;
    if (element instanceof HTMLVideoElement) void element.play().catch(() => {});
  };

  const triggerClass = [
    "relative flex w-full cursor-pointer items-center justify-center overflow-hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (isPopup) {
    return (
      <div ref={containerRef} className="video-container">
        <a
          {...tag}
          href={popupUrl ?? undefined}
          aria-label={label}
          className={`group ${triggerClass}`}
          data-fancybox={`video-${section.sys?.id ?? fallbackGroup}`}
          // Fancybox reads the type off the URL; uploads say so outright so an
          // unusual asset extension is not mistaken for an image.
          data-type={fileUrl ? "html5video" : undefined}
        >
          <PosterFace poster={section.posterImage} playIcon={section.playIcon} zoomOnHover />
        </a>
      </div>
    );
  }

  // Inline upload. The player is in the DOM from the first render — the play
  // icon is an overlay on top of it, not a placeholder that swaps for it — so
  // the element exists for the viewport observer and for the click to drive.
  // The authored poster is the video's own `poster` attribute rather than a
  // second image stacked in front of it.
  if (fileUrl) {
    return (
      <div {...tag} className={["relative", className].filter(Boolean).join(" ")}>
        <video
          ref={playerRef as RefObject<HTMLVideoElement | null>}
          className="h-auto w-full"
          src={fileUrl}
          poster={section.posterImage?.image?.url ?? undefined}
          controls={controls}
          // Never `autoPlay`: playback starts from the overlay click or from
          // the viewport observer, and the attribute would pre-empt both.
          loop={loop}
          muted={muted}
          playsInline
          aria-label={label}
        />
        {!playing && !autoplay ? (
          <button
            type="button"
            onClick={startPlayback}
            aria-label={label}
            className="group absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            {/* The button covers the video, so this reacts to hovering it. */}
            <span className={`${ZOOM_TRANSITION} group-hover:scale-110`}>
              <PlayIcon icon={section.playIcon} />
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  if (!embedUrl) return null;

  // Clicking the poster starts playback, so autoplay is on from that point —
  // unless the viewport owns the decision, which needs the src to stay paused.
  const playbackFlags = {
    ...flags,
    autoplay: viewportAutoplay ? playing : autoplay || playing,
  };
  const embedSrc = applyVideoParams(embedUrl, videoEmbedParamsFor(embedUrl, playbackFlags));

  return (
    <div {...tag} className={["relative aspect-video w-full", className].filter(Boolean).join(" ")}>
      <iframe
        ref={playerRef as RefObject<HTMLIFrameElement | null>}
        className="absolute inset-0 h-full w-full"
        src={embedSrc}
        title={label ?? "Video"}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
