import { arrayChunk } from "@/lib/utils";
import { buildQuery, gql } from "../graphql";
import type { CmsQueryOptions } from "../types";
import { fetchGraphQL } from "./client";

// Contentstack caps the number of uids allowed in a single `uid_in` filter.
export const MAX_UID_IN_FILTER = 25;

/**
 * Build a "fetch entries by uid" function for one content type — the bulk
 * fetcher used by the enrichment pass (see ./enrichment.ts).
 *
 * Each returned fetcher takes a flat list of uids, batches them into chunks of
 * MAX_UID_IN_FILTER, runs the chunks in parallel, and returns a
 * `Map<uid, node>`. The `all_<ct>(where:{uid_in})` query is FLAT — reference
 * depth resets at the new root — which is exactly why pulling a deep/expensive
 * connection out into enrichment sidesteps the depth/document limits the
 * inline query would hit.
 *
 * Register concrete fetchers in project code, e.g.:
 *   export const getCtasByUids = makeByUidFetcher("cta", "CtaFields", [CTA_FRAGMENT]);
 */
export function makeByUidFetcher(
  contentTypeUid: string,
  fragmentName: string,
  fragments: string[],
) {
  const query = buildQuery(
    gql`
      query GetByUids($uids: [String!]!) {
        all_${contentTypeUid}(where: { uid_in: $uids }) {
          items {
            ...${fragmentName}
          }
        }
      }
    `,
    fragments,
  );
  const rootField = `all_${contentTypeUid}`;

  return async (
    uids: string[],
    options?: Pick<CmsQueryOptions, "preview">,
  ): Promise<Map<string, unknown>> => {
    const map = new Map<string, unknown>();
    if (uids.length === 0) return map;

    const chunks = arrayChunk(uids, MAX_UID_IN_FILTER);
    const results = await Promise.all(
      chunks.map((chunk) =>
        fetchGraphQL<Record<string, { items?: Array<{ system?: { uid?: string } }> }>>(query, {
          variables: { uids: chunk },
          preview: options?.preview ?? null,
        }),
      ),
    );

    for (const res of results) {
      for (const item of res[rootField]?.items ?? []) {
        if (item.system?.uid) map.set(item.system.uid, item);
      }
    }
    return map;
  };
}
