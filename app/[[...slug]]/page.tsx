import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsSetupNotice } from "@/components/dev/cms-setup-notice";
import { SectionRenderer } from "@/components/sections/registry";
import { getCms, getPreviewContext, isCmsConfigured } from "@/lib/cms";
import { getPageByUrl } from "@/lib/content/pages";

/**
 * Catch-all route for CMS-driven pages.
 *
 * The page entry stores its FULL public path in `url`, so any request path
 * maps directly to one `getPageByUrl` lookup — no proxy/middleware fetch is
 * needed to resolve a content-type prefix, and the whole page arrives in one
 * query (see lib/content/queries/page.ts).
 *
 * Reading `searchParams` opts the route into dynamic (SSR) rendering — which
 * is the design: the CDN caches via the response headers set in proxy.ts,
 * never the Next data layer (see lib/cache/headers.ts).
 */
type PageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function urlFromSlug(slug?: string[]): string {
  if (!slug || slug.length === 0) return "/";
  return `/${slug.join("/")}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  if (!isCmsConfigured()) return {};
  const { slug } = await params;
  const preview = getPreviewContext(await searchParams);
  const page = await getPageByUrl(urlFromSlug(slug), preview);
  if (!page) return {};

  // TODO(project): map the full SEO field group once the content model has one.
  return {
    title: page.title ?? undefined,
  };
}

export default async function CmsPageRoute({ params, searchParams }: PageProps) {
  if (!isCmsConfigured()) {
    return <CmsSetupNotice provider={getCms().provider} />;
  }

  const { slug } = await params;
  const preview = getPreviewContext(await searchParams);

  // De-duplicated with generateMetadata via React.cache on the production path.
  const page = await getPageByUrl(urlFromSlug(slug), preview);
  if (!page) notFound();

  return (
    <main>
      <SectionRenderer sections={page.sections} />
    </main>
  );
}
