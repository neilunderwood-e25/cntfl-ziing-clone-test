import { tagContentType, tagEntry, tagRoute } from "@/lib/cache/tags";
import type { PurgeTargets } from "../types";

/**
 * Contentful webhook payload → CDN purge targets.
 *
 * The event kind lives in the `X-Contentful-Topic` HEADER (e.g.
 * `ContentManagement.Entry.publish`), not the body — the route passes request
 * headers through for this. Only publish/unpublish/delete/archive events
 * produce targets; draft auto-saves and the rest return empty targets —
 * cached content reflects the last *published* version.
 *
 * Tag policy (deliberately conservative — see docs/playbooks/caching.md):
 *  - `cms-entry-<sys.id>` — every cached page that embedded this entry/asset.
 *  - `cms-route-<path>`   — the entry's own page, from its `url` field
 *    (localized: every locale's value is purged).
 *  - `cms-ct-<id>`        — the entry's content type. Emitted as a tag only;
 *    it becomes meaningful once responses carry content-type tags.
 *
 * Body shape (relevant fields): `{ sys: { id, type, contentType: { sys: { id } } },
 * fields: { url: { "<locale>": "/pricing" } } }`. Everything is optional-chained —
 * DeletedEntry payloads carry no fields.
 */
type ContentfulWebhookPayload = {
  sys?: {
    id?: string;
    type?: string;
    contentType?: { sys?: { id?: string } };
  };
  fields?: {
    url?: Record<string, string | undefined>;
  };
};

const PURGE_ACTIONS = new Set(["publish", "unpublish", "delete", "archive"]);

export function webhookToPurgeTargets(payload: unknown, headers?: Headers): PurgeTargets {
  const topic = headers?.get("x-contentful-topic") ?? "";
  const action = topic.split(".").pop() ?? "";
  if (!PURGE_ACTIONS.has(action)) return { tags: [], urls: [] };

  const { sys, fields } = (payload ?? {}) as ContentfulWebhookPayload;
  const tags: string[] = [];
  const urls: string[] = [];

  if (sys?.id) tags.push(tagEntry(sys.id));

  const contentTypeId = sys?.contentType?.sys?.id;
  if (contentTypeId) tags.push(tagContentType(contentTypeId));

  for (const url of Object.values(fields?.url ?? {})) {
    if (!url) continue;
    tags.push(tagRoute(url));
    urls.push(url.startsWith("/") ? url : `/${url}`);
  }

  return { tags: Array.from(new Set(tags)), urls: Array.from(new Set(urls)) };
}
