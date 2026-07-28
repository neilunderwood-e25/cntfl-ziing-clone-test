/**
 * Lean Contentstack GraphQL transport.
 *
 * Native `fetch` POST — no Apollo/SDK runtime. We deliberately do NOT cache in
 * the Next data layer (`cache: "no-store"`): this is a full-SSR app where the
 * CDN is the sole cache tier (see docs/playbooks/caching.md), and caching here
 * would break tag-based CDN purging. Request-level de-duplication is handled
 * one layer up with React `cache()` (see lib/content/pages.ts).
 *
 * Resilience:
 *  - 429s retry with exponential backoff, honoring `Retry-After` when sent.
 *  - Network failures retry; GraphQL/HTTP errors do not (they're not transient).
 *  - Every attempt carries a hard timeout so a hung origin can't pin an SSR
 *    render open.
 */
import type { CmsQueryOptions } from "../types";
import { getContentstackConfig, getGraphqlEndpoint } from "./config";

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

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader && Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, RETRY_MAX_MS);
  }
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

export async function fetchGraphQL<T>(
  query: string,
  options: CmsQueryOptions = {},
): Promise<T> {
  const config = getContentstackConfig();
  const preview = options.preview;
  const isPreview = Boolean(preview?.data.hash);
  const endpoint = getGraphqlEndpoint(config, { preview: isPreview });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    access_token: config.deliveryToken,
    branch: config.branch,
  };

  if (isPreview && preview) {
    if (!config.previewToken) {
      throw new Error(
        "[contentstack] Live preview requested but CONTENTSTACK_PREVIEW_TOKEN is not set",
      );
    }
    headers.preview_token = config.previewToken;
    headers.live_preview = preview.data.hash as string;
    headers.include_applied_variants = "true";
  }

  const body = JSON.stringify({ query, variables: options.variables ?? {} });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Fresh timeout per attempt; combined with the caller's signal if given.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        signal,
      });

      if (res.status === 429) {
        lastError = new Error("[contentstack] GraphQL rate limited (429)");
        if (attempt < MAX_RETRIES) {
          await delay(retryDelayMs(attempt, res.headers.get("retry-after")));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[contentstack] GraphQL HTTP ${res.status}: ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as GraphQLResponse<T>;
      if (json.errors?.length) {
        // GraphQL-level errors (bad query, depth/cost limits) are not transient.
        throw new Error(
          `[contentstack] GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
        );
      }
      if (!json.data) {
        throw new Error("[contentstack] GraphQL response contained no data");
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
    : new Error("[contentstack] fetchGraphQL failed");
}
