import type { TagAttributes } from "@eight25-factory/live-preview";

/**
 * Inspector-mode tags, read from the data rather than computed in components.
 *
 * In a draft-mode request the catch-all runs the page's sections through
 * `attachPreviewTags` (./attach-tags.ts, server-only), which gives every
 * record carrying `sys.id` a `$` map: field id → the attributes
 * `previewTags(state, record)(field)` returns. Server and Client Components
 * then tag alike — `<h2 {...fieldTag(card, "title")}>` — with no preview
 * state to thread through and no client hook. Outside preview there is no `$`
 * map, so this returns undefined and the spread renders nothing.
 *
 * Collections are flattened before tagging (`ctaCollection` → `cta`), and the
 * flattened key IS the Contentful field id, so a list wrapper is tagged with
 * the parent's key and each item with its own record.
 */
export const PREVIEW_TAGS_KEY = "$";

export type PreviewFieldTag = TagAttributes | undefined;

export function fieldTag(record: unknown, field: string): PreviewFieldTag {
  if (typeof record !== "object" || record === null) return undefined;
  const tags = (record as Record<string, unknown>)[PREVIEW_TAGS_KEY];
  if (typeof tags !== "object" || tags === null) return undefined;
  return (tags as Record<string, TagAttributes | undefined>)[field];
}
