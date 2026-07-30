/**
 * The CMS client contract — the ONLY seam between this codebase and the CMS.
 *
 * Everything above it (components, lib/content, app routes) talks to
 * `lib/cms`'s public API only; everything below it (lib/cms/<provider>/)
 * owns endpoints, auth, retry, preview routing, and response-shape quirks.
 * This version supports a single provider (Contentful); the interface
 * exists so infrastructure concerns stay behind one boundary, not to host
 * multiple CMSs at once.
 *
 * DELIBERATE NON-GOAL — query abstraction: query documents are NOT masked
 * behind this interface (that was rejected as over-abstraction). Queries are
 * provider-native project code in `lib/content/queries/`, passed to
 * `query()`, which handles endpoint/config/auth routing.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Opaque editor-preview token. Minted by the active adapter from the incoming
 * request (`getPreviewContext`) and passed back into `query()`. The app never
 * inspects `data` — its keys are adapter-defined.
 */
export type PreviewContext = {
  provider: string;
  data: Record<string, string | undefined>;
};

export type CmsQueryOptions = {
  variables?: Record<string, unknown>;
  /** Present → fetch draft content from the provider's preview endpoint. */
  preview?: PreviewContext | null;
  signal?: AbortSignal;
};

/** What a CMS publish event asks the CDN layer to invalidate. */
export type PurgeTargets = {
  /** Cache tags (see lib/cache/tags.ts for the format rules). */
  tags: string[];
  /** Public URL paths ("/pricing") for CDNs purging by URL instead of tag. */
  urls: string[];
};

export interface CmsAdapter {
  readonly provider: string;

  /** True when every env var the adapter needs is present. */
  isConfigured(): boolean;

  /**
   * Execute a provider-native query document. Handles endpoint selection,
   * auth headers, retry/backoff and preview routing internally.
   */
  query<T>(document: string, options?: CmsQueryOptions): Promise<T>;

  /** Detect an editor-preview request from its search params. */
  getPreviewContext(searchParams: SearchParams): PreviewContext | null;

  /** Cheap preview check for proxy.ts (no request body / cookies parsing). */
  hasPreviewSignal(searchParams: URLSearchParams): boolean;

  /**
   * Map a publish/unpublish/delete webhook event to purge targets. Some
   * providers carry the event kind in a header (Contentful's
   * `X-Contentful-Topic`), so the request headers are passed through.
   * Non-purge events (drafts, workflow noise) return empty targets.
   */
  webhookToPurgeTargets(payload: unknown, headers?: Headers): PurgeTargets;
}
