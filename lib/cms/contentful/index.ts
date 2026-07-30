/**
 * Contentful adapter — assembles the pieces into the CmsAdapter contract.
 *
 * Provider-specific helpers that project code composes directly (they operate
 * on Contentful's response shape, not through the adapter interface) are
 * re-exported here: `flattenCollections`, `enrichCollections`,
 * `makeByIdFetcher`. See docs/playbooks/contentful.md.
 */
import type { CmsAdapter } from "../types";
import { fetchGraphQL } from "./client";
import { isContentfulConfigured } from "./config";
import { getPreviewContext, hasPreviewSignal } from "./preview";
import { webhookToPurgeTargets } from "./webhook";

export const contentfulAdapter: CmsAdapter = {
  provider: "contentful",
  isConfigured: isContentfulConfigured,
  query: fetchGraphQL,
  getPreviewContext,
  hasPreviewSignal,
  webhookToPurgeTargets,
};

export { flattenCollections } from "./normalize";
export { enrichCollections, type EnrichmentConfig, type IdNodeFetcher } from "./enrichment";
export { makeByIdFetcher, MAX_ID_IN_FILTER } from "./by-id";
