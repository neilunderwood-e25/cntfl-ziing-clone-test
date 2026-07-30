import type { CmsQueryOptions } from "../types";

/**
 * Post-query enrichment — the second half of the N+1 solution.
 *
 * The page is fetched in ONE query (no per-section round trips). When a
 * reference collection inside that query would blow Contentful's query
 * complexity limit (see docs/playbooks/contentful.md), the main query fetches
 * it SHALLOW — just `__typename sys { id }` per item. Afterwards
 * `enrichCollections` walks the tree, collects those ids grouped by
 * `__typename` (so a polymorphic collection of mixed types is handled),
 * bulk-fetches the full entries by id (batched + parallel, see ./by-id.ts),
 * and merges them back in.
 *
 * Pluggable: to enrich a collection, add `{ collectionName, fetchers }` to
 * the ENRICHMENTS config in lib/content/pages.ts. Runs on the RAW collection
 * shape (items arrays), BEFORE `flattenCollections`.
 */
export type IdNodeFetcher = (
  ids: string[],
  options?: Pick<CmsQueryOptions, "preview">,
) => Promise<Map<string, unknown>>;

export type EnrichmentConfig = {
  /** Base field name; the collection is `<collectionName>Collection`. */
  collectionName: string;
  /** Maps an item's `__typename` to the fetcher that hydrates it. */
  fetchers: Partial<Record<string, IdNodeFetcher>>;
};

type AnyObj = Record<string, unknown>;
type Collection = { items?: Array<AnyObj | null> | null };

const collectionKey = (name: string) => `${name}Collection`;

function itemId(item: AnyObj | null | undefined): string | undefined {
  return ((item?.sys as AnyObj | undefined)?.id as string | undefined) ?? undefined;
}

/** Collect ids under `<collectionName>Collection`, grouped by item __typename. */
function collectIdsByType(data: unknown, collectionName: string): Record<string, string[]> {
  const key = collectionKey(collectionName);
  const sets: Record<string, Set<string>> = {};

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as AnyObj;

    const coll = obj[key] as Collection | undefined;
    if (coll?.items) {
      for (const item of coll.items) {
        const typename = item?.__typename as string | undefined;
        const id = itemId(item);
        if (typename && id) (sets[typename] ??= new Set()).add(id);
      }
    }
    for (const value of Object.values(obj)) walk(value);
  };

  walk(data);
  return Object.fromEntries(Object.entries(sets).map(([k, set]) => [k, [...set]]));
}

/** Merge full entries (by sys.id) back into every `<collectionName>Collection`. */
function mergeById(data: unknown, collectionName: string, fullById: Map<string, unknown>): unknown {
  if (fullById.size === 0) return data;
  const key = collectionKey(collectionName);
  const clone = structuredClone(data);

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as AnyObj;

    const coll = obj[key] as Collection | undefined;
    if (coll?.items) {
      coll.items = coll.items.map((item) => {
        const id = itemId(item);
        if (id && fullById.has(id)) {
          return { ...item, ...(fullById.get(id) as AnyObj) };
        }
        return item;
      });
    }
    for (const value of Object.values(obj)) walk(value);
  };

  walk(clone);
  return clone;
}

export async function enrichCollections(
  data: unknown,
  configs: EnrichmentConfig[],
  options?: Pick<CmsQueryOptions, "preview">,
): Promise<unknown> {
  let result = data;

  for (const config of configs) {
    const idsByType = collectIdsByType(result, config.collectionName);

    const typeMaps = await Promise.all(
      Object.entries(idsByType).map(([typename, ids]) => {
        const fetcher = config.fetchers[typename];
        if (typeof fetcher !== "function" || ids.length === 0) {
          return Promise.resolve(new Map<string, unknown>());
        }
        return fetcher(ids, options);
      }),
    );

    const merged = new Map<string, unknown>();
    for (const map of typeMaps) for (const [id, node] of map) merged.set(id, node);

    result = mergeById(result, config.collectionName, merged);
  }

  return result;
}
