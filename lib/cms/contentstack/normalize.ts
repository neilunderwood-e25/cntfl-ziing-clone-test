/**
 * Contentstack GraphQL returns every reference/modular/asset field as a
 * Relay-style connection: `fooConnection { edges { node { … } } }`. That shape
 * is painful to consume in components, so we normalize it once, right after
 * fetching, into plain arrays keyed by the field's real name (`foo`).
 *
 * Generic: any `*Connection` anywhere in the tree is flattened, so new
 * sections/fields need no bespoke normalization code. Single references also
 * become 1-element arrays (consume with `[0]`).
 */
type Json = unknown;

function isConnection(value: unknown): value is { edges: Array<{ node?: unknown } | null> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "edges" in value &&
    Array.isArray((value as { edges: unknown }).edges)
  );
}

export function flattenConnections<T = Json>(input: Json): T {
  if (Array.isArray(input)) {
    return input.map((item) => flattenConnections(item)) as T;
  }

  if (typeof input === "object" && input !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isConnection(value)) {
        const nodes = value.edges
          .map((edge) => (edge ? flattenConnections(edge.node) : null))
          .filter((node) => node !== null && node !== undefined);
        const flatKey = key.endsWith("Connection")
          ? key.slice(0, -"Connection".length)
          : key;
        out[flatKey] = nodes;
      } else {
        out[key] = flattenConnections(value);
      }
    }
    return out as T;
  }

  return input as T;
}
