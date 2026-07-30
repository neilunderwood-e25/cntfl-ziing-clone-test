/**
 * Contentful preview — server-side detection.
 *
 * Editors load the site with `?preview=<secret>`; when the secret matches
 * `CONTENTFUL_PREVIEW_SECRET`, the GraphQL client switches to the Content
 * Preview API token and `preview: true` queries, returning draft content.
 * (Configure the same URL pattern in Contentful's content-preview settings.)
 *
 * The Contentful Live Preview SDK (in-place editing / inspector mode) is
 * intentionally not wired — this covers only the server fetch path. Add
 * `@contentful/live-preview` per-project if editors need it.
 */
import type { PreviewContext, SearchParams } from "../types";
import { getContentfulConfig, isContentfulConfigured } from "./config";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getPreviewContext(searchParams: SearchParams): PreviewContext | null {
  const provided = firstValue(searchParams.preview);
  if (!provided || !isContentfulConfigured()) return null;

  const { previewSecret } = getContentfulConfig();
  if (!previewSecret || provided !== previewSecret) return null;

  return { provider: "contentful", data: {} };
}

/**
 * Cheap check used by proxy.ts to mark preview responses uncacheable. Fires
 * on the parameter's presence (no secret validation in proxy — worst case an
 * invalid-secret request goes uncached, which is safe).
 */
export function hasPreviewSignal(searchParams: URLSearchParams): boolean {
  return searchParams.has("preview");
}
