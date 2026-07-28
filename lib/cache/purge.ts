import type { PurgeTargets } from "@/lib/cms/types";

/**
 * CDN purge chain.
 *
 * The boilerplate ships with NO CDN, so PURGERS is empty and `purgeCdns()` is
 * a structured no-op: the webhook route still runs end-to-end (auth, payload
 * → targets, logging) and starts purging for real the moment a purger is
 * registered. Registration is what the CDN playbooks do:
 *   docs/playbooks/add-vercel.md  → VercelPurger
 *   docs/playbooks/add-akamai.md  → AkamaiPurger
 *
 * ORDER MATTERS. Purgers run SEQUENTIALLY in array order, and the array must
 * be ordered origin-most first (request path: browser → Akamai → Vercel →
 * origin ⇒ PURGERS = [vercel, akamai]). Purging the outer layer first opens a
 * window where it refills itself from the still-stale inner layer, and the
 * stale copy lives on for a full TTL. Inner-first closes that window.
 */
export type PurgeResult = {
  purger: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
};

export interface CdnPurger {
  /** Short name for logs/results, e.g. "vercel", "akamai". */
  name: string;
  /**
   * Invalidate the given tags/urls. Implementations should retry transient
   * failures (429/5xx, honoring Retry-After) with bounded backoff, and
   * resolve `{ ok: true, skipped: true }` when their credentials are absent
   * rather than throwing — a missing integration must not fail the chain.
   */
  purge(targets: PurgeTargets): Promise<Omit<PurgeResult, "purger">>;
}

/** Origin-most first — see module comment before reordering. */
export const PURGERS: CdnPurger[] = [];

export async function purgeCdns(targets: PurgeTargets): Promise<PurgeResult[]> {
  if (targets.tags.length === 0 && targets.urls.length === 0) return [];

  if (PURGERS.length === 0) {
    console.info("[cache-purge] no CDN purgers registered — no-op", targets);
    return [];
  }

  const results: PurgeResult[] = [];
  for (const purger of PURGERS) {
    try {
      const result = await purger.purge(targets);
      results.push({ purger: purger.name, ...result });
    } catch (error) {
      results.push({
        purger: purger.name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
