/**
 * CMS public API — the single entry point the rest of the app talks to.
 *
 * The active provider is selected by `CMS_PROVIDER` (default: contentstack).
 * To add a provider, implement `CmsAdapter` under lib/cms/<provider>/ and
 * register it in ADAPTERS. See docs/playbooks/add-cms-adapter.md.
 */
import { contentstackAdapter } from "./contentstack";
import type { CmsAdapter, CmsQueryOptions, PreviewContext, SearchParams } from "./types";

const ADAPTERS: Record<string, CmsAdapter> = {
  contentstack: contentstackAdapter,
};

export function getCms(): CmsAdapter {
  const provider = process.env.CMS_PROVIDER || "contentstack";
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
