/**
 * The CMS adapter contract — the ONLY seam between this codebase and any
 * headless CMS.
 *
 * Everything above this interface (components, lib/content, app routes) is
 * CMS-agnostic: it talks to `lib/cms` and consumes the app-level types in
 * `types/content.ts`. Everything below it (lib/cms/<provider>/) is
 * provider-specific: endpoints, auth, retry, preview routing, response-shape
 * quirks.
 *
 * DELIBERATE NON-GOAL — query abstraction: query documents are NOT masked
 * behind this interface. GraphQL schemas differ per CMS (Contentstack's
 * `all_x { items }` vs Contentful's `xCollection { items }`), so queries are
 * provider-specific project code living in `lib/content/queries/`. Devs (or
 * agents) author them against the active provider's schema and pass them to
 * `query()`, which handles endpoint/config/auth routing. Swapping CMS means
 * rewriting the queries + the thin mappers in `lib/content/`, never the
 * components. See docs/playbooks/add-cms-adapter.md.
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
   * Execute a provider-native query document (GraphQL for Contentstack /
   * Contentful). Handles endpoint selection, auth headers, retry/backoff and
   * preview routing internally.
   */
  query<T>(document: string, options?: CmsQueryOptions): Promise<T>;

  /** Detect an editor-preview request from its search params. */
  getPreviewContext(searchParams: SearchParams): PreviewContext | null;

  /** Cheap preview check for proxy.ts (no request body / cookies parsing). */
  hasPreviewSignal(searchParams: URLSearchParams): boolean;

  /**
   * Map a publish/unpublish/delete webhook payload to purge targets.
   * Non-purge events (drafts, workflow noise) return empty targets.
   */
  webhookToPurgeTargets(payload: unknown): PurgeTargets;
}
