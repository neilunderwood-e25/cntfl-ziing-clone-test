import { NextResponse, type NextRequest } from "next/server";
import {
  applyCacheHeaders,
  NO_STORE_PROFILE,
  pageCacheProfile,
} from "@/lib/cache/headers";
import { tagRoute } from "@/lib/cache/tags";
import { getCms } from "@/lib/cms";

/**
 * Proxy (Next 16's middleware) — stamps CDN cache directives on every page
 * response. This is the ONLY place HTML cache headers are set; route handlers
 * (feeds, sitemaps) set their own via `buildCacheHeaders`.
 *
 * Editor-preview requests are marked `private, no-store` across all layers so
 * draft content can never be cached publicly.
 *
 * KEEP THIS FAST: no data fetching in here (Next docs: proxy is not intended
 * for slow data fetching). The page's full-URL lookup strategy exists
 * precisely so proxy never has to resolve slugs against the CMS.
 */
export default function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname, searchParams } = request.nextUrl;

  if (getCms().hasPreviewSignal(searchParams)) {
    applyCacheHeaders(response.headers, NO_STORE_PROFILE);
    return response;
  }

  // Route tag is emitted only once a CDN tag header is registered in
  // TAG_HEADER_NAMES (lib/cache/headers.ts); computing it here is free.
  applyCacheHeaders(response.headers, pageCacheProfile(), [tagRoute(pathname)]);
  return response;
}

export const config = {
  // Pages only: skip API routes, Next internals/assets, and any path with a
  // file extension (public/ assets). sitemap.xml/robots.txt are excluded here
  // because as route handlers they own their headers via buildCacheHeaders.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
