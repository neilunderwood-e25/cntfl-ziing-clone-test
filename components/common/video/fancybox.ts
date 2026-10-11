import { type RefObject, useEffect, useMemo } from "react";
import { Fancybox, type FancyboxOptions } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import {
  vimeoEmbedParams,
  videoPlaybackFlags,
  youtubeEmbedParams,
  youtubeVideoId,
} from "./embed";
import type { VideoData } from "./types";

/**
 * Opening a video URL in a Fancybox lightbox — shared by the Button's "Video
 * Popup" link behaviour and by a Video entry authored as "Popup", which need
 * identical options and an identical bind/unbind lifecycle.
 *
 * Callers supply the trigger markup: an anchor whose href is the video URL,
 * carrying `data-fancybox` (a group name unique to that trigger, so unrelated
 * videos do not collapse into one gallery) and, for uploaded files,
 * `data-type="html5video"`.
 */

/**
 * The autoplay/controls/loop/muted toggles, handed to Fancybox rather than
 * pasted onto the URL: it merges these into the iframe src itself, so building
 * a query string here would fight its own. They come from the Video entry
 * being played.
 *
 * Two things to know about the merge. It is shallow, so `youtube` and `vimeo`
 * replace Fancybox's defaults wholesale and the ones worth keeping are repeated
 * below (`enablejsapi`, which its autoplay messaging needs, arrives with the
 * shared youtubeEmbedParams). And
 * every key is forwarded to the URL verbatim, though the shipped types only
 * name the defaults, which is what the cast at the end is for.
 */
export function fancyboxVideoOptions(
  url: string,
  video?: VideoData | null,
): Partial<FancyboxOptions> {
  const flags = videoPlaybackFlags(video);
  const { autoplay, controls, loop, muted } = flags;

  return {
    // Fancybox registers its Hash plugin by default, which pushes the group
    // name onto the URL as a fragment when the lightbox opens. Off: a popup is
    // not a location, and the stray hash would survive a copied link.
    Hash: false,
    // Video is a Carousel plugin, so its options nest under Carousel: the
    // carousel is built from `options.Carousel`, and a top-level `Video` key
    // is never read — it is ignored silently and the defaults stand.
    Carousel: {
      Video: {
        autoplay,
        youtube: {
          nocookie: 1,
          rel: 0,
          fs: 1,
          ...youtubeEmbedParams(flags, youtubeVideoId(url)),
        },
        vimeo: {
          byline: 1,
          color: "00adef",
          dnt: 1,
          ...vimeoEmbedParams(flags),
        },
        // The stock template hardcodes `controls`; these have to be authored.
        html5videoTpl: `<video class="f-html5video" playsinline${controls ? " controls" : ""}${
          loop ? " loop" : ""
        }${muted ? " muted" : ""} controlsList="nodownload" poster="{{poster}}">
    <source src="{{src}}" type="{{format}}" />Sorry, your browser doesn't support embedded videos.</video>`,
      },
    },
    // Cast through unknown: the extra keys above are real at runtime but absent
    // from the shipped option types.
  } as unknown as Partial<FancyboxOptions>;
}

/**
 * Binds Fancybox to the triggers inside `containerRef`, scoped to this
 * component's own subtree so each instance carries its entry's settings.
 * Pass a null `url` when the caller is not a popup — nothing is bound, and an
 * earlier binding is released.
 */
export function useFancyboxVideo(
  containerRef: RefObject<HTMLElement | null>,
  url: string | null,
  video?: VideoData | null,
): void {
  const options = useMemo(() => (url ? fancyboxVideoOptions(url, video) : null), [url, video]);

  useEffect(() => {
    const container = containerRef.current;
    if (!options || !container) return;

    Fancybox.bind(container, "[data-fancybox]", options);
    return () => Fancybox.unbind(container);
  }, [containerRef, options]);
}
