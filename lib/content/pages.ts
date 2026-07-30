/**
 * Page data access — the app's content API and the request-scoped,
 * de-duplicated fetch boundary. Components and routes call THIS; nothing
 * above this file touches provider internals beyond `lib/cms`'s public API.
 *
 * `generateMetadata()` and the page component both need the same page, but
 * GraphQL POSTs are NOT memoized by Next's fetch memoization, so the
 * production fetch is wrapped in React `cache()` to guarantee a single
 * round-trip per request. Preview always bypasses the cache for freshness.
 */
import { cache } from "react";
import { cmsQuery } from "@/lib/cms";
import {
  enrichCollections,
  flattenCollections,
  type EnrichmentConfig,
} from "@/lib/cms/contentful";
import type { PreviewContext } from "@/lib/cms/types";
import type { Page, Section } from "@/types/contentful";
import { GET_PAGE_BY_URL } from "./queries/page";

/**
 * Reference collections fetched shallow (`__typename sys { id }`) in the main
 * query and hydrated by the bulked enrichment pass. Empty until a collection
 * has to be pulled out of the main query to stay inside Contentful's query
 * complexity budget — worked example in docs/playbooks/contentful.md.
 */
const ENRICHMENTS: EnrichmentConfig[] = [];

type PageQueryResult = {
  flexiblePageCollection?: {
    items?: Array<Record<string, unknown> | null> | null;
  } | null;
};

/** The page item after collection-flattening. */
type NormalizedPageItem = {
  sys: Page["sys"];
  title?: string | null;
  url?: string | null;
  sections?: Section[] | null;
};

async function queryPage(url: string, preview: PreviewContext | null): Promise<Page | null> {
  const data = await cmsQuery<PageQueryResult>(GET_PAGE_BY_URL, {
    variables: { url },
    preview,
  });

  const rawItem = data.flexiblePageCollection?.items?.[0];
  if (!rawItem) return null;

  // Hydrate any shallow reference collections pulled out of the main query,
  // then normalize collections → arrays.
  const enriched = await enrichCollections(rawItem, ENRICHMENTS, { preview });
  const item = flattenCollections<NormalizedPageItem>(enriched);

  return {
    sys: item.sys,
    title: item.title ?? null,
    url: item.url ?? null,
    sections: item.sections ?? [],
  };
}

const cachedQueryPage = cache((url: string): Promise<Page | null> => queryPage(url, null));

export function getPageByUrl(
  url: string,
  preview: PreviewContext | null = null,
): Promise<Page | null> {
  if (preview) return queryPage(url, preview);
  return cachedQueryPage(url);
}
