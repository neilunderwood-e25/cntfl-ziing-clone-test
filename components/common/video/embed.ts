import type { VideoData } from "./types";

/**
 * One place that answers "what URL plays this Video entry?".
 *
 * Authors pick a `videoSource` and fill the matching field; Contentful also
 * carries an authored `embedUrl` for the hosted sources. Both the inline
 * player and the Fancybox popup resolve through here so the two can never
 * disagree about what a given entry points at.
 */

/** Watch/share URLs are what authors paste; players need the embed form. */
function deriveEmbedUrl(video: VideoData): string | null {
  if (video.videoSource === "Youtube URL" && video.youtubeUrl) {
    const id = video.youtubeUrl.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : video.youtubeUrl;
  }
  if (video.videoSource === "Vimeo URL" && video.vimeoUrl) {
    const id = video.vimeoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : video.vimeoUrl;
  }
  return null;
}

/**
 * Embed URL for a hosted source. The authored `embedUrl` wins; deriving it
 * from the pasted watch URL remains the fallback for entries saved before
 * that field existed. Returns null for uploaded files, which have no embed.
 */
export function videoEmbedUrl(video?: VideoData | null): string | null {
  if (!video || video.videoSource === "Upload") return null;
  return video.embedUrl ?? deriveEmbedUrl(video);
}

/** The YouTube video id, needed to make a single video loop. */
export function youtubeVideoId(url?: string | null): string | null {
  return url?.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/)?.[1] ?? null;
}

export type VideoPlaybackFlags = {
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  muted: boolean;
};

/**
 * The four authored playback toggles, with the defaults every player shares:
 * controls on unless an author turns them off, the rest off unless asked for.
 */
export function videoPlaybackFlags(video?: VideoData | null): VideoPlaybackFlags {
  return {
    autoplay: Boolean(video?.autoplay),
    controls: video?.controls ?? true,
    loop: Boolean(video?.loop),
    muted: Boolean(video?.muted),
  };
}

export type VideoEmbedParams = Record<string, string | number>;

/**
 * The playback flags in YouTube's spelling. Two quirks it insists on: muting
 * is `mute`, not `muted`, and a single video only loops when it is also handed
 * to itself as a playlist.
 */
export function youtubeEmbedParams(
  flags: VideoPlaybackFlags,
  videoId?: string | null,
): VideoEmbedParams {
  const bit = (on: boolean): 0 | 1 => (on ? 1 : 0);
  return {
    // Required before the player answers postMessage, which is how both the
    // lightbox and the viewport observer start and stop it.
    enablejsapi: 1,
    autoplay: bit(flags.autoplay),
    controls: bit(flags.controls),
    mute: bit(flags.muted),
    ...(flags.loop && videoId ? { loop: 1, playlist: videoId } : { loop: 0 }),
  };
}

/** The same flags in Vimeo's spelling. */
export function vimeoEmbedParams(flags: VideoPlaybackFlags): VideoEmbedParams {
  const bit = (on: boolean): 0 | 1 => (on ? 1 : 0);
  return {
    autoplay: bit(flags.autoplay),
    controls: bit(flags.controls),
    loop: bit(flags.loop),
    muted: bit(flags.muted),
  };
}

/** Whichever spelling this URL's host wants. */
export function videoEmbedParamsFor(url: string, flags: VideoPlaybackFlags): VideoEmbedParams {
  return /vimeo\.com/i.test(url)
    ? vimeoEmbedParams(flags)
    : youtubeEmbedParams(flags, youtubeVideoId(url));
}

/**
 * Adds parameters to a URL that may already carry some — `url + "?autoplay=1"`
 * produces a second `?` and silently breaks every embed URL with a query
 * string, which is the shape Contentful's authored `embedUrl` usually has.
 */
export function applyVideoParams(url: string, params: VideoEmbedParams): string {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) parsed.searchParams.set(key, String(value));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** An uploaded file's own URL — null for the hosted sources. */
export function videoFileUrl(video?: VideoData | null): string | null {
  if (video?.videoSource !== "Upload") return null;
  return video?.video?.url ?? null;
}

/**
 * Whatever a player should load for this entry: the uploaded file when the
 * source is an upload, the embed URL otherwise.
 */
export function videoPlaybackUrl(video?: VideoData | null): string | null {
  return videoFileUrl(video) ?? videoEmbedUrl(video);
}
