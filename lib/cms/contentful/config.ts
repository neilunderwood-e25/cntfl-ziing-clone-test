/**
 * Contentful configuration.
 *
 * Env vars are read lazily (only when a request actually needs them) so that
 * `next build` and module import never fail when credentials are absent.
 * Required vars throw at call time with a clear message; `isConfigured()`
 * lets callers probe without throwing (the catch-all page renders a setup
 * notice instead of crashing an unconfigured checkout of this boilerplate).
 */

export type ContentfulConfig = {
  spaceId: string;
  environment: string;
  /** Content Delivery API token (published content). */
  deliveryToken: string;
  /** Content Preview API token (draft content). */
  previewToken?: string;
  /** Shared secret that unlocks `?preview=<secret>` URLs. */
  previewSecret?: string;
  graphqlHost: string;
};

const REQUIRED_VARS = ["CONTENTFUL_SPACE_ID", "CONTENTFUL_DELIVERY_TOKEN"] as const;

export function isContentfulConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[contentful] Missing required environment variable: ${name}`);
  }
  return value;
}

export function getContentfulConfig(): ContentfulConfig {
  return {
    spaceId: required("CONTENTFUL_SPACE_ID"),
    environment: process.env.CONTENTFUL_ENVIRONMENT || "master",
    deliveryToken: required("CONTENTFUL_DELIVERY_TOKEN"),
    previewToken: process.env.CONTENTFUL_PREVIEW_TOKEN,
    previewSecret: process.env.CONTENTFUL_PREVIEW_SECRET,
    graphqlHost: process.env.CONTENTFUL_GRAPHQL_HOST || "graphql.contentful.com",
  };
}

/**
 * GraphQL Content API endpoint. Published and draft content share the same
 * endpoint — draft access is selected by the bearer token (CPA vs CDA) plus
 * `preview: true` arguments in the query (see client.ts).
 */
export function getGraphqlEndpoint(config: ContentfulConfig): string {
  return `https://${config.graphqlHost}/content/v1/spaces/${config.spaceId}/environments/${config.environment}`;
}
