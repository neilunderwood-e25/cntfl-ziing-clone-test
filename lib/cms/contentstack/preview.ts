/**
 * Contentstack Live Preview — server-side detection.
 *
 * When an editor previews an entry, Contentstack loads the site with a
 * `live_preview` hash (plus `content_type_uid` / `entry_uid`) on the query
 * string. We detect that here and thread it into the GraphQL client so the
 * request targets the preview host and returns draft content.
 *
 * The client-side Live Preview SDK (real-time edit highlighting) is
 * intentionally not wired — this covers only the server fetch path. Add the
 * SDK per-project if editors need in-place editing.
 */
import type { PreviewContext, SearchParams } from "../types";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getPreviewContext(searchParams: SearchParams): PreviewContext | null {
  const hash = firstValue(searchParams.live_preview);
  if (!hash) return null;
  return {
    provider: "contentstack",
    data: {
      hash,
      contentTypeUid: firstValue(searchParams.content_type_uid),
      entryUid: firstValue(searchParams.entry_uid),
    },
  };
}

/** Cheap check used by proxy.ts to mark preview responses uncacheable. */
export function hasPreviewSignal(searchParams: URLSearchParams): boolean {
  return searchParams.has("live_preview") || searchParams.has("preview_timestamp");
}
