/**
 * Page types that live under a fixed path segment: `/<segment>/<slug>`.
 *
 * THE one place these segments are configured. Rename a segment here and the
 * route, every link to that type and the purge webhook follow; delete a line
 * and that type is no longer routed (its paths 404, links to it render as
 * plain text). The one copy: `sitemap.contentTypes` in
 * seo-essentials.config.mjs (plain .mjs the SEO CLI loads) — change it too;
 * tests/page-routes.test.tsx fails until you do. Flexible Pages are not
 * listed — they store their full path in `url` and keep the catch-all's
 * verbatim lookup; that includes /industries/* and /solutions/*, which were
 * routed types (industryPage, solutionPage) until those were retired.
 *
 * Keys are Contentful content type ids; the GraphQL names derive from them
 * (`resourcePage` → `resourcePageCollection`, `__typename` `ResourcePage`).
 * `headerVariant` marks types that carry the `headerVarient` field.
 *
 * Dependency-free on purpose: lib/content, components and the lib/cms
 * webhook translation all import it.
 */
export const PAGE_ROUTES = {
  resourcePage: { segment: "resources", headerVariant: false },
} as const satisfies Record<string, { segment: string; headerVariant: boolean }>;

export type RoutedPageType = keyof typeof PAGE_ROUTES;

export const ROUTED_PAGE_TYPES = Object.keys(PAGE_ROUTES) as RoutedPageType[];

function isRoutedPageType(value: string): value is RoutedPageType {
  return Object.hasOwn(PAGE_ROUTES, value);
}

/** `ResourcePage` → `resourcePage`. */
function contentTypeOf(typename: string): string {
  return typename.charAt(0).toLowerCase() + typename.slice(1);
}

/** `resourcePage` → `ResourcePage`. */
export function typenameOf(type: RoutedPageType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** `/roi-study/` → `roi-study`. A scan, not a regex: `\/+$` backtracks on runs of slashes. */
function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (value[start] === "/") start++;
  while (end > start && value[end - 1] === "/") end--;
  return value.slice(start, end);
}

/**
 * Public path of a routed page, or null when the type isn't routed or the
 * entry has no slug. Accepts a content type id or a GraphQL `__typename`.
 */
export function routedPagePath(
  type: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const key = type ? contentTypeOf(type) : "";
  const value = trimSlashes(slug?.trim() ?? "");
  if (!isRoutedPageType(key) || !value) return null;
  return `/${PAGE_ROUTES[key].segment}/${value}`;
}

/**
 * The routed type and slug a request path addresses, or null for any other
 * path. A routed segment owns its whole subtree, as the template registry's
 * `<segment>/**` key does (components/sections/registry.tsx): `/resources/a/b`
 * is the slug `a/b`, which no entry has, so it is not found rather than
 * looked up as a Flexible Page. The segment alone (`/resources`) is not routed.
 */
export function matchRoutedPage(
  path: string,
): { type: RoutedPageType; slug: string } | null {
  const [segment, ...rest] = path.split("/").filter(Boolean);
  if (!segment || !rest.length) return null;
  const type = ROUTED_PAGE_TYPES.find((key) => PAGE_ROUTES[key].segment === segment);
  return type ? { type, slug: rest.join("/") } : null;
}

/** A link's page target as `PAGE_LINK_SELECTION` selects it; resolve with `pageHref`. */
export type PageLinkData = {
  __typename?: "FlexiblePage" | "DynamicListingPage" | Capitalize<RoutedPageType>;
  url?: string | null;
  slug?: string | null;
};

/**
 * Where a link to a page entry points: routed types by slug, Flexible Pages by
 * their `url` (stored without a leading slash for most pages in this space,
 * so one is enforced). Null when the entry has no public path.
 */
export function pageHref(
  entry: { __typename?: unknown; url?: unknown; slug?: unknown } | null | undefined,
): string | null {
  if (!entry) return null;
  if (typeof entry.__typename === "string" && typeof entry.slug === "string") {
    const path = routedPagePath(entry.__typename, entry.slug);
    if (path) return path;
  }
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (!url) return null;
  return url.startsWith("/") ? url : `/${url}`;
}
