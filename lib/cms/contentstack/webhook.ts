import { tagContentType, tagEntry, tagRoute } from "@/lib/cache/tags";
import type { PurgeTargets } from "../types";

/**
 * Contentstack publish webhook payload → CDN purge targets.
 *
 * Only `publish`, `unpublish`, and `delete` produce targets. Other events
 * (create, draft update, publish.start, …) return empty targets — cached
 * content reflects the last *published* version, so drafts must not purge.
 *
 * Tag policy (deliberately conservative — see docs/playbooks/caching.md):
 *  - `cms-entry-<uid>`  — every cached page that embedded this entry.
 *  - `cms-route-<path>` — the entry's own page, when it has a `url`.
 *  - `cms-ct-<uid>`     — only for a synthetic operator payload carrying a
 *    content type but no entry identity (manual whole-type sweep). Automatic
 *    per-entry publishes never trigger type-wide purges.
 *
 * Payload shape (Contentstack v3 webhook, relevant fields only):
 *   { event, module, data: { entry: { uid, locale, url? }, content_type: { uid } } }
 * `data.entry.url` is OPTIONAL — concise payload mode and URL-less content
 * types omit it; everything here tolerates missing fields.
 */
type ContentstackWebhookPayload = {
  event?: string;
  module?: string;
  data?: {
    entry?: { uid?: string; locale?: string; url?: string };
    content_type?: { uid?: string };
  };
};

const PURGE_EVENTS = new Set(["publish", "unpublish", "delete"]);

export function webhookToPurgeTargets(payload: unknown): PurgeTargets {
  const { event, data } = (payload ?? {}) as ContentstackWebhookPayload;
  if (!event || !PURGE_EVENTS.has(event)) return { tags: [], urls: [] };

  const entry = data?.entry;
  const contentTypeUid = data?.content_type?.uid;
  const tags: string[] = [];
  const urls: string[] = [];

  if (entry?.uid) tags.push(tagEntry(entry.uid));
  if (entry?.url) {
    tags.push(tagRoute(entry.url));
    urls.push(entry.url.startsWith("/") ? entry.url : `/${entry.url}`);
  }
  if (contentTypeUid && !entry?.uid && !entry?.url) {
    tags.push(tagContentType(contentTypeUid));
  }

  return { tags: Array.from(new Set(tags)), urls: Array.from(new Set(urls)) };
}
