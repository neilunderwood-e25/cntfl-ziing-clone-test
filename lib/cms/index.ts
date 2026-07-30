/**
 * CMS public API — the single entry point the rest of the app talks to.
 *
 * The active provider is selected by `CMS_PROVIDER` (default and currently
 * only implementation: contentful). A future provider would implement
 * `CmsAdapter` under lib/cms/<provider>/ and register in ADAPTERS.
 */
import { contentfulAdapter } from "./contentful";
import type { CmsAdapter, CmsQueryOptions, PreviewContext, SearchParams } from "./types";

const ADAPTERS: Record<string, CmsAdapter> = {
  contentful: contentfulAdapter,
};

export function getCms(): CmsAdapter {
  const provider = process.env.CMS_PROVIDER || "contentful";
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(
      `[cms] Unknown CMS_PROVIDER "${provider}". Registered: ${Object.keys(ADAPTERS).join(", ")}`,
    );
  }
  return adapter;
}

export function cmsQuery<T>(document: string, options?: CmsQueryOptions): Promise<T> {
  return getCms().query<T>(document, options);
}

export function getPreviewContext(searchParams: SearchParams): PreviewContext | null {
  return getCms().getPreviewContext(searchParams);
}

export function isCmsConfigured(): boolean {
  return getCms().isConfigured();
}

export type { CmsAdapter, CmsQueryOptions, PreviewContext, SearchParams } from "./types";
