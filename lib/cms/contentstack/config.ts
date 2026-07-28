/**
 * Contentstack configuration.
 *
 * Env vars are read lazily (only when a request actually needs them) so that
 * `next build` and module import never fail when credentials are absent.
 * Required vars throw at call time with a clear message; `isConfigured()`
 * lets callers probe without throwing (the catch-all page renders a setup
 * notice instead of crashing an unconfigured checkout of this boilerplate).
 */

export type ContentstackConfig = {
  apiKey: string;
  deliveryToken: string;
  previewToken?: string;
  environment: string;
  branch: string;
  graphqlHost: string;
  previewGraphqlHost: string;
};

const REQUIRED_VARS = [
  "CONTENTSTACK_API_KEY",
  "CONTENTSTACK_DELIVERY_TOKEN",
  "CONTENTSTACK_ENVIRONMENT",
] as const;

export function isContentstackConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[contentstack] Missing required environment variable: ${name}`);
  }
  return value;
}

export function getContentstackConfig(): ContentstackConfig {
  return {
    apiKey: required("CONTENTSTACK_API_KEY"),
    deliveryToken: required("CONTENTSTACK_DELIVERY_TOKEN"),
    previewToken: process.env.CONTENTSTACK_PREVIEW_TOKEN,
    environment: required("CONTENTSTACK_ENVIRONMENT"),
    branch: process.env.CONTENTSTACK_BRANCH || "main",
    graphqlHost: process.env.CONTENTSTACK_GRAPHQL_HOST || "graphql.contentstack.com",
    previewGraphqlHost:
      process.env.CONTENTSTACK_PREVIEW_GRAPHQL_HOST || "graphql-preview.contentstack.com",
  };
}

/**
 * GraphQL Content Delivery endpoint. The preview host is used when rendering
 * Contentstack Live Preview so draft content is returned.
 */
export function getGraphqlEndpoint(
  config: ContentstackConfig,
  { preview }: { preview: boolean },
): string {
  const host = preview ? config.previewGraphqlHost : config.graphqlHost;
  return `https://${host}/stacks/${config.apiKey}?environment=${config.environment}`;
}
