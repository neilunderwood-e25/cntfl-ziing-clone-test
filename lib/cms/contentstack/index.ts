/**
 * Contentstack adapter — assembles the pieces into the CmsAdapter contract.
 *
 * Provider-specific helpers that project code composes directly (they operate
 * on Contentstack's response shape, not through the adapter interface) are
 * re-exported here: `flattenConnections`, `enrichConnections`,
 * `makeByUidFetcher`. See docs/playbooks/contentstack.md.
 */
import type { CmsAdapter } from "../types";
import { fetchGraphQL } from "./client";
import { isContentstackConfigured } from "./config";
import { getPreviewContext, hasPreviewSignal } from "./preview";
import { webhookToPurgeTargets } from "./webhook";

export const contentstackAdapter: CmsAdapter = {
  provider: "contentstack",
  isConfigured: isContentstackConfigured,
  query: fetchGraphQL,
  getPreviewContext,
  hasPreviewSignal,
  webhookToPurgeTargets,
};

export { flattenConnections } from "./normalize";
export { enrichConnections, type EnrichmentConfig, type UidNodeFetcher } from "./enrichment";
export { makeByUidFetcher, MAX_UID_IN_FILTER } from "./by-uid";
