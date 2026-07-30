/**
 * Lean Contentful GraphQL transport.
 *
 * Native `fetch` POST — no Apollo/SDK runtime. We deliberately do NOT cache in
 * the Next data layer (`cache: "no-store"`): this is a full-SSR app where the
 * CDN is the sole cache tier (see docs/playbooks/caching.md), and caching here
 * would break tag-based CDN purging. Request-level de-duplication is handled
 * one layer up with React `cache()` (see lib/content/pages.ts).
 *
 * Preview: Contentful serves drafts from the SAME endpoint when the request
 * uses the Content Preview API token AND the query passes `preview: true` on
 * its collections. CONVENTION: query documents declare
 * `$preview: Boolean = false` and thread it into every collection; this
 * client injects the variable automatically whenever the document mentions
 * `$preview`, so callers never set it by hand.
 *
 * Resilience:
 *  - 429s retry with exponential backoff, honoring `Retry-After` /
 *    `X-Contentful-RateLimit-Reset` when sent.
 *  - Network failures retry; GraphQL/HTTP errors do not (they're not transient).
 *  - Every attempt carries a hard timeout so a hung origin can't pin an SSR
 *    render open.
 */
import type { CmsQueryOptions } from "../types";
import { getContentfulConfig, getGraphqlEndpoint } from "./config";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 300;
const RETRY_MAX_MS = 4_000;
const REQUEST_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, res: Response | null): number {
  const headerValue =
    res?.headers.get("retry-after") ?? res?.headers.get("x-contentful-ratelimit-reset");
  const seconds = Number(headerValue);
  if (headerValue && Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, RETRY_MAX_MS);
  }
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

export async function fetchGraphQL<T>(
  query: string,
  options: CmsQueryOptions = {},
): Promise<T> {
  const config = getContentfulConfig();
  const isPreview = Boolean(options.preview);

  if (isPreview && !config.previewToken) {
    throw new Error(
      "[contentful] Preview requested but CONTENTFUL_PREVIEW_TOKEN is not set",
    );
  }

  const endpoint = getGraphqlEndpoint(config);
  const token = isPreview ? (config.previewToken as string) : config.deliveryToken;

  const variables: Record<string, unknown> = { ...(options.variables ?? {}) };
  if (query.includes("$preview")) variables.preview = isPreview;

  const body = JSON.stringify({ query, variables });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Fresh timeout per attempt; combined with the caller's signal if given.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
        cache: "no-store",
        signal,
      });

      if (res.status === 429) {
        lastError = new Error("[contentful] GraphQL rate limited (429)");
        if (attempt < MAX_RETRIES) {
          await delay(retryDelayMs(attempt, res));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[contentful] GraphQL HTTP ${res.status}: ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as GraphQLResponse<T>;
      if (json.errors?.length) {
        // GraphQL-level errors (bad query, complexity limit) are not transient.
        throw new Error(
          `[contentful] GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
        );
      }
      if (!json.data) {
        throw new Error("[contentful] GraphQL response contained no data");
      }
      return json.data;
    } catch (error) {
      lastError = error;
      // The caller aborting is final; our per-attempt timeout is retryable.
      if (options.signal?.aborted) break;
      const message = error instanceof Error ? error.message : "";
      const retryable = !message.includes("GraphQL errors") && !message.includes("GraphQL HTTP");
      if (attempt < MAX_RETRIES && retryable) {
        await delay(retryDelayMs(attempt, null));
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("[contentful] fetchGraphQL failed");
}
