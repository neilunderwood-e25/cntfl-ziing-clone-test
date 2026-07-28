import type { CmsQueryOptions } from "../types";

/**
 * Post-query enrichment — the second half of the N+1 solution.
 *
 * The page is fetched in ONE query (no per-section round trips). When a
 * reference connection inside that query would blow Contentstack's limits
 * (reference depth ≤ 3, resolver cost ≤ 20, ≤ 7500 documents — see
 * docs/playbooks/contentstack.md), the main query fetches it SHALLOW — just
 * `node { __typename system { uid } }`. Afterwards `enrichConnections` walks
 * the tree, collects those uids grouped by `__typename` (so a polymorphic
 * union like image|video|cta is handled), bulk-fetches the full entries by
 * uid (batched + parallel, see ./by-uid.ts), and merges them back in.
 *
 * Pluggable: to enrich a connection, add `{ connectionName, fetchers }` to the
 * ENRICHMENTS config in lib/content/pages.ts. Runs on the RAW connection shape
 * (edges/node), BEFORE `flattenConnections`.
 */
export type UidNodeFetcher = (
  uids: string[],
  options?: Pick<CmsQueryOptions, "preview">,
) => Promise<Map<string, unknown>>;

export type EnrichmentConfig = {
  /** Base field name; the connection is `<connectionName>Connection`. */
  connectionName: string;
  /** Maps a node's `__typename` to the fetcher that hydrates it. */
  fetchers: Partial<Record<string, UidNodeFetcher>>;
};

type AnyObj = Record<string, unknown>;
type Connection = { edges?: Array<{ node?: AnyObj } | null> | null };

const connectionKey = (name: string) => `${name}Connection`;

/** Collect uids under `<connectionName>Connection`, grouped by node __typename. */
function collectUidsByType(data: unknown, connectionName: string): Record<string, string[]> {
  const key = connectionKey(connectionName);
  const sets: Record<string, Set<string>> = {};

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as AnyObj;

    const conn = obj[key] as Connection | undefined;
    if (conn?.edges) {
      for (const edge of conn.edges) {
        const n = edge?.node;
        const typename = n?.__typename as string | undefined;
        const uid = (n?.system as AnyObj | undefined)?.uid as string | undefined;
        if (typename && uid) (sets[typename] ??= new Set()).add(uid);
      }
    }
    for (const value of Object.values(obj)) walk(value);
  };

  walk(data);
  return Object.fromEntries(Object.entries(sets).map(([k, set]) => [k, [...set]]));
}

/** Merge full nodes (by uid) back into every `<connectionName>Connection` edge. */
function mergeByUid(data: unknown, connectionName: string, fullByUid: Map<string, unknown>): unknown {
  if (fullByUid.size === 0) return data;
  const key = connectionKey(connectionName);
  const clone = structuredClone(data);

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as AnyObj;

    const conn = obj[key] as Connection | undefined;
    if (conn?.edges) {
      conn.edges = conn.edges.map((edge) => {
        const n = edge?.node;
        const uid = (n?.system as AnyObj | undefined)?.uid as string | undefined;
        if (uid && fullByUid.has(uid)) {
          return { ...edge, node: { ...n, ...(fullByUid.get(uid) as AnyObj) } };
        }
        return edge;
      });
    }
    for (const value of Object.values(obj)) walk(value);
  };

  walk(clone);
  return clone;
}

export async function enrichConnections(
  data: unknown,
  configs: EnrichmentConfig[],
  options?: Pick<CmsQueryOptions, "preview">,
): Promise<unknown> {
  let result = data;

  for (const config of configs) {
    const uidsByType = collectUidsByType(result, config.connectionName);

    const typeMaps = await Promise.all(
      Object.entries(uidsByType).map(([typename, uids]) => {
        const fetcher = config.fetchers[typename];
        if (typeof fetcher !== "function" || uids.length === 0) {
          return Promise.resolve(new Map<string, unknown>());
        }
        return fetcher(uids, options);
      }),
    );

    const merged = new Map<string, unknown>();
    for (const map of typeMaps) for (const [uid, node] of map) merged.set(uid, node);

    result = mergeByUid(result, config.connectionName, merged);
  }

  return result;
}
