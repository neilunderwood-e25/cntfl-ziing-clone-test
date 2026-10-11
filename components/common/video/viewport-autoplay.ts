import { type RefObject, useEffect } from "react";

/**
 * Autoplay driven by the viewport rather than by page load: an inline video
 * authored with autoplay starts once it is half on screen and pauses when it
 * has scrolled away.
 *
 * The caller must also stop the player starting on its own — no `autoPlay`
 * attribute on the <video>, `autoplay=0` in the embed URL — or the markup wins
 * the race and the video is already playing before it is visible.
 *
 * A player in a cross-origin iframe cannot be called directly; YouTube and
 * Vimeo both listen for postMessage, and YouTube only does so when the src
 * carries `enablejsapi=1` (see youtubeEmbedParams).
 */

/** Half on screen starts it; nothing on screen stops it. */
const PLAY_RATIO = 0.5;

export type PlayableElement = HTMLVideoElement | HTMLIFrameElement;

function command(element: PlayableElement, action: "play" | "pause"): void {
  if (element instanceof HTMLVideoElement) {
    if (action === "pause") {
      element.pause();
      return;
    }
    // Browsers reject autoplay with sound; that rejection is expected, not a
    // failure worth surfacing.
    void element.play().catch(() => {});
    return;
  }

  const target = element.contentWindow;
  if (!target) return;

  let targetOrigin: string;
  try {
    targetOrigin = new URL(element.src).origin;
  } catch {
    return;
  }
  if (!targetOrigin || targetOrigin === "null") return;

  if (YOUTUBE.test(element.src)) {
    const func = action === "play" ? "playVideo" : "pauseVideo";
    target.postMessage(JSON.stringify({ event: "command", func, args: [] }), targetOrigin);
    return;
  }
  if (/vimeo\.com/i.test(element.src)) {
    target.postMessage(JSON.stringify({ method: action }), targetOrigin);
  }
}

const YOUTUBE = /youtube(-nocookie)?\.com/i;

/**
 * Embedded players ignore commands that arrive before they are ready, and the
 * observer usually fires first — a frame that is already on screen, or
 * scrolled to quickly, is told to play before its player has loaded, and the
 * command is simply dropped. Each host announces readiness its own way:
 * Vimeo posts `ready` unprompted, while YouTube only reports once the page has
 * posted `listening` (answering with `onReady`, or `initialDelivery` when it
 * was already ready).
 */
const READY_EVENTS = new Set(["ready", "onReady", "initialDelivery"]);

function readyEvent(data: unknown): boolean {
  let message = data;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return false;
    }
  }
  const event = (message as { event?: unknown } | null)?.event;
  return typeof event === "string" && READY_EVENTS.has(event);
}

/** Asks a YouTube player to start reporting its events to this page. */
function listen(frame: HTMLIFrameElement): void {
  const target = frame.contentWindow;
  if (!target || !YOUTUBE.test(frame.src)) return;
  try {
    target.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      new URL(frame.src).origin,
    );
  } catch {
    // An unparsable src has no origin to address; nothing to listen to.
  }
}

export function useViewportAutoplay(
  ref: RefObject<PlayableElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    // Nothing else starts an autoplay video any more — the markup deliberately
    // carries no `autoplay` — so without the observer, play it outright rather
    // than leave it stuck.
    if (typeof IntersectionObserver === "undefined") {
      command(element, "play");
      return;
    }

    let shouldPlay = false;
    const apply = () => command(element, shouldPlay ? "play" : "pause");

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Between the two thresholds — on screen but less than half — whatever
        // it was already doing stands.
        if (entry.intersectionRatio >= PLAY_RATIO) shouldPlay = true;
        else if (!entry.isIntersecting) shouldPlay = false;
        else return;
        apply();
      },
      { threshold: [0, PLAY_RATIO] },
    );
    // Visibility is read off the player's wrapper — the box the Video
    // component lays out on the page — rather than the player itself. A
    // section may size the player past that box to crop it like object-cover
    // (a 16:9 embed filling a tall frame); the player's own box then shows
    // only a fraction of itself however fully the frame is on screen, and
    // would never pass PLAY_RATIO. For an unscaled player the two coincide.
    observer.observe(element.parentElement ?? element);

    // play() is rejected while the file still has no data, which is the normal
    // case for a video scrolled to before it has buffered. Try again the moment
    // it can play, as long as it is still meant to be playing.
    const video = element instanceof HTMLVideoElement ? element : null;
    const onCanPlay = () => {
      if (shouldPlay && video?.paused) apply();
    };
    video?.addEventListener("canplay", onCanPlay);

    // An embed gets the same second chance once its player reports ready —
    // see READY_EVENTS. The frame is server-rendered, so it may have loaded
    // before this effect ran: ask YouTube to report now, and again on load.
    const frame = element instanceof HTMLIFrameElement ? element : null;
    const onFrameLoad = () => {
      if (frame) listen(frame);
    };
    const onMessage = (event: MessageEvent) => {
      if (!frame || event.source !== frame.contentWindow) return;
      if (shouldPlay && readyEvent(event.data)) apply();
    };
    if (frame) {
      frame.addEventListener("load", onFrameLoad);
      window.addEventListener("message", onMessage);
      listen(frame);
    }

    return () => {
      observer.disconnect();
      video?.removeEventListener("canplay", onCanPlay);
      frame?.removeEventListener("load", onFrameLoad);
      window.removeEventListener("message", onMessage);
    };
  }, [ref, enabled]);
}
