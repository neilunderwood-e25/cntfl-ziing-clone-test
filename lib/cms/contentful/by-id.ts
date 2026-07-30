import { arrayChunk } from "@/lib/utils";
import { buildQuery, gql } from "../graphql";
import type { CmsQueryOptions } from "../types";
import { fetchGraphQL } from "./client";

/**
 * Batch size for `sys: { id_in }` lookups. Contentful accepts larger arrays,
 * but the collection `limit` must cover the chunk and both count toward the
 * per-query complexity budget — 50 keeps each follow-up query trivially cheap.
 */
export const MAX_ID_IN_FILTER = 50;

/**
 * Build a "fetch entries by sys.id" function for one content type — the bulk
 * fetcher used by the enrichment pass (see ./enrichment.ts).
 *
 * Each returned fetcher takes a flat list of ids, batches them into chunks of
 * MAX_ID_IN_FILTER, runs the chunks in parallel, and returns a
 * `Map<sys.id, entry>`. The `<ct>Collection(where: { sys: { id_in } })` query
 * is a NEW query root, so its complexity budget resets — which is exactly why
 * pulling an expensive collection out into enrichment sidesteps the limits
 * the inline query would hit.
 *
 * Register concrete fetchers in project code, e.g.:
 *   export const getHeroBannersByIds =
 *     makeByIdFetcher("heroBanner", "HeroBannerFields", [HERO_BANNER_FRAGMENT]);
 */
export function makeByIdFetcher(
  contentTypeId: string,
  fragmentName: string,
  fragments: string[],
) {
  const collectionField = `${contentTypeId}Collection`;
  const query = buildQuery(
    gql`
      query GetByIds($ids: [String!]!, $preview: Boolean = false) {
        ${collectionField}(where: { sys: { id_in: $ids } }, limit: ${MAX_ID_IN_FILTER}, preview: $preview) {
          items {
            ...${fragmentName}
          }
        }
      }
    `,
    fragments,
  );

  return async (
    ids: string[],
    options?: Pick<CmsQueryOptions, "preview">,
  ): Promise<Map<string, unknown>> => {
    const map = new Map<string, unknown>();
    if (ids.length === 0) return map;

    const chunks = arrayChunk(ids, MAX_ID_IN_FILTER);
    const results = await Promise.all(
      chunks.map((chunk) =>
        fetchGraphQL<Record<string, { items?: Array<{ sys?: { id?: string } } | null> }>>(query, {
          variables: { ids: chunk },
          preview: options?.preview ?? null,
        }),
      ),
    );

    for (const res of results) {
      for (const item of res[collectionField]?.items ?? []) {
        if (item?.sys?.id) map.set(item.sys.id, item);
      }
    }
    return map;
  };
}
